import type { GraphDirection, GraphEngine } from "../engine/types";

/** Request ownership also changes inside one topology revision. */
export class ExplorationRequest {
  private sequence = 0;

  get currentToken() {
    return this.sequence;
  }

  cancel() {
    this.sequence++;
  }

  async neighborhood(
    engine: GraphEngine,
    seeds: number[],
    direction: GraphDirection,
    depth: number,
  ) {
    const request = ++this.sequence;
    try {
      const result = await engine.neighborhood(
        seeds,
        direction,
        depth,
        Math.max(10_000, seeds.length),
      );
      return request === this.sequence ? result : null;
    } catch (failure) {
      if (request === this.sequence) throw failure;
      return null;
    }
  }

  async path(engine: GraphEngine, source: number, target: number, direction: GraphDirection) {
    const request = ++this.sequence;
    try {
      const result = await engine.shortestPath(source, target, direction);
      return request === this.sequence ? result : null;
    } catch (failure) {
      if (request === this.sequence) throw failure;
      return null;
    }
  }
}
