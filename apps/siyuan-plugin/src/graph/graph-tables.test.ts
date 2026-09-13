import { createRequire } from "node:module";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createDuckDB,
  NODE_RUNTIME,
  VoidLogger,
} from "@duckdb/duckdb-wasm/blocking";
import type { DuckDBConnection } from "@duckdb/duckdb-wasm/blocking";
import { GraphTableStore } from "./graph-tables";
import { prepareGraph } from "./prepare-graph";

const require = createRequire(import.meta.url);
let database: Awaited<ReturnType<typeof createDuckDB>>;
let connection: DuckDBConnection;
let store: GraphTableStore;

beforeAll(async () => {
  database = await createDuckDB(
    {
      mvp: {
        mainModule: require.resolve("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm"),
        mainWorker: require.resolve(
          "@duckdb/duckdb-wasm/dist/duckdb-node-mvp.worker.cjs",
        ),
      },
      eh: {
        mainModule: require.resolve("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm"),
        mainWorker: require.resolve(
          "@duckdb/duckdb-wasm/dist/duckdb-node-eh.worker.cjs",
        ),
      },
    },
    new VoidLogger(),
    NODE_RUNTIME,
  );
  await database.instantiate();
  database.open({ path: ":memory:" });
  connection = database.connect();
  store = new GraphTableStore({
    async insertArrowFromIPCStream(buffer, options) {
      connection.insertArrowFromIPCStream(buffer, options);
    },
    async query(statement) {
      return connection.query(statement);
    },
  });
}, 30_000);

afterAll(() => {
  connection?.close();
  database?.reset();
});

it("exposes real indexed DuckDB tables and retires only replaced graph data", async () => {
  const prepared = await prepareGraph(
    [
      {
        id: "alpha",
        index: 4,
        label: "Alpha",
        notebook: "test",
        path: "",
        degree: 1,
        color: "#abcabc",
      },
      {
        id: "beta",
        index: 9,
        label: "Beta",
        notebook: "test",
        path: "",
        degree: 1,
        color: "#abcabc",
      },
    ],
    [{ source: 4, target: 9, kind: "reference", weight: 2 }],
    new AbortController().signal,
    { matches: new Set(["alpha"]), projected: new Map() },
  );
  const first = await store.stage(prepared);
  expect(
    connection
      .query(`SELECT id, "index" FROM "${first.points}" ORDER BY "index"`)
      .toArray()
      .map((row) => row.toJSON()),
  ).toEqual([
    { id: "alpha", index: 0 },
    { id: "beta", index: 1 },
  ]);
  expect(connection.query(`SELECT id, label FROM "${first.points}" ORDER BY "index"`).toArray().map(row => row.toJSON()))
    .toEqual([{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }]);
  expect(
    connection
      .query(
        `SELECT source, target, "sourceIndex", "targetIndex", weight FROM "${first.links}"`,
      )
      .toArray()
      .map((row) => row.toJSON()),
  ).toEqual([
    {
      source: "alpha",
      target: "beta",
      sourceIndex: 0,
      targetIndex: 1,
      weight: 2,
    },
  ]);
  await store.commit(first);
  expect(await store.stage(prepared)).toBe(first);

  const second = await store.stage({ ...prepared });
  // The previous renderer can still read its source until the replacement commits.
  expect(
    Number(
      connection.query(`SELECT COUNT(*) AS total FROM "${first.points}"`).get(0)
        ?.total,
    ),
  ).toBe(2);
  await store.commit(second);
  expect(
    connection.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = '${first.points}'`,
    ).numRows,
  ).toBe(0);
  expect(
    Number(
      connection
        .query(`SELECT COUNT(*) AS total FROM "${second.points}"`)
        .get(0)?.total,
    ),
  ).toBe(2);
  const withoutLinks = await prepareGraph(
    [
      {
        id: "alpha",
        index: 4,
        label: "Alpha",
        notebook: "test",
        path: "",
        degree: 0,
        color: "#abcabc",
      },
    ],
    [],
    new AbortController().signal,
  );
  const zero = await store.stage(withoutLinks);
  expect(connection.query(`SELECT * FROM "${zero.links}"`).numRows).toBe(0);
  expect(
    connection
      .query(`DESCRIBE "${zero.links}"`)
      .toArray()
      .map((row) => row.column_name),
  ).toEqual([
    "source",
    "target",
    "sourceIndex",
    "targetIndex",
    "color",
    "weight",
    "width",
    "style",
  ]);
  await store.commit(zero);
  await store.clear();
  expect(
    connection.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'atlas_%'",
    ).numRows,
  ).toBe(0);
});
