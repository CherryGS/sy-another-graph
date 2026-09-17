import { isFailure, message, MessageError } from "../../core/diagnostics/message";
import {
  columnTransfers,
  type GraphColumns,
  type GraphIPC,
  type PreparationRequest,
  type PreparationResponse,
} from "./preparation-protocol";

export const PREPARATION_TIMEOUT_MS = 60_000;
export interface PreparationWorker {
  postMessage(message: PreparationRequest, transfer: ArrayBuffer[]): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  terminate(): void;
}
interface Pending {
  request: number;
  points: number;
  links: number;
  resolve: (value: GraphIPC) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
}

const cancelled = () => new DOMException("Graph preparation cancelled", "AbortError");
const failed = () => new MessageError(message("graph.preparationFailed"));

/** One lazy encoder per canvas, reused after success and replaced after interruption. */
export class GraphPreparationClient {
  private worker: PreparationWorker | null = null;
  private detach: (() => void) | null = null;
  private pending: Pending | null = null;
  private sequence = 0;
  private closed = false;
  private readonly create: () => PreparationWorker;
  constructor(
    create: () => PreparationWorker = () =>
      new Worker(new URL("./graph-preparation.worker.ts", import.meta.url), { type: "module" }),
  ) {
    this.create = create;
  }

  encode = (columns: GraphColumns, signal: AbortSignal): Promise<GraphIPC> => {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.closed) return Promise.reject(cancelled());
    this.rejectPending(cancelled());
    const request = ++this.sequence;
    return new Promise((resolve, reject) => {
      const abort = () => this.rejectRequest(request, signal.reason);
      const timer = setTimeout(
        () =>
          this.rejectRequest(
            request,
            new MessageError(
              message("graph.preparationTimeout", { seconds: PREPARATION_TIMEOUT_MS / 1000 }),
            ),
          ),
        PREPARATION_TIMEOUT_MS,
      );
      signal.addEventListener("abort", abort, { once: true });
      this.pending = {
        request,
        points: columns.points.id.length,
        links: columns.links.sourceIndex.length,
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
        },
      };
      try {
        if (!this.worker) {
          const worker = this.create();
          const receive: EventListener = (event) => {
            if (this.worker === worker) this.receive((event as MessageEvent<unknown>).data);
          };
          const fail: EventListener = () => {
            if (this.worker === worker) {
              this.rejectPending(failed());
              this.stopWorker();
            }
          };
          this.worker = worker;
          worker.addEventListener("message", receive);
          worker.addEventListener("error", fail);
          worker.addEventListener("messageerror", fail);
          this.detach = () => {
            worker.removeEventListener("message", receive);
            worker.removeEventListener("error", fail);
            worker.removeEventListener("messageerror", fail);
          };
        }
        this.worker.postMessage({ request, columns }, columnTransfers(columns));
      } catch (error) {
        this.rejectRequest(request, error);
      }
    });
  };

  dispose(): void {
    this.closed = true;
    this.rejectPending(cancelled());
    this.stopWorker();
  }

  private stopWorker(): void {
    this.detach?.();
    this.detach = null;
    this.worker?.terminate();
    this.worker = null;
  }
  private rejectRequest(request: number, error: unknown): void {
    if (this.pending?.request === request) this.rejectPending(error);
  }
  private rejectPending(error: unknown): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    pending.cleanup();
    this.stopWorker();
    pending.reject(error);
  }
  private receive(value: unknown): void {
    const pending = this.pending;
    if (!pending) return;
    if (!value || typeof value !== "object") {
      this.rejectPending(failed());
      return;
    }
    const data = value as Partial<PreparationResponse>;
    if (!Number.isSafeInteger(data.request)) {
      this.rejectPending(failed());
      return;
    }
    if (data.request !== pending.request) return;
    if (data.kind === "error") {
      this.rejectPending(isFailure(data.error) ? new MessageError(data.error) : failed());
      return;
    }
    if (
      data.kind !== "prepared" ||
      data.pointsCount !== pending.points ||
      data.linksCount !== pending.links ||
      !(data.ipc?.points instanceof Uint8Array) ||
      !(data.ipc.links instanceof Uint8Array) ||
      !(data.ipc.points.buffer instanceof ArrayBuffer) ||
      !(data.ipc.links.buffer instanceof ArrayBuffer) ||
      !data.ipc.points.byteLength ||
      !data.ipc.links.byteLength ||
      !Number.isFinite(data.ipc.encodingMs) ||
      data.ipc.encodingMs < 0
    ) {
      this.rejectPending(failed());
      return;
    }
    this.pending = null;
    pending.cleanup();
    pending.resolve(data.ipc);
  }
}
