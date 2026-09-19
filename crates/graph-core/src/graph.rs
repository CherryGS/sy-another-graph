use std::collections::VecDeque;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Direction {
    Both,
    Incoming,
    Outgoing,
}

#[derive(Default)]
struct Adjacency {
    offsets: Vec<u32>,
    targets: Vec<u32>,
}

impl Adjacency {
    fn at(&self, index: u32) -> &[u32] {
        let index = index as usize;
        &self.targets[self.offsets[index] as usize..self.offsets[index + 1] as usize]
    }

    fn degree(&self, index: usize) -> u32 {
        self.offsets[index + 1] - self.offsets[index]
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Statistics {
    pub nodes: u32,
    pub edges: u32,
    pub components: u32,
    pub largest_component: u32,
}

#[derive(Debug, Eq, PartialEq)]
pub struct Neighborhood {
    pub indices: Vec<u32>,
    pub truncated: bool,
}

/// A graph snapshot with two CSR indices and reusable traversal scratch space.
/// Loading removes self links and duplicate directed links. Component identity
/// is the ascending index of the first node encountered in each weak component.
#[derive(Default)]
pub struct Graph {
    outgoing: Adjacency,
    incoming: Adjacency,
    stats: Statistics,
    degrees: Vec<u32>,
    component_ids: Vec<u32>,
    visited: Vec<u32>,
    generation: u32,
    predecessors: Vec<u32>,
    queue: VecDeque<(u32, u32)>,
}

impl Graph {
    pub fn new() -> Self {
        Self::default()
    }

    /// Validate the complete input before replacing the current snapshot.
    pub fn load(&mut self, nodes: u32, endpoints: &[u32]) -> Result<(), String> {
        if !endpoints.len().is_multiple_of(2) {
            return Err("Edge data must contain source/target pairs".into());
        }
        if nodes == u32::MAX {
            return Err("Node count exceeds the supported index range".into());
        }
        let mut pairs = Vec::with_capacity(endpoints.len() / 2);
        for pair in endpoints.chunks_exact(2) {
            if pair[0] >= nodes || pair[1] >= nodes {
                return Err(format!(
                    "Edge endpoint outside node range: {} -> {}",
                    pair[0], pair[1]
                ));
            }
            if pair[0] != pair[1] {
                pairs.push((pair[0], pair[1]));
            }
        }
        pairs.sort_unstable();
        pairs.dedup();
        let edge_count = u32::try_from(pairs.len()).map_err(|_| "Too many edges")?;
        let size = nodes as usize;
        let mut outgoing = Adjacency {
            offsets: vec![0; size + 1],
            targets: vec![0; pairs.len()],
        };
        let mut incoming = Adjacency {
            offsets: vec![0; size + 1],
            targets: vec![0; pairs.len()],
        };
        for &(source, target) in &pairs {
            outgoing.offsets[source as usize + 1] += 1;
            incoming.offsets[target as usize + 1] += 1;
        }
        for node in 0..size {
            outgoing.offsets[node + 1] += outgoing.offsets[node];
            incoming.offsets[node + 1] += incoming.offsets[node];
        }
        // The pair order directly matches outgoing CSR; incoming insertion also
        // visits sources in ascending order, so both adjacency lists are sorted.
        let mut cursors = incoming.offsets[..size].to_vec();
        let mut components = Components::new(size);
        for (offset, &(source, target)) in pairs.iter().enumerate() {
            outgoing.targets[offset] = target;
            incoming.targets[cursors[target as usize] as usize] = source;
            cursors[target as usize] += 1;
            components.join(source, target);
        }
        let (component_ids, component_count, largest_component) = components.finish();
        let degrees = (0..size)
            .map(|node| outgoing.degree(node).saturating_add(incoming.degree(node)))
            .collect();
        self.outgoing = outgoing;
        self.incoming = incoming;
        self.stats = Statistics {
            nodes,
            edges: edge_count,
            components: component_count,
            largest_component,
        };
        self.degrees = degrees;
        self.component_ids = component_ids;
        self.visited = vec![0; size];
        self.predecessors = vec![0; size];
        self.generation = 0;
        self.queue.clear();
        Ok(())
    }

    pub fn statistics(&self) -> Statistics {
        self.stats
    }
    pub fn degrees(&self) -> &[u32] {
        &self.degrees
    }
    pub fn component_ids(&self) -> &[u32] {
        &self.component_ids
    }

    /// Breadth-first selection including roots; `truncated` is true only if a
    /// reachable node within the requested depth was omitted by the node budget.
    pub fn neighborhood(
        &mut self,
        seeds: &[u32],
        direction: Direction,
        depth: u32,
        limit: u32,
    ) -> Neighborhood {
        let generation = self.begin_query();
        let budget = limit.min(self.stats.nodes) as usize;
        let mut indices = Vec::with_capacity(budget.min(4096));
        let mut truncated = false;
        for &seed in seeds {
            if seed >= self.stats.nodes || self.visited[seed as usize] == generation {
                continue;
            }
            if indices.len() == budget {
                truncated = true;
                break;
            }
            self.visited[seed as usize] = generation;
            indices.push(seed);
            self.queue.push_back((seed, 0));
        }
        if truncated {
            return Neighborhood { indices, truncated };
        }
        while let Some((node, level)) = self.queue.pop_front() {
            if level >= depth {
                continue;
            }
            let mut full = false;
            visit_neighbors(
                &self.outgoing,
                &self.incoming,
                node,
                direction,
                |neighbor| {
                    if self.visited[neighbor as usize] == generation {
                        return true;
                    }
                    if indices.len() == budget {
                        full = true;
                        return false;
                    }
                    self.visited[neighbor as usize] = generation;
                    indices.push(neighbor);
                    self.queue.push_back((neighbor, level + 1));
                    true
                },
            );
            if full {
                truncated = true;
                break;
            }
        }
        self.queue.clear();
        Neighborhood { indices, truncated }
    }

    /// Complete minimum hop distances from equal-weight seeds. Unreachable nodes
    /// use u32::MAX; this query has no neighborhood depth or output budget.
    pub fn distances(&mut self, seeds: &[u32], direction: Direction) -> Vec<u32> {
        self.queue.clear();
        let mut distances = vec![u32::MAX; self.stats.nodes as usize];
        for &seed in seeds {
            if seed < self.stats.nodes && distances[seed as usize] == u32::MAX {
                distances[seed as usize] = 0;
                self.queue.push_back((seed, 0));
            }
        }
        while let Some((node, level)) = self.queue.pop_front() {
            visit_neighbors(
                &self.outgoing,
                &self.incoming,
                node,
                direction,
                |neighbor| {
                    if distances[neighbor as usize] == u32::MAX {
                        distances[neighbor as usize] = level + 1;
                        self.queue.push_back((neighbor, level + 1));
                    }
                    true
                },
            );
        }
        distances
    }

    pub fn shortest_path(&mut self, source: u32, target: u32, direction: Direction) -> Vec<u32> {
        if source >= self.stats.nodes || target >= self.stats.nodes {
            return Vec::new();
        }
        if source == target {
            return vec![source];
        }
        // Distinct weak components cannot be connected in any direction.
        if self.component_ids[source as usize] != self.component_ids[target as usize] {
            return Vec::new();
        }
        let generation = self.begin_query();
        self.visited[source as usize] = generation;
        self.queue.push_back((source, 0));
        while let Some((node, _)) = self.queue.pop_front() {
            let mut found = false;
            visit_neighbors(
                &self.outgoing,
                &self.incoming,
                node,
                direction,
                |neighbor| {
                    if self.visited[neighbor as usize] == generation {
                        return true;
                    }
                    self.visited[neighbor as usize] = generation;
                    self.predecessors[neighbor as usize] = node;
                    if neighbor == target {
                        found = true;
                        return false;
                    }
                    self.queue.push_back((neighbor, 0));
                    true
                },
            );
            if found {
                let mut path = vec![target];
                let mut next = target;
                while next != source {
                    next = self.predecessors[next as usize];
                    path.push(next);
                }
                path.reverse();
                self.queue.clear();
                return path;
            }
        }
        Vec::new()
    }

    fn begin_query(&mut self) -> u32 {
        self.queue.clear();
        self.generation = self.generation.wrapping_add(1);
        if self.generation == 0 {
            self.visited.fill(0);
            self.generation = 1;
        }
        self.generation
    }
}

fn visit_neighbors(
    mut_out: &Adjacency,
    mut_in: &Adjacency,
    node: u32,
    direction: Direction,
    mut visit: impl FnMut(u32) -> bool,
) {
    let outgoing = if direction == Direction::Incoming {
        &[]
    } else {
        mut_out.at(node)
    };
    let incoming = if direction == Direction::Outgoing {
        &[]
    } else {
        mut_in.at(node)
    };
    let (mut out, mut inc) = (0, 0);
    while out < outgoing.len() || inc < incoming.len() {
        let a = outgoing.get(out).copied().unwrap_or(u32::MAX);
        let b = incoming.get(inc).copied().unwrap_or(u32::MAX);
        let next = a.min(b);
        if a == next {
            out += 1;
        }
        if b == next {
            inc += 1;
        }
        if !visit(next) {
            break;
        }
    }
}

struct Components {
    parent: Vec<u32>,
    size: Vec<u32>,
}

impl Components {
    fn new(nodes: usize) -> Self {
        Self {
            parent: (0..nodes as u32).collect(),
            size: vec![1; nodes],
        }
    }
    fn root(&mut self, mut node: u32) -> u32 {
        while self.parent[node as usize] != node {
            let parent = self.parent[node as usize];
            self.parent[node as usize] = self.parent[parent as usize];
            node = self.parent[node as usize];
        }
        node
    }
    fn join(&mut self, source: u32, target: u32) {
        let (mut a, mut b) = (self.root(source), self.root(target));
        if a == b {
            return;
        }
        if self.size[a as usize] < self.size[b as usize] {
            std::mem::swap(&mut a, &mut b);
        }
        self.parent[b as usize] = a;
        self.size[a as usize] += self.size[b as usize];
    }
    fn finish(mut self) -> (Vec<u32>, u32, u32) {
        let mut root_ids = vec![u32::MAX; self.parent.len()];
        let mut ids = vec![0; self.parent.len()];
        let (mut count, mut largest) = (0, 0);
        for (node, id) in ids.iter_mut().enumerate() {
            let root = self.root(node as u32) as usize;
            if root_ids[root] == u32::MAX {
                root_ids[root] = count;
                count += 1;
                largest = largest.max(self.size[root]);
            }
            *id = root_ids[root];
        }
        (ids, count, largest)
    }
}
