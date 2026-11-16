//! The ScreenCaptureKit buffer contract, also testable without an Apple SDK.
pub struct Plane<'a> {
    pub bytes: &'a [u8],
    pub channels: usize,
}
pub fn downmix(
    planes: &[Plane<'_>],
    frames: usize,
    channels: usize,
    rate: u32,
) -> Result<Vec<f32>, &'static str> {
    if !(8_000..=192_000).contains(&rate)
        || frames == 0
        || frames > rate as usize
        || !(1..=8).contains(&channels)
        || planes.is_empty()
        || planes.len() > 8
        || planes.iter().any(|p| {
            p.channels == 0 || p.channels > channels || p.bytes.len() != frames * p.channels * 4
        })
        || planes.iter().map(|p| p.channels).sum::<usize>() != channels
    {
        return Err("Unexpected macOS audio buffer layout");
    }
    let mut mono = vec![0.; frames];
    for plane in planes {
        for (frame, samples) in plane.bytes.chunks_exact(plane.channels * 4).enumerate() {
            for bytes in samples.chunks_exact(4) {
                let value = f32::from_ne_bytes(bytes.try_into().unwrap());
                if !value.is_finite() {
                    return Err("Invalid macOS audio sample");
                }
                // Divide before summing to avoid overflow on malformed samples.
                mono[frame] += value.clamp(-1., 1.) / channels as f32;
            }
        }
    }
    Ok(mono)
}
pub fn capture_start(
    elapsed: f64,
    age: f64,
    frames: usize,
    rate: u32,
) -> Result<f64, &'static str> {
    // Age is measured from the host presentation clock at the native callback.
    // Reject stale buffers rather than attaching them to current conversation.
    if rate == 0
        || !elapsed.is_finite()
        || elapsed < 0.
        || !age.is_finite()
        || age < -0.02
        || age > 2.
        || age + 0.05 < frames as f64 / rate as f64
    {
        return Err("macOS audio delivery timestamp is invalid or stale");
    }
    Ok((elapsed - age.max(0.)).max(0.))
}
#[cfg(test)]
mod tests {
    use super::*;
    fn bytes(values: &[f32]) -> Vec<u8> {
        values.iter().flat_map(|v| v.to_ne_bytes()).collect()
    }
    #[test]
    fn planar_and_interleaved_stereo_produce_identical_mono() {
        let left = bytes(&[0.2, 0.8]);
        let right = bytes(&[0.6, -0.4]);
        let interleaved = bytes(&[0.2, 0.6, 0.8, -0.4]);
        let a = downmix(
            &[
                Plane {
                    bytes: &left,
                    channels: 1,
                },
                Plane {
                    bytes: &right,
                    channels: 1,
                },
            ],
            2,
            2,
            48000,
        )
        .unwrap();
        let b = downmix(
            &[Plane {
                bytes: &interleaved,
                channels: 2,
            }],
            2,
            2,
            48000,
        )
        .unwrap();
        assert_eq!(a, b);
        assert_eq!(a, vec![0.4, 0.2]);
    }
    #[test]
    fn malformed_layouts_and_nonfinite_samples_never_reach_the_resampler() {
        let b = bytes(&[1., f32::NAN]);
        assert!(downmix(
            &[Plane {
                bytes: &b,
                channels: 1
            }],
            2,
            1,
            48000
        )
        .is_err());
        let b = bytes(&[0., 0.]);
        for (frames, channels, rate) in
            [(3, 1, 48000), (2, 2, 48000), (2, 1, 0), (192001, 1, 48000)]
        {
            assert!(downmix(
                &[Plane {
                    bytes: &b,
                    channels: 1
                }],
                frames,
                channels,
                rate
            )
            .is_err());
        }
    }
    #[test]
    fn host_clock_accounts_for_callback_delay_and_rejects_stale_audio() {
        assert_eq!(capture_start(10., 0.25, 480, 48000).unwrap(), 9.75);
        assert_eq!(capture_start(0.01, 0.02, 480, 48000).unwrap(), 0.);
        for age in [f64::NAN, 3., -1.] {
            assert!(capture_start(5., age, 480, 48000).is_err());
        }
    }
}
