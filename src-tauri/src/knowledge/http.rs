use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::sync::{watch, Mutex};
pub struct Lane(pub Mutex<Instant>);
impl Default for Lane {
    fn default() -> Self {
        Self(Mutex::new(Instant::now()))
    }
}
pub async fn cancellable<F, T>(cancel: &mut watch::Receiver<bool>, future: F) -> Result<T, String>
where
    F: std::future::Future<Output = Result<T, String>>,
{
    if *cancel.borrow() {
        return Err("Request cancelled".into());
    }
    tokio::select! {result=future=>result,_=cancel.changed()=>Err("Request cancelled".into())}
}
pub fn retry_delay(value: Option<&str>, attempt: usize) -> Duration {
    let seconds = value
        .and_then(|x| x.trim().parse::<f64>().ok())
        .filter(|x| x.is_finite() && *x >= 0.)
        .unwrap_or(20. * 2f64.powi(attempt as i32));
    Duration::from_secs_f64(seconds.clamp(1., 90.))
}
pub async fn post(
    lane: &Lane,
    url: &str,
    key: &str,
    body: &Value,
    label: &str,
    cancel: &mut watch::Receiver<bool>,
    progress: &(dyn Fn(&str, &str) + Send + Sync),
) -> Result<Value, String> {
    let mut next = cancellable(cancel, async { Ok(lane.0.lock().await) }).await?;
    if *next > Instant::now() {
        let wait = next.duration_since(Instant::now());
        progress(
            "waiting",
            &format!("Waiting for {label} quota · {} s", wait.as_secs() + 1),
        );
        cancellable(cancel, async {
            tokio::time::sleep(wait).await;
            Ok(())
        })
        .await?;
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(100))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not create the knowledge provider client")?;
    for attempt in 0..3 {
        let mut response = cancellable(cancel, async {
            client
                .post(url)
                .bearer_auth(key)
                .json(body)
                .send()
                .await
                .map_err(|_| {
                    format!("{label} connection failed or timed out. Saved sources are unchanged.")
                })
        })
        .await?;
        let status = response.status();
        if status.as_u16() == 429 || status.is_server_error() {
            let delay = retry_delay(
                response
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok()),
                attempt,
            );
            *next = Instant::now() + delay;
            if attempt == 2 {
                return Err(format!("{label} is rate-limited or unavailable. Try again later; cached indexing progress is kept."));
            }
            progress(
                "waiting",
                &format!(
                    "{label} rate limit · retrying in {} s ({}/3)",
                    delay.as_secs(),
                    attempt + 1
                ),
            );
            cancellable(cancel, async {
                tokio::time::sleep(delay).await;
                Ok(())
            })
            .await?;
            continue;
        }
        if !status.is_success() {
            return Err(match status.as_u16(){401|403=>format!("{label} rejected the API key or project access. Check its native credential and model permissions."),402=>format!("{label} credits are unavailable. Buddy did not enable billing."),_=>format!("{label} rejected this request (HTTP {}). Check model availability and project limits.",status.as_u16())});
        }
        if response
            .content_length()
            .is_some_and(|n| n > 8 * 1024 * 1024)
        {
            return Err(format!("{label} response exceeded the safe size limit"));
        }
        // Providers expose different headers; only an explicit exhausted request bucket sets a cooldown.
        if response
            .headers()
            .get("x-ratelimit-remaining-requests")
            .and_then(|v| v.to_str().ok())
            == Some("0")
        {
            *next = Instant::now()
                + retry_delay(
                    response
                        .headers()
                        .get("x-ratelimit-reset-requests")
                        .and_then(|v| v.to_str().ok()),
                    0,
                );
        }
        return cancellable(cancel, async {
            let mut bytes = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| format!("{label} response could not be read"))?
            {
                if bytes.len() + chunk.len() > 8 * 1024 * 1024 {
                    return Err(format!("{label} response exceeded the safe size limit"));
                }
                bytes.extend_from_slice(&chunk);
            }
            serde_json::from_slice(&bytes)
                .map_err(|_| format!("{label} returned an invalid response"))
        })
        .await;
    }
    Err(format!("{label} did not complete the request"))
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    fn server(
        responses: Vec<(&'static str, &'static str)>,
        delay: Duration,
    ) -> (String, std::thread::JoinHandle<()>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let thread = std::thread::spawn(move || {
            for (status, body) in responses {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut data = Vec::new();
                let mut buffer = [0; 4096];
                loop {
                    let n = socket.read(&mut buffer).unwrap();
                    if n == 0 {
                        break;
                    }
                    data.extend_from_slice(&buffer[..n]);
                    if let Some(end) = data.windows(4).position(|w| w == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&data[..end]);
                        let len = headers
                            .lines()
                            .find_map(|line| {
                                line.to_lowercase()
                                    .strip_prefix("content-length:")
                                    .and_then(|x| x.trim().parse::<usize>().ok())
                            })
                            .unwrap_or(0);
                        if data.len() >= end + 4 + len {
                            break;
                        }
                    }
                }
                std::thread::sleep(delay);
                let response=format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nRetry-After: 1\r\nConnection: close\r\n\r\n{body}",body.len());
                let _ = socket.write_all(response.as_bytes());
            }
        });
        (format!("http://{address}/test"), thread)
    }
    #[tokio::test]
    async fn actual_http_retries_429_then_returns_valid_json() {
        let (url, thread) = server(
            vec![("429 Too Many Requests", "{}"), ("200 OK", "{\"ok\":true}")],
            Duration::ZERO,
        );
        let (_tx, mut cancel) = watch::channel(false);
        let phases = std::sync::Mutex::new(Vec::new());
        let value = post(
            &Lane::default(),
            &url,
            "not-a-real-key",
            &serde_json::json!({}),
            "Test",
            &mut cancel,
            &|phase, _| phases.lock().unwrap().push(phase.to_string()),
        )
        .await
        .unwrap();
        assert_eq!(value["ok"], true);
        assert!(phases.lock().unwrap().contains(&"waiting".to_string()));
        thread.join().unwrap();
    }
    #[tokio::test]
    async fn auth_bodies_are_redacted_and_not_retried() {
        let (url, thread) = server(
            vec![("401 Unauthorized", "secret-provider-response")],
            Duration::ZERO,
        );
        let (_tx, mut cancel) = watch::channel(false);
        let error = post(
            &Lane::default(),
            &url,
            "secret-test-token",
            &serde_json::json!({}),
            "Test",
            &mut cancel,
            &|_, _| {},
        )
        .await
        .unwrap_err();
        assert!(!error.contains("secret"));
        assert!(error.contains("API key"));
        thread.join().unwrap();
    }
    #[tokio::test]
    async fn cancellation_interrupts_a_real_inflight_request_and_lane_wait() {
        let (url, thread) = server(vec![("200 OK", "{}")], Duration::from_secs(1));
        let (tx, mut cancel) = watch::channel(false);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(80)).await;
            let _ = tx.send(true);
        });
        let start = Instant::now();
        assert!(post(
            &Lane::default(),
            &url,
            "test-key",
            &serde_json::json!({}),
            "Test",
            &mut cancel,
            &|_, _| {}
        )
        .await
        .unwrap_err()
        .contains("cancelled"));
        assert!(start.elapsed() < Duration::from_millis(600));
        thread.join().unwrap();
        let lane = Lane(Mutex::new(Instant::now() + Duration::from_secs(60)));
        let (tx, mut cancel) = watch::channel(false);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(30)).await;
            let _ = tx.send(true);
        });
        assert!(post(
            &lane,
            "http://127.0.0.1:1",
            "test-key",
            &serde_json::json!({}),
            "Test",
            &mut cancel,
            &|_, _| {}
        )
        .await
        .unwrap_err()
        .contains("cancelled"));
    }
    #[test]
    fn retry_after_is_bounded_and_invalid_values_back_off() {
        assert_eq!(retry_delay(Some("2"), 0).as_secs(), 2);
        assert_eq!(retry_delay(Some("999999"), 0).as_secs(), 90);
        assert_eq!(retry_delay(Some("NaN"), 1).as_secs(), 40);
        assert_eq!(retry_delay(None, 0).as_secs(), 20);
    }
}
