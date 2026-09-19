use graph_core::{Direction, Graph, Statistics};

fn sample() -> Graph {
    let mut graph = Graph::new();
    graph
        .load(7, &[2, 4, 0, 2, 0, 1, 1, 4, 4, 5, 3, 0, 0, 2, 6, 6])
        .unwrap();
    graph
}

#[test]
fn full_distances_use_nearest_equal_seed_and_preserve_direction() {
    let mut graph = sample();
    let unreachable = u32::MAX;
    assert_eq!(
        graph.distances(&[0], Direction::Outgoing),
        vec![0, 1, 1, unreachable, 2, 3, unreachable]
    );
    assert_eq!(
        graph.distances(&[0], Direction::Incoming),
        vec![
            0,
            unreachable,
            unreachable,
            1,
            unreachable,
            unreachable,
            unreachable
        ]
    );
    assert_eq!(
        graph.distances(&[0, 5, 0, 99], Direction::Both),
        vec![0, 1, 1, 1, 1, 0, unreachable]
    );
    assert_eq!(
        graph.distances(&[5, 0], Direction::Both),
        vec![0, 1, 1, 1, 1, 0, unreachable]
    );
    assert_eq!(graph.distances(&[], Direction::Both), vec![unreachable; 7]);
    assert_eq!(
        graph.shortest_path(0, 5, Direction::Outgoing),
        vec![0, 1, 4, 5]
    );
    graph.load(3, &[0, 1, 1, 2, 2, 0]).unwrap();
    assert_eq!(graph.distances(&[0], Direction::Outgoing), vec![0, 1, 2]);
    graph.load(0, &[]).unwrap();
    assert!(graph.distances(&[0], Direction::Both).is_empty());
}

#[test]
fn full_distances_do_not_inherit_neighborhood_limits_or_old_queries() {
    let mut graph = Graph::new();
    let edges: Vec<u32> = (1..100_000).flat_map(|node| [node - 1, node]).collect();
    graph.load(100_000, &edges).unwrap();
    assert!(
        graph
            .neighborhood(&[0], Direction::Both, 100_000, 10)
            .truncated
    );
    let distances = graph.distances(&[0], Direction::Outgoing);
    assert_eq!(distances.len(), 100_000);
    assert_eq!(distances[99_999], 99_999);
    assert_eq!(
        graph
            .neighborhood(&[99_999], Direction::Incoming, 1, 5)
            .indices,
        vec![99_999, 99_998]
    );
}

#[test]
fn deduplicates_and_reports_weak_components_and_total_degrees() {
    let graph = sample();
    assert_eq!(
        graph.statistics(),
        Statistics {
            nodes: 7,
            edges: 6,
            components: 2,
            largest_component: 6
        }
    );
    assert_eq!(graph.degrees(), &[3, 2, 2, 1, 3, 1, 0]);
    assert_eq!(graph.component_ids(), &[0, 0, 0, 0, 0, 0, 1]);
}

#[test]
fn invalid_load_preserves_the_previous_snapshot() {
    let mut graph = sample();
    assert!(graph.load(3, &[0]).is_err());
    assert!(graph.load(3, &[0, 3]).is_err());
    assert!(graph.load(0, &[0, 0]).is_err());
    assert_eq!(graph.statistics().nodes, 7);
    assert_eq!(
        graph.shortest_path(0, 5, Direction::Outgoing),
        vec![0, 1, 4, 5]
    );
}

#[test]
fn neighborhoods_respect_direction_depth_seeds_and_budget() {
    let mut graph = sample();
    let result = graph.neighborhood(&[0, 0, 99], Direction::Both, 2, 7);
    assert_eq!(result.indices, vec![0, 1, 2, 3, 4]);
    assert!(!result.truncated);
    assert_eq!(
        graph.neighborhood(&[0], Direction::Incoming, 1, 7).indices,
        vec![0, 3]
    );
    assert_eq!(
        graph.neighborhood(&[0], Direction::Outgoing, 1, 7).indices,
        vec![0, 1, 2]
    );
    let exact = graph.neighborhood(&[0], Direction::Both, 1, 4);
    assert_eq!(exact.indices.len(), 4);
    assert!(
        !exact.truncated,
        "An exactly full projection need not be truncated"
    );
    let limited = graph.neighborhood(&[0], Direction::Both, 2, 4);
    assert_eq!(limited.indices.len(), 4);
    assert!(limited.truncated);
    assert!(graph.neighborhood(&[0], Direction::Both, 0, 0).truncated);
    assert!(!graph.neighborhood(&[], Direction::Both, 0, 0).truncated);
    assert!(graph.neighborhood(&[0, 3], Direction::Both, 0, 1).truncated);
}

#[test]
fn paths_are_shortest_deterministic_and_directional() {
    let mut graph = sample();
    assert_eq!(
        graph.shortest_path(3, 5, Direction::Outgoing),
        vec![3, 0, 1, 4, 5]
    );
    assert_eq!(
        graph.shortest_path(5, 0, Direction::Incoming),
        vec![5, 4, 1, 0]
    );
    assert_eq!(
        graph.shortest_path(5, 3, Direction::Both),
        vec![5, 4, 1, 0, 3]
    );
    assert!(graph.shortest_path(5, 0, Direction::Outgoing).is_empty());
    assert!(graph.shortest_path(6, 0, Direction::Both).is_empty());
    assert_eq!(graph.shortest_path(2, 2, Direction::Both), vec![2]);
    assert!(graph.shortest_path(99, 0, Direction::Both).is_empty());
    for _ in 0..100 {
        assert_eq!(
            graph.neighborhood(&[0], Direction::Both, 2, 7).indices,
            vec![0, 1, 2, 3, 4]
        );
    }
}

#[test]
fn empty_snapshot_replaces_all_previous_indices() {
    let mut graph = sample();
    graph.load(0, &[]).unwrap();
    assert_eq!(graph.statistics(), Statistics::default());
    assert!(graph.degrees().is_empty());
    assert!(
        graph
            .neighborhood(&[0], Direction::Both, 4, 8)
            .indices
            .is_empty()
    );
}

#[test]
fn traverses_all_one_hundred_thousand_nodes_and_four_hundred_thousand_edges() {
    let nodes = 100_000;
    let mut edges = Vec::with_capacity(nodes as usize * 8);
    for node in 0..nodes {
        for skip in [1, 7, 97, 997] {
            edges.extend([node, (node + skip) % nodes]);
        }
    }
    let mut graph = Graph::new();
    graph.load(nodes, &edges).unwrap();
    assert_eq!(graph.statistics().edges, 400_000);
    assert_eq!(graph.statistics().largest_component, nodes);
    assert_eq!(
        graph
            .neighborhood(&[0], Direction::Both, u32::MAX, nodes)
            .indices
            .len(),
        nodes as usize
    );
    assert!(
        !graph
            .shortest_path(0, nodes - 1, Direction::Outgoing)
            .is_empty()
    );
}
