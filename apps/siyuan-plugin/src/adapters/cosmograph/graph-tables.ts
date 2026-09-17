import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import type { PreparedGraph } from "./prepare-graph";

export interface UploadedGraph {
  prepared: PreparedGraph;
  points: string;
  links?: string;
}

type GraphConnection = Pick<AsyncDuckDBConnection, "insertArrowFromIPCStream" | "query">;

/** External Cosmograph connections consume existing table names, not Arrow objects. */
export class GraphTableStore {
  active: UploadedGraph | null = null;
  private sequence = 0;
  private readonly connection: GraphConnection;

  constructor(connection: GraphConnection) {
    this.connection = connection;
  }

  async stage(prepared: PreparedGraph): Promise<UploadedGraph> {
    if (this.active?.prepared === prepared) return this.active;
    const generation = ++this.sequence;
    const uploaded: UploadedGraph = {
      prepared,
      points: `atlas_points_${generation}`,
      links: `atlas_links_${generation}`,
    };
    try {
      // DuckDB transfers/detaches these buffers. Keep the prepared bytes intact for retries.
      await this.connection.insertArrowFromIPCStream(prepared.ipc.points.slice(), {
        name: uploaded.points,
        create: true,
      });
      if (uploaded.links) {
        await this.connection.insertArrowFromIPCStream(prepared.ipc.links.slice(), {
          name: uploaded.links,
          create: true,
        });
      }
      return uploaded;
    } catch (error) {
      await this.discard(uploaded).catch(() => undefined);
      throw error;
    }
  }

  /** Retire the old source only after Cosmograph has finished reading and replacing it. */
  async commit(uploaded: UploadedGraph) {
    const previous = this.active;
    this.active = uploaded;
    if (previous && previous !== uploaded) await this.discard(previous);
  }

  async clear() {
    const previous = this.active;
    this.active = null;
    if (previous) await this.discard(previous);
  }

  async discard(uploaded: UploadedGraph) {
    if (uploaded === this.active) return;
    // These identifiers are generated above and never contain note data.
    const names = [uploaded.links, uploaded.points].filter((name): name is string => Boolean(name));
    await this.connection.query(names.map((name) => `DROP TABLE IF EXISTS "${name}"`).join("; "));
  }
}
