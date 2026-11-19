use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
};
use tokio::sync::watch;

type ActiveRequests = Arc<Mutex<HashMap<String, watch::Sender<bool>>>>;

#[derive(Default)]
pub struct Requests {
    active: ActiveRequests,
    early: Mutex<VecDeque<String>>,
}

pub struct Active {
    requests: ActiveRequests,
    id: String,
}
impl Drop for Active {
    fn drop(&mut self) {
        if let Ok(mut active) = self.requests.lock() {
            active.remove(&self.id);
        }
    }
}
impl Requests {
    pub fn start(&self, id: &str) -> Result<(Active, watch::Receiver<bool>), String> {
        uuid::Uuid::parse_str(id).map_err(|_| "Invalid AI request identifier")?;
        let mut active = self
            .active
            .lock()
            .map_err(|_| "AI request state is unavailable")?;
        let mut early = self
            .early
            .lock()
            .map_err(|_| "AI cancellation state is unavailable")?;
        if let Some(index) = early.iter().position(|pending| pending == id) {
            early.remove(index);
            return Err("Request cancelled".into());
        }
        if active.len() >= 16 || active.contains_key(id) {
            return Err("Another AI operation owns this request".into());
        }
        let (tx, rx) = watch::channel(false);
        active.insert(id.into(), tx);
        Ok((
            Active {
                requests: self.active.clone(),
                id: id.into(),
            },
            rx,
        ))
    }
    pub fn cancel(&self, id: &str) {
        if uuid::Uuid::parse_str(id).is_err() {
            return;
        }
        if let Ok(active) = self.active.lock() {
            if let Some(cancel) = active.get(id) {
                let _ = cancel.send(true);
            } else if let Ok(mut early) = self.early.lock() {
                if !early.iter().any(|pending| pending == id) {
                    if early.len() >= 64 {
                        early.pop_front();
                    }
                    early.push_back(id.into());
                }
            }
        }
    }
}

pub async fn cancellable<T>(
    cancel: &mut watch::Receiver<bool>,
    future: impl std::future::Future<Output = Result<T, String>>,
) -> Result<T, String> {
    if *cancel.borrow() {
        return Err("Request cancelled".into());
    }
    tokio::select! { result = future => result, _ = cancel.changed() => Err("Request cancelled".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn early_and_active_cancellation_are_bounded_and_cleaned_up() {
        let requests = Requests::default();
        for _ in 0..70 {
            requests.cancel(&uuid::Uuid::new_v4().to_string());
        }
        assert_eq!(requests.early.lock().unwrap().len(), 64);
        let early = uuid::Uuid::new_v4().to_string();
        requests.cancel(&early);
        assert!(requests.start(&early).is_err());
        let id = uuid::Uuid::new_v4().to_string();
        let (active, cancel) = requests.start(&id).unwrap();
        requests.cancel(&id);
        assert!(*cancel.borrow());
        drop(active);
        assert!(requests.active.lock().unwrap().is_empty());
    }
    #[tokio::test]
    async fn cancellation_interrupts_pending_work() {
        let requests = Requests::default();
        let id = uuid::Uuid::new_v4().to_string();
        let (_active, mut cancel) = requests.start(&id).unwrap();
        let work = cancellable(&mut cancel, async {
            std::future::pending::<()>().await;
            Ok(())
        });
        let stop = async {
            tokio::task::yield_now().await;
            requests.cancel(&id);
        };
        let (result, ()) = tokio::join!(work, stop);
        assert_eq!(result.unwrap_err(), "Request cancelled");
    }
}
