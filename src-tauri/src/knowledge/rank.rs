use super::Source;
use std::collections::HashMap;
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.;
    }
    let (mut dot, mut aa, mut bb) = (0., 0., 0.);
    for (x, y) in a.iter().zip(b) {
        dot += x * y;
        aa += x * x;
        bb += y * y;
    }
    if aa == 0. || bb == 0. {
        0.
    } else {
        dot / (aa.sqrt() * bb.sqrt())
    }
}
pub fn fuse(sources: &[Source], dense: &[Vec<f32>], query: &[f32]) -> Vec<usize> {
    let mut lexical: Vec<usize> = (0..sources.len())
        .filter(|i| sources[*i].lexical_score > 0.)
        .collect();
    lexical.sort_by(|a, b| {
        sources[*b]
            .lexical_score
            .total_cmp(&sources[*a].lexical_score)
    });
    let mut semantic: Vec<usize> = (0..sources.len()).collect();
    semantic.sort_by(|a, b| cosine(&dense[*b], query).total_cmp(&cosine(&dense[*a], query)));
    let mut scores = HashMap::<usize, f64>::new();
    for list in [&lexical, &semantic] {
        for (rank, index) in list.iter().take(60).enumerate() {
            *scores.entry(*index).or_default() += 1. / (60. + rank as f64 + 1.);
        }
    }
    let mut merged: Vec<(usize, f64)> = scores.into_iter().collect();
    merged.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
    merged.into_iter().map(|x| x.0).take(32).collect()
}
pub fn citation_ids(answer: &str, maximum: usize) -> Result<Vec<String>, String> {
    let mut result = Vec::new();
    let bytes = answer.as_bytes();
    let mut i = 0;
    while i + 2 < bytes.len() {
        if bytes[i] == b'[' && bytes[i + 1] == b'S' {
            let start = i + 2;
            let mut end = start;
            while end < bytes.len() && bytes[end].is_ascii_digit() {
                end += 1;
            }
            if end == start || end >= bytes.len() || bytes[end] != b']' {
                return Err(
                    "The answer contained an invalid source reference. Retry the question.".into(),
                );
            }
            let n = answer[start..end]
                .parse::<usize>()
                .map_err(|_| "Invalid source reference")?;
            if n == 0 || n > maximum {
                return Err("The answer cited an unknown source and was discarded.".into());
            }
            let id = format!("S{n}");
            if !result.contains(&id) {
                result.push(id);
            }
            i = end;
        }
        i += 1;
    }
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn citations_cannot_escape_the_evidence_bundle() {
        assert_eq!(
            citation_ids("A fact [S2]. Another [S2].", 2).unwrap(),
            vec!["S2"]
        );
        assert!(citation_ids("[S3]", 2).is_err());
        assert!(citation_ids("[S0]", 2).is_err());
        assert!(citation_ids("[S1", 2).is_err());
    }
    #[test]
    fn cosine_handles_invalid_dimensions_and_zero_norm() {
        assert_eq!(cosine(&[1.], &[1., 2.]), 0.);
        assert_eq!(cosine(&[0.], &[1.]), 0.);
        assert!((cosine(&[1., 0.], &[1., 0.]) - 1.).abs() < 1e-5);
    }
}
