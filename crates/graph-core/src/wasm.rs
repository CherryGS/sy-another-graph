use crate::{Direction, Graph};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn detect_communities(
    nodes: u32,
    endpoints: &[u32],
    resolution: f64,
) -> Result<Vec<u32>, JsValue> {
    crate::detect_communities(nodes, endpoints, resolution)
        .map_err(|error| JsValue::from_str(&error))
}

fn direction(value: u8) -> Result<Direction, JsValue> {
    match value {
        0 => Ok(Direction::Both),
        1 => Ok(Direction::Incoming),
        2 => Ok(Direction::Outgoing),
        _ => Err(JsValue::from_str("Unknown graph direction")),
    }
}

#[wasm_bindgen]
pub struct WasmGraph {
    graph: Graph,
}

impl Default for WasmGraph {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl WasmGraph {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            graph: Graph::new(),
        }
    }

    pub fn load(&mut self, nodes: u32, endpoints: &[u32]) -> Result<(), JsValue> {
        self.graph
            .load(nodes, endpoints)
            .map_err(|error| JsValue::from_str(&error))
    }

    /// [nodes, unique directed edges, weak components, largest component]
    pub fn statistics(&self) -> Vec<u32> {
        let stats = self.graph.statistics();
        vec![
            stats.nodes,
            stats.edges,
            stats.components,
            stats.largest_component,
        ]
    }
    pub fn degrees(&self) -> Vec<u32> {
        self.graph.degrees().to_vec()
    }
    pub fn component_ids(&self) -> Vec<u32> {
        self.graph.component_ids().to_vec()
    }

    /// [truncated flag, ...global node indices]
    pub fn neighborhood(
        &mut self,
        seeds: &[u32],
        mode: u8,
        depth: u32,
        limit: u32,
    ) -> Result<Vec<u32>, JsValue> {
        let result = self
            .graph
            .neighborhood(seeds, direction(mode)?, depth, limit);
        let mut packed = Vec::with_capacity(result.indices.len() + 1);
        packed.push(u32::from(result.truncated));
        packed.extend(result.indices);
        Ok(packed)
    }

    pub fn shortest_path(
        &mut self,
        source: u32,
        target: u32,
        mode: u8,
    ) -> Result<Vec<u32>, JsValue> {
        Ok(self.graph.shortest_path(source, target, direction(mode)?))
    }
}
