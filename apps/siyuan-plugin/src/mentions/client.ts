import type { MentionRequest, MentionResponse } from "./protocol";
import { EMPTY_MENTION_PROGRESS, type MentionBlock, type MentionMode, type MentionProgress, type MentionResult, type MentionScope } from "./types";

export interface MentionInput {
  blocks: MentionBlock[];
  scope: MentionScope;
  mode: MentionMode;
  chosenIds: readonly string[];
}
export interface MentionSnapshot {
  input: MentionInput | null;
  ready: boolean;
  pending: boolean;
  progress: MentionProgress;
  result: MentionResult;
  error: string;
}
export interface MentionWorkerPort {
  postMessage(message: MentionRequest): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  terminate(): void;
}
export const EMPTY_MENTION_RESULT: MentionResult = { edges: [], truncated: false, ambiguousEdges: 0 };
export const EMPTY_MENTION_SNAPSHOT: MentionSnapshot = {
  input: null, ready: false, pending: false, progress: EMPTY_MENTION_PROGRESS,
  result: EMPTY_MENTION_RESULT, error: "",
};

export class MentionClient {
  private worker: MentionWorkerPort | null = null;
  private blocks: MentionBlock[] | null = null;
  private scope: MentionScope | null = null;
  private revision = 0;
  private scopeRevision = 0;
  private request = 0;
  private closed = false;
  private fatalError = "";
  private snapshot = EMPTY_MENTION_SNAPSHOT;
  private readonly create: () => MentionWorkerPort;
  private readonly publish: (snapshot: MentionSnapshot) => void;

  constructor(create: () => MentionWorkerPort, publish: (snapshot: MentionSnapshot) => void) {
    this.create = create;
    this.publish = publish;
  }

  update(input: MentionInput): void {
    if (this.closed) return;
    if (this.fatalError && this.blocks === input.blocks) {
      this.set({ input, pending: false, result: EMPTY_MENTION_RESULT, error: this.fatalError });
      return;
    }
    try {
      if (this.fatalError) { this.stopWorker(); this.fatalError = ""; }
      if (!this.worker) {
        this.worker = this.create();
        this.worker.addEventListener("message", this.onMessage);
        this.worker.addEventListener("error", this.onError);
        this.worker.addEventListener("messageerror", this.onError);
      }
      if (this.blocks !== input.blocks) {
        this.blocks = input.blocks;
        this.scope = null;
        this.revision++;
        this.scopeRevision = 0;
        this.snapshot = { ...EMPTY_MENTION_SNAPSHOT };
        this.worker.postMessage({ kind: "load", revision: this.revision, blocks: input.blocks });
      }
      if (this.scope !== input.scope) {
        this.scope = input.scope;
        this.scopeRevision++;
        this.worker.postMessage({ kind: "scope", revision: this.revision, scopeRevision: this.scopeRevision, scope: input.scope });
      }
      this.request++;
      this.set({ input, pending: input.mode !== "off" && !(input.mode === "selected" && !input.chosenIds.length), result: EMPTY_MENTION_RESULT, error: "" });
      this.worker.postMessage({ kind: "query", revision: this.revision, scopeRevision: this.scopeRevision, request: this.request, mode: input.mode, chosenIds: input.chosenIds });
    } catch (error) {
      this.set({ input, pending: false, result: EMPTY_MENTION_RESULT,
        error: error instanceof Error ? error.message : String(error) });
    }
  }

  retry(): void {
    const input = this.snapshot.input;
    if (!input || this.closed) return;
    this.stopWorker();
    this.fatalError = "";
    this.blocks = null;
    this.scope = null;
    this.update(input);
  }

  dispose(): void { this.closed = true; this.stopWorker(); }

  private stopWorker(): void {
    this.worker?.removeEventListener("message", this.onMessage);
    this.worker?.removeEventListener("error", this.onError);
    this.worker?.removeEventListener("messageerror", this.onError);
    this.worker?.terminate();
    this.worker = null;
  }

  private onMessage: EventListener = event => {
    const message = (event as MessageEvent<MentionResponse>).data;
    if (this.closed || message.revision !== this.revision) return;
    if (message.kind === "progress" || message.kind === "ready") {
      this.set({ progress: message.progress, ...(message.kind === "ready" ? { ready: true } : {}) });
    } else if (message.kind === "result") {
      if (message.scopeRevision === this.scopeRevision && message.request === this.request)
        this.set({ pending: false, result: message.result });
    } else if (message.kind === "error") {
      if (message.scopeRevision !== undefined && message.scopeRevision !== this.scopeRevision) return;
      if (message.request !== undefined && message.request !== this.request) return;
      if (message.scopeRevision === undefined) this.fatalError = message.message;
      this.set({ pending: false, result: EMPTY_MENTION_RESULT, error: message.message });
    }
  };

  private onError: EventListener = () => {
    if (this.closed) return;
    this.fatalError = "文本提及索引未能完成，可重试；现有关系仍可使用。";
    this.set({ ready: false, pending: false, result: EMPTY_MENTION_RESULT, error: this.fatalError });
  };

  private set(patch: Partial<MentionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.publish(this.snapshot);
  }
}
