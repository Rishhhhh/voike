use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;
use std::time::Duration;

#[derive(Serialize, Deserialize)]
struct Event {
    id: String,
    payload: serde_json::Value,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let api_url = env::var("VOIKE_API_URL").unwrap_or_else(|_| "http://localhost:8080".into());
    let api_key = env::var("VOIKE_API_KEY").unwrap_or_default();
    let client = Client::new();

    let event = Event {
        id: uuid::Uuid::new_v4().to_string(),
        payload: serde_json::json!({ "message": "hello from rust" }),
    };

    dual_write(&client, &api_url, &api_key, &event).await?;
    Ok(())
}

async fn dual_write(
    client: &Client,
    api_url: &str,
    api_key: &str,
    event: &Event,
) -> anyhow::Result<()> {
    let mut attempts = 0;
    loop {
        attempts += 1;
        let response = client
            .post(format!("{api_url}/ingest/file"))
            .header("x-voike-api-key", api_key)
            .json(&serde_json::json!({
                "table": "events",
                "record": event
            }))
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                println!("Dual-write succeeded");
                return Ok(());
            }
            Ok(resp) => {
                eprintln!("VOIKE error: {}", resp.status());
            }
            Err(err) => eprintln!("Network error: {err}"),
        }

        if attempts >= 3 {
            anyhow::bail!("Failover after {attempts} attempts");
        }
        tokio::time::sleep(Duration::from_secs(2_u64.pow(attempts))).await;
    }
}
