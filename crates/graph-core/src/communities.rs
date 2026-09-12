use leiden_rs::{GraphDataBuilder, Leiden, LeidenConfig};

/// Layout-only partition: one undirected, unit-weight connection per distinct
/// pair in the supplied current graph. Original direction, multiplicity, and
/// provenance stay in the source graph and are not changed by this calculation.
pub fn detect_communities(
    nodes: u32,
    endpoints: &[u32],
    resolution: f64,
) -> Result<Vec<u32>, String> {
    if !resolution.is_finite() || !(0.1..=8.0).contains(&resolution) {
        return Err("Community resolution must be between 0.1 and 8".into());
    }
    if !endpoints.len().is_multiple_of(2) {
        return Err("Community edges must contain endpoint pairs".into());
    }
    let mut pairs = Vec::with_capacity(endpoints.len() / 2);
    for edge in endpoints.chunks_exact(2) {
        let (a, b) = (edge[0], edge[1]);
        if a >= nodes || b >= nodes {
            return Err("Community edge endpoint is outside the graph".into());
        }
        if a != b {
            pairs.push((a.min(b), a.max(b)));
        }
    }
    pairs.sort_unstable();
    pairs.dedup();
    if pairs.is_empty() {
        return Ok((0..nodes).collect());
    }
    let mut builder = GraphDataBuilder::new(nodes as usize);
    for (a, b) in pairs {
        builder
            .add_edge(a as usize, b as usize, 1.0)
            .map_err(|e| e.to_string())?;
    }
    let graph = builder.build().map_err(|e| e.to_string())?;
    let config = LeidenConfig {
        resolution,
        seed: Some(0x0041_544c_4153),
        max_iterations: 8,
        ..LeidenConfig::default()
    };
    let result = Leiden::new(config).run(&graph).map_err(|e| e.to_string())?;
    // Canonical IDs are the smallest member index, independent of crate labels.
    let mut roots = vec![u32::MAX; nodes as usize];
    for node in 0..nodes {
        let group = result.partition.community_of(node as usize);
        roots[group] = roots[group].min(node);
    }
    Ok((0..nodes)
        .map(|node| roots[result.partition.community_of(node as usize)])
        .collect())
}
