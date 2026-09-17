import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageError } from "../../core/diagnostics/message";
import { createLocalDuckDB } from "./local-duckdb";

const mocks = vi.hoisted(() => ({
  features: vi.fn(),
  instantiate: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  close: vi.fn(),
  terminate: vi.fn(),
  stopWorker: vi.fn(),
}));

vi.mock("@duckdb/duckdb-wasm", () => ({
  getPlatformFeatures: mocks.features,
  VoidLogger: class {},
  AsyncDuckDB: class {
    instantiate = mocks.instantiate;
    connect = mocks.connect;
    terminate = mocks.terminate;
  },
}));

const WorkerStub = vi.fn(
  class {
    terminate = mocks.stopWorker;
  },
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.features.mockResolvedValue({ wasmExceptions: true });
  mocks.instantiate.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.terminate.mockResolvedValue(undefined);
  mocks.connect.mockResolvedValue({ query: mocks.query, close: mocks.close });
  vi.stubGlobal("window", {
    location: { href: "https://siyuan.test/plugins/sy-another-graph/ui/index.html" },
  });
  vi.stubGlobal("Worker", WorkerStub);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-duckdb-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("local EH database startup", () => {
  it("reports missing EH without creating a worker or loading WASM", async () => {
    mocks.features.mockResolvedValue({ wasmExceptions: false });
    await expect(createLocalDuckDB(new AbortController().signal)).rejects.toMatchObject({
      name: "MessageError",
      detail: { code: "text.thisBrowserCannotRunTheLocalGraphDatabase" },
    } satisfies Partial<MessageError>);
    expect(WorkerStub).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.instantiate).not.toHaveBeenCalled();
  });

  it("does not probe or allocate resources for an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createLocalDuckDB(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(mocks.features).not.toHaveBeenCalled();
    expect(WorkerStub).not.toHaveBeenCalled();
  });

  it("honors cancellation while capability detection is pending", async () => {
    const controller = new AbortController();
    const pending = createLocalDuckDB(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(WorkerStub).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("loads local EH through the CSP-inheriting worker and releases its resources", async () => {
    const database = await createLocalDuckDB(new AbortController().signal);
    try {
      expect(WorkerStub).toHaveBeenCalledExactlyOnceWith("blob:local-duckdb-test");
      const bootstrap = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
      const script = await bootstrap.text();
      expect(script).toContain('importScripts("https://siyuan.test/');
      expect(script).toContain("duckdb-browser-eh.worker.js");
      expect(script).not.toMatch(/mvp|jsdelivr/);
      expect(mocks.instantiate).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(/^https:\/\/siyuan\.test\/.*duckdb-eh\.wasm$/),
      );
      expect(mocks.query).toHaveBeenCalledExactlyOnceWith(
        "SET autoinstall_known_extensions = false; SET autoload_known_extensions = false;",
      );
      expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:local-duckdb-test");
    } finally {
      await database.dispose();
    }
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.terminate).toHaveBeenCalledOnce();
    expect(mocks.stopWorker).toHaveBeenCalledOnce();
  });
});
