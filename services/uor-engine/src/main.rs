use serde::Serialize;
use std::{
    env,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::Instant,
};
use sysinfo::{System, SystemExt};
use tokio::time::{interval, Duration};
use warp::Filter;
use wasmtime::{Engine, Module};

#[derive(Clone, Serialize, Default)]
struct RuntimeStatus {
    cpu_percent: f32,
    rss_mb: f32,
    uptime_seconds: u64,
    sleep_state: String,
    tickless: bool,
    wasm_loaded: bool,
    wasm_module: Option<String>,
    timestamp: String,
}

#[derive(Clone)]
struct SharedState {
    status: RuntimeStatus,
}

#[tokio::main]
async fn main() {
    let bind_addr: SocketAddr = env::var("UOR_BIND_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:9090".to_string())
        .parse()
        .expect("invalid UOR_BIND_ADDR");
    let start = Instant::now();
    let wasm_module = env::var("UOR_WASM_MODULE").ok();
    let wasm_loaded = wasm_module
        .as_ref()
        .map(|path| warm_wasm(path).map(|_| true).unwrap_or(false))
        .unwrap_or(false);

    let state = Arc::new(Mutex::new(SharedState {
        status: RuntimeStatus {
            wasm_loaded,
            wasm_module: wasm_module.clone(),
            tickless: true,
            ..RuntimeStatus::default()
        },
    }));

    tokio::spawn(sample_metrics(state.clone(), start, wasm_loaded, wasm_module.clone()));

    let state_filter = warp::any().map(move || state.clone());
    let status_route = warp::path("status").and(warp::get()).and(state_filter).map(|state: Arc<Mutex<SharedState>>| {
        let payload = state
            .lock()
            .map(|guard| guard.status.clone())
            .unwrap_or_default();
        warp::reply::json(&payload)
    });

    println!("[uor-engine] listening on {}", bind_addr);
    warp::serve(status_route).run(bind_addr).await;
}

async fn sample_metrics(state: Arc<Mutex<SharedState>>, start: Instant, wasm_loaded: bool, wasm_module: Option<String>) {
    let mut sys = System::new_all();
    let mut ticker = interval(Duration::from_millis(500));
    loop {
        ticker.tick().await;
        sys.refresh_cpu();
        sys.refresh_memory();
        let cpu = sys.global_cpu_info().cpu_usage();
        let rss_mb = sys.used_memory() as f32 / 1024.0;
        let uptime = start.elapsed().as_secs();
        let sleep_state = if cpu < 5.0 { "idle" } else if cpu < 40.0 { "warm" } else { "active" };
        let timestamp = chrono::Utc::now().to_rfc3339();
        let mut guard = match state.lock() {
            Ok(g) => g,
            Err(_) => continue,
        };
        guard.status = RuntimeStatus {
            cpu_percent: cpu,
            rss_mb,
            uptime_seconds: uptime,
            sleep_state: sleep_state.to_string(),
            tickless: true,
            wasm_loaded,
            wasm_module: wasm_module.clone(),
            timestamp,
        };
    }
}

fn warm_wasm(path: &str) -> Result<(), wasmtime::Error> {
    let engine = Engine::default();
    Module::from_file(&engine, path).map(|_| ())
}
