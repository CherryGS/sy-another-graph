mod communities;
mod graph;

#[cfg(target_arch = "wasm32")]
mod wasm;

pub use communities::detect_communities;
pub use graph::{Direction, Graph, Neighborhood, Statistics};

#[cfg(target_arch = "wasm32")]
pub use wasm::WasmGraph;
