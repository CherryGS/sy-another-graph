use graph_core::detect_communities;

fn two_cliques() -> Vec<u32> {
    let mut edges = Vec::new();
    for start in [0, 5] {
        for a in start..start + 5 {
            for b in a + 1..start + 5 {
                edges.extend([a, b]);
            }
        }
    }
    edges.extend([4, 5]);
    edges
}

#[test]
fn detects_dense_groups_connected_by_a_bridge_and_keeps_isolates_separate() {
    let groups = detect_communities(12, &two_cliques(), 1.0).unwrap();
    assert_eq!(&groups[..5], &[0; 5]);
    assert_eq!(&groups[5..10], &[5; 5]);
    assert_eq!(&groups[10..], &[10, 11]);
}

#[test]
fn layout_membership_is_reproducible_and_ignores_reciprocal_duplicates_and_self_links() {
    let edges = two_cliques();
    let expected = detect_communities(12, &edges, 1.0).unwrap();
    let mut reordered = Vec::new();
    for pair in edges.chunks_exact(2).rev() {
        reordered.extend([pair[1], pair[0], pair[0], pair[1], pair[0], pair[0]]);
    }
    assert_eq!(detect_communities(12, &reordered, 1.0).unwrap(), expected);
    assert_eq!(detect_communities(12, &edges, 1.0).unwrap(), expected);
    assert!(
        detect_communities(12, &edges, 8.0)
            .unwrap()
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            > 4
    );
}

#[test]
fn validates_the_boundary_and_handles_empty_graphs() {
    assert_eq!(detect_communities(0, &[], 1.0).unwrap(), Vec::<u32>::new());
    assert_eq!(detect_communities(3, &[1, 1], 1.0).unwrap(), vec![0, 1, 2]);
    for resolution in [f64::NAN, f64::INFINITY, 0.0, 9.0] {
        assert!(detect_communities(2, &[0, 1], resolution).is_err());
    }
    assert!(detect_communities(2, &[0], 1.0).is_err());
    assert!(detect_communities(2, &[0, 2], 1.0).is_err());
}
