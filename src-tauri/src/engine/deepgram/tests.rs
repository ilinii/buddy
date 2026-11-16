use super::*;
use std::sync::Mutex;

type Events = Arc<Mutex<Vec<(String, Option<Segment>)>>>;
fn collect() -> (Updates, Events) {
    let events: Events = Arc::new(Mutex::new(Vec::new()));
    let target = events.clone();
    (
        Arc::new(move |kind, _, segment, _| target.lock().unwrap().push((kind.into(), segment))),
        events,
    )
}
fn response(finalized: bool, start: f64, duration: f64, words: serde_json::Value) -> Response {
    serde_json::from_value(serde_json::json!({"type":"Results","start":start,"duration":duration,"is_final":finalized,"channel":{"alternatives":[{"transcript":"Hello again.","words":words}]}})).unwrap()
}
fn timeline() -> Timeline {
    let mut t = Timeline::default();
    for i in 0..20 {
        t.push(42.0 + i as f64 / 10., vec![0.1; PACKET]).unwrap();
    }
    t
}
#[test]
fn interim_is_replaceable_and_final_evidence_is_timestamped_and_deduplicated() {
    let mut t = timeline();
    let (updates, events) = collect();
    results(
        response(false, 0., 1., serde_json::json!([])),
        &mut t,
        0,
        RATE as u64 * 2,
        0,
        Channel::System,
        "test",
        &updates,
    )
    .unwrap();
    assert_eq!(t.committed, 0);
    assert!(!events.lock().unwrap()[0].1.as_ref().unwrap().r#final);
    let words = serde_json::json!([{"start":0.1,"end":0.5,"word":"Hello","speaker":0},{"start":0.6,"end":0.9,"word":"again","punctuated_word":"again.","speaker":1}]);
    results(
        response(true, 0., 1., words.clone()),
        &mut t,
        0,
        RATE as u64 * 2,
        0,
        Channel::System,
        "test",
        &updates,
    )
    .unwrap();
    results(
        response(true, 0., 1., words),
        &mut t,
        0,
        RATE as u64 * 2,
        0,
        Channel::System,
        "test",
        &updates,
    )
    .unwrap();
    let e = events.lock().unwrap();
    let finals: Vec<_> = e
        .iter()
        .filter_map(|(_, s)| s.as_ref().filter(|s| s.r#final))
        .collect();
    assert_eq!(finals.len(), 2);
    assert_eq!(finals[0].start, 42.1);
    assert_eq!(finals[1].end, 42.9);
    assert_ne!(finals[0].id, finals[1].id);
    assert!(finals[0].speaker.as_ref().unwrap().contains("voice 1"));
    assert!(finals.iter().all(|s| s.channel == Channel::System));
}
#[test]
fn replay_offsets_and_capture_gaps_preserve_source_time() {
    let mut t = timeline();
    t.commit(RATE as u64);
    let (updates, events) = collect();
    results(
        response(
            true,
            0.,
            0.5,
            serde_json::json!([{"start":0.1,"end":0.4,"word":"again"}]),
        ),
        &mut t,
        RATE as u64,
        RATE as u64 * 2,
        1,
        Channel::Microphone,
        "test",
        &updates,
    )
    .unwrap();
    assert_eq!(
        events
            .lock()
            .unwrap()
            .last()
            .unwrap()
            .1
            .as_ref()
            .unwrap()
            .start,
        43.1
    );
    let mut g = Timeline::default();
    g.push(0., vec![0.; PACKET]).unwrap();
    g.push(5., vec![0.; PACKET]).unwrap();
    assert_eq!(g.map(PACKET as u64, true).unwrap(), 0.1);
    assert_eq!(g.map(PACKET as u64, false).unwrap(), 5.);
}
#[test]
fn malformed_evidence_and_unbounded_backlog_are_rejected() {
    let (updates, _) = collect();
    for words in [
        serde_json::json!([]),
        serde_json::json!([{"start":0.7,"end":0.2,"word":"bad"}]),
        serde_json::json!([{"start":0.,"end":9.,"word":"bad"}]),
    ] {
        assert!(results(
            response(true, 0., 1., words),
            &mut timeline(),
            0,
            RATE as u64 * 2,
            0,
            Channel::System,
            "t",
            &updates
        )
        .is_err());
    }
    let mut t = Timeline::default();
    for i in 0..300 {
        t.push(i as f64 / 10., vec![0.; PACKET]).unwrap();
    }
    assert!(t
        .push(30., vec![0.; PACKET])
        .unwrap_err()
        .contains("30 seconds"));
}

#[test]
fn websocket_keeps_alive_flushes_and_waits_for_final_result() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (tcp, _) = listener.accept().unwrap();
        tcp.set_read_timeout(Some(Duration::from_secs(8))).unwrap();
        let mut ws = tokio_tungstenite::tungstenite::accept_hdr(
            tcp,
            |req: &tokio_tungstenite::tungstenite::handshake::server::Request, res| {
                assert_eq!(
                    req.headers().get("authorization").unwrap(),
                    "Token fixture-not-a-real-key"
                );
                Ok(res)
            },
        )
        .unwrap();
        let mut samples = 0;
        let mut flushed = false;
        let mut alive = false;
        loop {
            match ws.read().unwrap() {
                Message::Binary(bytes) => {
                    assert!(bytes.len() <= PACKET * 2);
                    samples += bytes.len() / 2;
                    if samples == PACKET {
                        ws.send(Message::text(
                            r#"{"type":"UtteranceEnd","channel":[0,1],"last_word_end":0.09}"#,
                        ))
                        .unwrap();
                        ws.send(Message::text(r#"{"type":"Results","start":0,"duration":0.1,"is_final":false,"channel":{"alternatives":[{"transcript":"Hello","words":[]}]}}"#)).unwrap();
                    }
                }
                Message::Text(text) => match serde_json::from_str::<serde_json::Value>(&text)
                    .unwrap()["type"]
                    .as_str()
                    .unwrap()
                {
                    "KeepAlive" => alive = true,
                    "Finalize" => {
                        assert_eq!(samples, PACKET, "Finalize must precede post-pause audio");
                        flushed = true;
                    }
                    "CloseStream" => {
                        assert!(alive && flushed);
                        assert_eq!(samples, PACKET * 2);
                        ws.send(Message::text(r#"{"type":"Results","start":0,"duration":0.2,"is_final":true,"channel":{"alternatives":[{"transcript":"Hello.","words":[{"start":0.01,"end":0.19,"word":"hello","punctuated_word":"Hello."}]}]}}"#)).unwrap();
                        ws.send(Message::text(r#"{"type":"Metadata"}"#)).unwrap();
                        break;
                    }
                    other => panic!("Unexpected message {other}"),
                },
                _ => {}
            }
        }
    });
    let (updates, events) = collect();
    let ctl = Arc::new(Control::new());
    let stream = LiveStream::open(
        format!("ws://{address}"),
        "fixture-not-a-real-key".into(),
        Channel::Microphone,
        "test".into(),
        ctl,
        updates,
    )
    .unwrap();
    thread::sleep(Duration::from_millis(3350)); // no server data before audio; keep-alive must already run
    stream.push(3., vec![0.1; PACKET]).unwrap();
    stream.flush().unwrap();
    stream.push(3.1, vec![0.1; PACKET]).unwrap();
    thread::sleep(Duration::from_millis(350));
    stream.finish().unwrap();
    server.join().unwrap();
    let e = events.lock().unwrap();
    assert!(e.iter().any(|(k, s)| k == "interim" && s.is_some()));
    let final_s = e
        .iter()
        .find_map(|(k, s)| if k == "segment" { s.as_ref() } else { None })
        .unwrap();
    assert_eq!(final_s.text, "Hello.");
    assert_eq!(final_s.start, 3.01);
}

#[test]
fn websocket_reconnects_replays_only_uncommitted_audio_and_can_cancel() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        for attempt in 0..2 {
            let (tcp, _) = listener.accept().unwrap();
            tcp.set_read_timeout(Some(Duration::from_secs(8))).unwrap();
            let mut ws = tokio_tungstenite::tungstenite::accept(tcp).unwrap();
            let mut count = 0;
            loop {
                match ws.read().unwrap() {
                    Message::Binary(bytes) => {
                        count += bytes.len() / 2;
                        if attempt == 0 && count == PACKET {
                            ws.send(Message::text(r#"{"type":"Results","start":0,"duration":0.1,"is_final":true,"channel":{"alternatives":[{"transcript":"One.","words":[{"start":0.01,"end":0.09,"word":"one"}]}]}}"#)).unwrap();
                        }
                        if attempt == 0 && count == PACKET * 2 {
                            break;
                        }
                    }
                    Message::Text(text) if text.contains("CloseStream") => {
                        assert_eq!(attempt, 1);
                        assert_eq!(count, PACKET);
                        ws.send(Message::text(r#"{"type":"Results","start":0,"duration":0.1,"is_final":true,"channel":{"alternatives":[{"transcript":"Two.","words":[{"start":0.01,"end":0.09,"word":"two"}]}]}}"#)).unwrap();
                        ws.send(Message::text(r#"{"type":"Metadata"}"#)).unwrap();
                        break;
                    }
                    _ => {}
                }
            }
        }
    });
    let (updates, events) = collect();
    let ctl = Arc::new(Control::new());
    let stream = LiveStream::open(
        format!("ws://{address}"),
        "fixture".into(),
        Channel::System,
        "test".into(),
        ctl,
        updates,
    )
    .unwrap();
    stream.push(7., vec![0.1; PACKET]).unwrap();
    stream.push(7.1, vec![0.1; PACKET]).unwrap();
    stream.finish().unwrap();
    server.join().unwrap();
    let e = events.lock().unwrap();
    let finals: Vec<_> = e
        .iter()
        .filter_map(|(k, s)| if k == "segment" { s.as_ref() } else { None })
        .collect();
    assert_eq!(finals.len(), 2);
    assert!((finals[1].start - 7.11).abs() < 1e-9);
    // Dropping an idle connection must stop its worker, including a blocked receive.
    drop(e);
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (tcp, _) = listener.accept().unwrap();
        let _ws = tokio_tungstenite::tungstenite::accept(tcp).unwrap();
        thread::sleep(Duration::from_millis(300));
    });
    let (updates, _) = collect();
    let stream = LiveStream::open(
        format!("ws://{address}"),
        "fixture".into(),
        Channel::System,
        "cancel".into(),
        Arc::new(Control::new()),
        updates,
    )
    .unwrap();
    let start = std::time::Instant::now();
    drop(stream);
    assert!(start.elapsed() < Duration::from_secs(1));
    server.join().unwrap();
}

#[test]
fn handshake_failure_is_redacted_and_never_retried() {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (mut tcp, _) = listener.accept().unwrap();
        let mut request = [0; 4096];
        let _ = tcp.read(&mut request).unwrap();
        let body = "private-provider-body-and-fixture-key";
        write!(
            tcp,
            "HTTP/1.1 401 Unauthorized\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
    });
    let (updates, _) = collect();
    let result = LiveStream::open(
        format!("ws://{address}"),
        "fixture-key".into(),
        Channel::System,
        "auth".into(),
        Arc::new(Control::new()),
        updates,
    );
    let error = match result {
        Err(e) => e,
        Ok(_) => panic!("Unauthorized stream opened"),
    };
    assert!(error.contains("rejected the key"));
    assert!(!error.contains("private-provider"));
    assert!(!error.contains("fixture-key"));
    server.join().unwrap();
}

#[test]
#[ignore = "Uses the OS-stored Deepgram key and public JFK speech fixture; no microphone is opened"]
fn actual_deepgram_fixture() {
    let key = read_key().expect("Save the authorized Deepgram key in the OS credential store");
    let wav = std::env::var("BUDDY_DEEPGRAM_FIXTURE").expect("Set public fixture path");
    let mut reader = hound::WavReader::open(wav).unwrap();
    assert_eq!(reader.spec().sample_rate, RATE as u32);
    assert_eq!(reader.spec().channels, 1);
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.unwrap() as f32 / 32768.)
        .collect();
    let (updates, events) = collect();
    let clock = std::time::Instant::now();
    let first = Arc::new(Mutex::new(None));
    let first_copy = first.clone();
    let timed: Updates = Arc::new(move |kind, ch, seg, msg| {
        if kind == "error" {
            eprintln!(
                "Fixture streaming error: {}",
                msg.as_deref().unwrap_or("unknown")
            );
        }
        if kind == "interim" && seg.is_some() {
            first_copy
                .lock()
                .unwrap()
                .get_or_insert(clock.elapsed().as_secs_f64());
        }
        updates(kind, ch, seg, msg);
    });
    let stream = LiveStream::start(
        key,
        "en",
        Channel::System,
        "public-fixture".into(),
        Arc::new(Control::new()),
        timed,
    )
    .unwrap();
    for (i, packet) in samples.chunks(PACKET).enumerate() {
        stream
            .push(i as f64 * PACKET as f64 / RATE as f64, packet.to_vec())
            .unwrap();
        thread::sleep(Duration::from_secs_f64(packet.len() as f64 / RATE as f64));
    }
    stream.finish().unwrap();
    let e = events.lock().unwrap();
    let finals: Vec<_> = e
        .iter()
        .filter_map(|(k, s)| if k == "segment" { s.as_ref() } else { None })
        .collect();
    let text = finals
        .iter()
        .map(|s| s.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(text.to_lowercase().contains("country"));
    assert!(first.lock().unwrap().is_some());
    assert!(finals
        .iter()
        .all(|s| s.r#final && s.start >= 0. && s.end <= samples.len() as f64 / RATE as f64 + 0.01));
    let result = serde_json::json!({"fixture":"whisper.cpp public JFK sample","provider":"Deepgram","model":"nova-3","audioSeconds":samples.len() as f64/RATE as f64,"elapsedSeconds":clock.elapsed().as_secs_f64(),"firstInterimSeconds":*first.lock().unwrap(),"interimUpdates":e.iter().filter(|(k,s)|k=="interim"&&s.is_some()).count(),"segments":finals,"physicalDeviceVerified":false});
    if let Ok(path) = std::env::var("BUDDY_DEEPGRAM_RESULT") {
        std::fs::write(path, serde_json::to_vec_pretty(&result).unwrap()).unwrap();
    }
    println!("{result}");
}
