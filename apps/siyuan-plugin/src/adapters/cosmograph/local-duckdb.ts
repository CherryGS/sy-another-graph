import { message as msg, MessageError } from "../../core/diagnostics/message";
import { t } from "../../shared/i18n/runtime";
import {
  AsyncDuckDB,
  VoidLogger,
  getPlatformFeatures,
  type AsyncDuckDBConnection,
} from "@duckdb/duckdb-wasm";

import ehWasmUrl from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import ehWorkerUrl from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

export interface LocalDuckDB {
  duckdb: AsyncDuckDB;
  connection: AsyncDuckDBConnection;
  drain: () => Promise<void>;
  dispose: () => Promise<void>;
}

class TrackedDuckDB extends AsyncDuckDB {
  private queries = new Set<Promise<Uint8Array>>();

  override runQuery(connectionId: number, text: string) {
    const query = super.runQuery(connectionId, text);
    this.queries.add(query);
    void query.then(
      () => this.queries.delete(query),
      () => this.queries.delete(query),
    );
    return query;
  }

  async drain() {
    // Mosaic uses useUnsafe(...bindings.runQuery), bypassing connection.query.
    // Allow result continuations to enqueue their next reads before declaring the connection idle.
    for (;;) {
      await Promise.allSettled(Array.from(this.queries));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (this.queries.size === 0) return;
    }
  }
}

/** Own the bundled worker explicitly; never fall back to DuckDB's default CDN bundles. */
export async function createLocalDuckDB(signal: AbortSignal): Promise<LocalDuckDB> {
  signal.throwIfAborted();
  const { wasmExceptions } = await getPlatformFeatures();
  signal.throwIfAborted();
  // Ship only EH, and reject unsupported engines before allocating a worker.
  if (!wasmExceptions)
    throw new MessageError(msg("text.thisBrowserCannotRunTheLocalGraphDatabase"));
  const mainWorkerUrl = new URL(ehWorkerUrl, window.location.href).href;
  const mainModuleUrl = new URL(ehWasmUrl, window.location.href).href;
  // A blob worker inherits the iframe's CSP; a direct URL worker does not.
  const bootstrapUrl = URL.createObjectURL(
    new Blob([`importScripts(${JSON.stringify(mainWorkerUrl)});`], {
      type: "text/javascript",
    }),
  );
  let worker: Worker;
  try {
    worker = new Worker(bootstrapUrl);
  } catch (error) {
    URL.revokeObjectURL(bootstrapUrl);
    throw error;
  }
  const duckdb = new TrackedDuckDB(new VoidLogger(), worker);
  let connection: AsyncDuckDBConnection | undefined;
  let disposed = false;
  let rejectInterrupted: ((reason: Error) => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    rejectInterrupted = reject;
  });
  const abort = () => {
    worker.terminate();
    rejectInterrupted?.(new DOMException(t("text.graphInitializationWasCancelled"), "AbortError"));
  };
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => {
    worker.terminate();
    rejectInterrupted?.(new MessageError(msg("text.theLocalGraphDatabaseTimedOutRetryThe")));
  }, 45_000);

  try {
    await Promise.race([
      (async () => {
        await duckdb.instantiate(mainModuleUrl);
        connection = await duckdb.connect();
        // Graph data uses Arrow only. Prevent implicit remote extension installation.
        await connection.query(
          "SET autoinstall_known_extensions = false; SET autoload_known_extensions = false;",
        );
      })(),
      interrupted,
    ]);
    signal.throwIfAborted();
    if (!connection) throw new MessageError(msg("text.cannotConnectToTheLocalGraphDatabase"));
    const activeConnection = connection;
    return {
      duckdb,
      connection: activeConnection,
      drain: () => duckdb.drain(),
      async dispose() {
        if (disposed) return;
        disposed = true;
        let forceStop: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            (async () => {
              await duckdb.drain();
              await activeConnection.close();
              await duckdb.terminate();
            })(),
            new Promise<void>((resolve) => {
              forceStop = setTimeout(resolve, 2000);
            }),
          ]);
        } catch {
          // Termination is also required when a crashed worker cannot acknowledge close.
        } finally {
          if (forceStop !== undefined) clearTimeout(forceStop);
          worker.terminate();
        }
      },
    };
  } catch (error) {
    worker.terminate();
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    URL.revokeObjectURL(bootstrapUrl);
  }
}
