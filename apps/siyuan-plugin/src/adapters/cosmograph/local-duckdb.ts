import { AsyncDuckDB, VoidLogger, selectBundle } from "@duckdb/duckdb-wasm";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import mvpWasmUrl from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvpWorkerUrl from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
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
  const bundle = await selectBundle({
    mvp: { mainModule: mvpWasmUrl, mainWorker: mvpWorkerUrl },
    eh: { mainModule: ehWasmUrl, mainWorker: ehWorkerUrl },
  });
  signal.throwIfAborted();
  if (!bundle.mainWorker) throw new Error("当前浏览器没有可用的本地图数据库运行环境。");
  const mainWorkerUrl = new URL(bundle.mainWorker, window.location.href).href;
  const mainModuleUrl = new URL(bundle.mainModule, window.location.href).href;
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
    rejectInterrupted?.(new DOMException("图谱初始化已取消。", "AbortError"));
  };
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => {
    worker.terminate();
    rejectInterrupted?.(new Error("本地图数据库启动超时，请重试图谱。"));
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
    if (!connection) throw new Error("无法建立本地图数据库连接。");
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
