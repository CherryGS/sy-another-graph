use graph_core::{Direction, Graph};
use std::time::Instant;

fn main() {
    let nodes = 100_000;
    let mut endpoints = Vec::with_capacity(nodes as usize * 8);
    for node in 0..nodes {
        for skip in [1, 7, 97, 997] {
            endpoints.extend([node, (node + skip) % nodes]);
        }
    }
    let mut graph = Graph::new();
    let start = Instant::now();
    graph.load(nodes, &endpoints).unwrap();
    let build = start.elapsed();
    let start = Instant::now();
    let neighborhood = graph.neighborhood(&[0], Direction::Both, u32::MAX, nodes);
    let query = start.elapsed();
    let start = Instant::now();
    let path = graph.shortest_path(0, nodes - 1, Direction::Outgoing);
    let path_time = start.elapsed();
    println!(
        "nodes={} edges={} build_ms={:.3} full_neighborhood_ms={:.3} path_ms={:.3} selected={} path_nodes={}",
        nodes,
        graph.statistics().edges,
        build.as_secs_f64() * 1000.0,
        query.as_secs_f64() * 1000.0,
        path_time.as_secs_f64() * 1000.0,
        neighborhood.indices.len(),
        path.len()
    );
}
