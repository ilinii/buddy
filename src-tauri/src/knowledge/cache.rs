use super::Source;
use rusqlite::{params, Connection, OptionalExtension};

pub struct Cache(pub Connection);
impl Cache {
    fn query_source(hash: &str) -> Source {
        Source {
            id: hash.into(),
            root_id: "@query-vectors".into(),
            revision: hash.into(),
            title: String::new(),
            location: String::new(),
            text: String::new(),
            kind: "query".into(),
            lexical_score: 0.,
        }
    }
    pub fn query(&self, hash: &str, model: &str) -> Result<Option<Vec<f32>>, String> {
        self.get(&Self::query_source(hash), hash, model)
    }
    pub fn put_query(&self, hash: &str, model: &str, vector: &[f32]) -> Result<(), String> {
        self.put(&Self::query_source(hash), hash, model, vector)?;
        self.0.execute("DELETE FROM embeddings WHERE root='@query-vectors' AND rowid NOT IN (SELECT rowid FROM embeddings WHERE root='@query-vectors' ORDER BY touched DESC,rowid DESC LIMIT 256)",[]).map_err(|_|"Could not bound query cache")?;
        Ok(())
    }
    pub fn new(connection: Connection) -> Result<Self, String> {
        connection
            .busy_timeout(std::time::Duration::from_secs(3))
            .map_err(|_| "Search index is busy")?;
        connection.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS embeddings(root TEXT NOT NULL,chunk TEXT NOT NULL,hash TEXT NOT NULL,model TEXT NOT NULL,vector BLOB NOT NULL,touched INTEGER NOT NULL,PRIMARY KEY(root,chunk,model)); CREATE INDEX IF NOT EXISTS embedding_age ON embeddings(touched);").map_err(|_|"Could not open the derived search index")?;
        Ok(Self(connection))
    }
    pub fn get(
        &self,
        source: &Source,
        hash: &str,
        model: &str,
    ) -> Result<Option<Vec<f32>>, String> {
        let bytes: Option<Vec<u8>> = self
            .0
            .query_row(
                "SELECT vector FROM embeddings WHERE root=? AND chunk=? AND hash=? AND model=?",
                params![source.root_id, source.id, hash, model],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| "Could not read the search index")?;
        Ok(bytes.and_then(|b| {
            if b.len() != 1024 * 4 {
                return None;
            }
            let v: Vec<f32> = b
                .chunks_exact(4)
                .map(|x| f32::from_le_bytes(x.try_into().unwrap()))
                .collect();
            if v.iter().all(|x| x.is_finite()) {
                Some(v)
            } else {
                None
            }
        }))
    }
    pub fn put(
        &self,
        source: &Source,
        hash: &str,
        model: &str,
        vector: &[f32],
    ) -> Result<(), String> {
        let bytes: Vec<u8> = vector.iter().flat_map(|v| v.to_le_bytes()).collect();
        self.0.execute("INSERT INTO embeddings VALUES(?,?,?,?,?,unixepoch()) ON CONFLICT(root,chunk,model) DO UPDATE SET hash=excluded.hash,vector=excluded.vector,touched=excluded.touched",params![source.root_id,source.id,hash,model,bytes]).map_err(|_|"Could not save the search index")?;
        let count: i64 = self
            .0
            .query_row("SELECT count(*) FROM embeddings", [], |r| r.get(0))
            .map_err(|_| "Could not inspect search index size")?;
        if count > 20_000 {
            self.0.execute("DELETE FROM embeddings WHERE rowid IN (SELECT rowid FROM embeddings ORDER BY touched LIMIT ?)",[count-20_000]).map_err(|_|"Could not bound the search index")?;
        }
        Ok(())
    }
    pub fn invalidate(&self, roots: &[String]) -> Result<(), String> {
        for root in roots {
            self.0
                .execute("DELETE FROM embeddings WHERE root=?", [root])
                .map_err(|_| "Could not revoke a search source")?;
        }
        Ok(())
    }
    pub fn clear(&self) -> Result<(), String> {
        self.0
            .execute_batch("DELETE FROM embeddings; PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|_| "Could not clear the search index".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn query_vectors_are_reused_across_connections_and_versioned() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../output/knowledge-review/cache-tests");
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join(format!("{}.sqlite3", uuid::Uuid::new_v4()));
        let key = "a".repeat(64);
        {
            let cache = Cache::new(Connection::open(&path).unwrap()).unwrap();
            cache
                .put_query(&key, "query-model-v1", &vec![0.2; 1024])
                .unwrap();
        }
        {
            let cache = Cache::new(Connection::open(&path).unwrap()).unwrap();
            assert_eq!(
                cache.query(&key, "query-model-v1").unwrap().unwrap().len(),
                1024
            );
            assert!(cache.query(&key, "query-model-v2").unwrap().is_none());
            cache.invalidate(&["document:removed".into()]).unwrap();
            assert!(cache.query(&key, "query-model-v1").unwrap().is_some());
            cache.clear().unwrap();
            assert!(cache.query(&key, "query-model-v1").unwrap().is_none());
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn vectors_are_versioned_and_revocable() {
        let cache = Cache::new(Connection::open_in_memory().unwrap()).unwrap();
        let source = Source {
            id: "s".into(),
            root_id: "document:d".into(),
            revision: "a".repeat(64),
            title: "Source".into(),
            location: "Page 1".into(),
            text: "A fact".into(),
            kind: "document".into(),
            lexical_score: 1.,
        };
        let vector = vec![0.1; 1024];
        cache.put(&source, "old", "model", &vector).unwrap();
        assert!(cache.get(&source, "new", "model").unwrap().is_none());
        assert_eq!(
            cache.get(&source, "old", "model").unwrap().unwrap().len(),
            1024
        );
        cache.invalidate(&[source.root_id.clone()]).unwrap();
        assert!(cache.get(&source, "old", "model").unwrap().is_none());
    }
}
