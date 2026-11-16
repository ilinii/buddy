use super::{
    runtime::Control,
    types::{Channel, Device},
};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{SyncSender, TrySendError},
        Arc,
    },
    thread,
    time::Duration,
};
static MICROPHONE_BUSY: AtomicBool = AtomicBool::new(false);
static SYSTEM_BUSY: AtomicBool = AtomicBool::new(false);
struct CapturePermit<'a>(&'a AtomicBool);
impl<'a> CapturePermit<'a> {
    fn acquire(flag: &'a AtomicBool) -> Result<Self, String> {
        if flag.swap(true, Ordering::AcqRel) {
            Err("A previous audio device is still releasing. Wait before retrying, or restart Buddy if the driver does not recover.".into())
        } else {
            Ok(Self(flag))
        }
    }
}
impl Drop for CapturePermit<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
pub struct Frame {
    pub epoch: u64,
    pub channel: Channel,
    pub samples: Vec<f32>,
    pub rate: u32,
    pub start: f64,
}
pub fn devices() -> Vec<Device> {
    let host = cpal::default_host();
    host.input_devices()
        .map(|ds| {
            ds.filter_map(|d| {
                Some(Device {
                    id: d.id().ok()?.to_string(),
                    name: d.description().ok()?.name().to_string(),
                })
            })
            .collect()
        })
        .unwrap_or_default()
}
fn deliver(
    tx: &SyncSender<Frame>,
    control: &Control,
    channel: Channel,
    samples: Vec<f32>,
    rate: u32,
) {
    if !control.capturing() || control.paused() || control.stopped() {
        return;
    }
    let end = control.elapsed();
    let start = (end - samples.len() as f64 / rate as f64).max(0.0);
    deliver_frame(tx, control, channel, samples, rate, start);
}
pub(super) fn deliver_frame(
    tx: &SyncSender<Frame>,
    control: &Control,
    channel: Channel,
    samples: Vec<f32>,
    rate: u32,
    start: f64,
) {
    if !control.capturing() || control.paused() || control.stopped() {
        return;
    }
    if let Err(error) = tx.try_send(Frame {
        epoch: control.epoch(),
        channel,
        samples,
        rate,
        start,
    }) {
        if matches!(error, TrySendError::Full(_)) {
            control.fail(
                "Capture buffer overflow. The session stopped instead of silently losing audio.",
            );
        }
    }
}
fn mic_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    tx: SyncSender<Frame>,
    ctl: Arc<Control>,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample + cpal::Sample,
    f32: cpal::FromSample<T>,
{
    let channels = config.channels as usize;
    let rate = config.sample_rate;
    let errors = ctl.clone();
    device.build_input_stream(*config,move|data:&[T],_|{if ctl.paused()||ctl.stopped(){return;}if data.len()>rate as usize*channels{ctl.fail("Unexpected audio callback size");return;}let mono:Vec<f32>=data.chunks_exact(channels).map(|frame|frame.iter().map(|s|s.to_sample::<f32>()).sum::<f32>()/channels as f32).collect();deliver(&tx,&ctl,Channel::Microphone,mono,rate);},move|_|errors.fail("Microphone disconnected or capture failed. Reconnect it before starting a new recording."),Some(Duration::from_secs(3))).map_err(|e|e.to_string())
}
pub fn microphone(
    device_id: Option<String>,
    tx: SyncSender<Frame>,
    ctl: Arc<Control>,
    ready: SyncSender<Result<(), String>>,
) {
    let _permit = match CapturePermit::acquire(&MICROPHONE_BUSY) {
        Ok(permit) => permit,
        Err(error) => {
            let _ = ready.send(Err(error.clone()));
            ctl.fail(&error);
            return;
        }
    };
    let run = || -> Result<(), String> {
        validate_permissions(true, false)?;
        #[cfg(target_os = "ios")]
        let audio_session = super::ios::AudioSession::begin()?;
        let host = cpal::default_host();
        let device = match device_id.filter(|id| id != "default") {
            Some(id) => host
                .device_by_id(&id.parse().map_err(|_| "Invalid native microphone ID")?)
                .ok_or("Selected microphone is unavailable")?,
            None => host
                .default_input_device()
                .ok_or("No microphone is available")?,
        };
        let supported = device.default_input_config().map_err(|e| e.to_string())?;
        let config = supported.config();
        let stream = match supported.sample_format() {
            cpal::SampleFormat::F32 => mic_stream::<f32>(&device, &config, tx.clone(), ctl.clone()),
            cpal::SampleFormat::I16 => mic_stream::<i16>(&device, &config, tx.clone(), ctl.clone()),
            cpal::SampleFormat::U16 => mic_stream::<u16>(&device, &config, tx.clone(), ctl.clone()),
            _ => Err("Unsupported microphone sample format".into()),
        }?;
        if ctl.stopped() {
            return Err("Microphone startup was cancelled".into());
        }
        stream.play().map_err(|e| e.to_string())?;
        let _ = ready.send(Ok(()));
        while !ctl.stopped() {
            #[cfg(target_os = "ios")]
            if let Some(issue) = audio_session.issue() {
                ctl.fail(issue);
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        drop(stream);
        Ok(())
    };
    if let Err(e) = run() {
        let _ = ready.send(Err(e.clone()));
        ctl.fail(&e);
    }
}
#[cfg(target_os = "windows")]
pub fn system(tx: SyncSender<Frame>, ctl: Arc<Control>, ready: SyncSender<Result<(), String>>) {
    let _permit = match CapturePermit::acquire(&SYSTEM_BUSY) {
        Ok(permit) => permit,
        Err(error) => {
            let _ = ready.send(Err(error.clone()));
            ctl.fail(&error);
            return;
        }
    };
    use std::collections::VecDeque;
    use wasapi::*;
    let run = || -> Result<(), String> {
        initialize_mta().ok().map_err(|e| e.to_string())?;
        struct Com;
        impl Drop for Com {
            fn drop(&mut self) {
                deinitialize();
            }
        }
        let _com = Com;
        let enumerator = DeviceEnumerator::new().map_err(|e| e.to_string())?;
        let device = enumerator
            .get_default_device(Direction::Render)
            .map_err(|e| e.to_string())?;
        let mut client = device.get_iaudioclient().map_err(|e| e.to_string())?;
        let format = WaveFormat::new(32, 32, SampleType::Float, 48000, 2, None);
        client
            .initialize_client(
                &format,
                Direction::Capture,
                StreamMode::PollingShared {
                    autoconvert: true,
                    buffer_duration_hns: 1_000_000,
                },
                None,
            )
            .map_err(|e| e.to_string())?;
        let capture = client.get_audiocaptureclient().map_err(|e| e.to_string())?;
        let mut bytes = VecDeque::with_capacity(38400);
        if ctl.stopped() {
            return Err("Computer audio startup was cancelled".into());
        }
        client.start_stream().map_err(|e| e.to_string())?;
        let _ = ready.send(Ok(()));
        while !ctl.stopped() {
            capture
                .read_from_device_to_deque(&mut bytes)
                .map_err(|e| e.to_string())?;
            if bytes.len() > 384000 {
                ctl.fail("System audio buffer overflow");
                break;
            }
            if bytes.len() >= 3840 {
                let bytes: Vec<u8> = bytes.drain(..).collect();
                let mono: Vec<f32> = bytes
                    .chunks_exact(8)
                    .map(|v| {
                        (f32::from_le_bytes(v[0..4].try_into().unwrap())
                            + f32::from_le_bytes(v[4..8].try_into().unwrap()))
                            * 0.5
                    })
                    .collect();
                deliver(&tx, &ctl, Channel::System, mono, 48000);
            }
            thread::sleep(Duration::from_millis(10));
        }
        let _ = client.stop_stream();
        Ok(())
    };
    if let Err(e) = run() {
        let _ = ready.send(Err(e.clone()));
        ctl.fail(&format!("System audio capture failed: {e}"));
    }
}
#[cfg(target_os = "macos")]
pub fn system(tx: SyncSender<Frame>, ctl: Arc<Control>, ready: SyncSender<Result<(), String>>) {
    let _permit = match CapturePermit::acquire(&SYSTEM_BUSY) {
        Ok(permit) => permit,
        Err(error) => {
            let _ = ready.send(Err(error.clone()));
            ctl.fail(&error);
            return;
        }
    };
    super::macos::system(tx, ctl, ready);
}

#[cfg(test)]
mod permit_tests {
    use super::*;
    #[test]
    fn a_pending_driver_start_cannot_spawn_a_second_open() {
        let flag = AtomicBool::new(false);
        let first = CapturePermit::acquire(&flag).unwrap();
        assert!(CapturePermit::acquire(&flag).is_err());
        drop(first);
        assert!(CapturePermit::acquire(&flag).is_ok());
    }
}
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn system(_tx: SyncSender<Frame>, ctl: Arc<Control>, ready: SyncSender<Result<(), String>>) {
    let e = "Native computer audio is unavailable on this platform".to_string();
    let _ = ready.send(Err(e.clone()));
    ctl.fail(&e);
}

pub fn system_supported() -> bool {
    #[cfg(target_os = "macos")]
    {
        super::macos::supported()
    }
    #[cfg(not(target_os = "macos"))]
    {
        cfg!(target_os = "windows")
    }
}
pub fn permissions() -> Option<super::types::AudioPermissions> {
    #[cfg(target_os = "ios")]
    {
        Some(super::ios::permissions())
    }
    #[cfg(target_os = "macos")]
    {
        Some(super::macos::permissions())
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        None
    }
}
pub fn validate_permissions(_microphone: bool, _system: bool) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        super::ios::validate(_microphone, _system)
    }
    #[cfg(target_os = "macos")]
    {
        super::macos::validate(_microphone, _system)
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        Ok(())
    }
}
