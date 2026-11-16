use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
pub const RATE: usize = 16000;
pub struct Normalizer {
    rate: u32,
    resampler: Option<SincFixedIn<f32>>,
    pending: Vec<f32>,
    skip: usize,
    input_count: usize,
    output_count: usize,
    finished: bool,
}
impl Normalizer {
    pub fn new(rate: u32) -> Result<Self, String> {
        if !(8000..=192000).contains(&rate) {
            return Err("Unsupported capture sample rate".into());
        }
        let resampler = if rate == RATE as u32 {
            None
        } else {
            Some(
                SincFixedIn::<f32>::new(
                    RATE as f64 / rate as f64,
                    1.0,
                    SincInterpolationParameters {
                        sinc_len: 128,
                        f_cutoff: 0.92,
                        interpolation: SincInterpolationType::Linear,
                        oversampling_factor: 128,
                        window: WindowFunction::BlackmanHarris2,
                    },
                    1024,
                    1,
                )
                .map_err(|e| e.to_string())?,
            )
        };
        let skip = resampler.as_ref().map(|r| r.output_delay()).unwrap_or(0);
        Ok(Self {
            rate,
            resampler,
            pending: Vec::with_capacity(2048),
            skip,
            input_count: 0,
            output_count: 0,
            finished: false,
        })
    }
    pub fn push(&mut self, input: &[f32]) -> Result<Vec<f32>, String> {
        if self.finished {
            return Err("Resampler is already finalized".into());
        }
        self.input_count += input.len();
        if self.rate == RATE as u32 {
            self.output_count += input.len();
            return Ok(input
                .iter()
                .map(|v| {
                    if v.is_finite() {
                        v.clamp(-1.0, 1.0)
                    } else {
                        0.0
                    }
                })
                .collect());
        }
        self.pending.extend(input.iter().map(|v| {
            if v.is_finite() {
                v.clamp(-1.0, 1.0)
            } else {
                0.0
            }
        }));
        self.process_pending()
    }
    fn process_pending(&mut self) -> Result<Vec<f32>, String> {
        let mut output = Vec::new();
        while self.pending.len() >= 1024 {
            let block: Vec<f32> = self.pending.drain(..1024).collect();
            let wave = self
                .resampler
                .as_mut()
                .unwrap()
                .process(&[block], None)
                .map_err(|e| e.to_string())?;
            let drop = self.skip.min(wave[0].len());
            self.skip -= drop;
            output.extend_from_slice(&wave[0][drop..]);
        }
        self.output_count += output.len();
        Ok(output)
    }
    pub fn finish(&mut self) -> Result<Vec<f32>, String> {
        if self.finished {
            return Ok(Vec::new());
        }
        self.finished = true;
        if self.rate == RATE as u32 || self.input_count == 0 {
            return Ok(Vec::new());
        }
        let expected = (self.input_count as f64 * RATE as f64 / self.rate as f64).round() as usize;
        let needed = expected.saturating_sub(self.output_count);
        let mut out = Vec::new();
        while out.len() < needed {
            self.pending.resize(1024, 0.0);
            out.extend(self.process_pending()?);
        }
        out.truncate(needed);
        self.output_count = expected;
        Ok(out)
    }
}
pub fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|x| x * x).sum::<f32>() / samples.len() as f32).sqrt()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resampling_is_streaming_and_rejects_alias_energy() {
        let make = |frequency: f32| {
            let mut normal = Normalizer::new(48000).unwrap();
            let mut out = Vec::new();
            for block in (0..48000).collect::<Vec<_>>().chunks(480) {
                let input: Vec<f32> = block
                    .iter()
                    .map(|i| (2.0 * std::f32::consts::PI * frequency * (*i as f32) / 48000.0).sin())
                    .collect();
                out.extend(normal.push(&input).unwrap());
            }
            out.extend(normal.finish().unwrap());
            out
        };
        let speech = make(1000.0);
        let alias = make(12000.0);
        assert_eq!(speech.len(), 16000);
        assert!(rms(&speech) > 0.6);
        assert!(rms(&alias) < 0.08);
    }
    #[test]
    fn fractional_rates_and_exact_block_endings_keep_duration() {
        for rate in [8000, 44100, 48000, 96000] {
            for count in [1, 1024, 44117] {
                let mut n = Normalizer::new(rate).unwrap();
                let mut out = n.push(&vec![0.1; count]).unwrap();
                out.extend(n.finish().unwrap());
                assert_eq!(
                    out.len(),
                    (count as f64 * RATE as f64 / rate as f64).round() as usize
                );
                assert!(n.finish().unwrap().is_empty());
            }
        }
    }
    #[test]
    fn invalid_values_are_not_forwarded() {
        assert_eq!(
            Normalizer::new(16000)
                .unwrap()
                .push(&[f32::NAN, 2.0])
                .unwrap(),
            vec![0.0, 1.0]
        );
    }
}
