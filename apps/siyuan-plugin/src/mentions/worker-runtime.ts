import { MentionIndex } from "./mention-index";
import type { MentionRequest, MentionResponse } from "./protocol";
import type { MentionBlock, MentionScope } from "./types";

/** Background indexing and foreground queries share one cache, with separate
 * cancellation domains so changing selection never restarts corpus scanning. */
export class MentionWorkerRuntime {
  private index = new MentionIndex();
  private blocks: MentionBlock[] = [];
  private revision = 0;
  private scopeRevision = 0;
  private scope: MentionScope = { entries: [], explicitPairs: [] };
  private request: Extract<MentionRequest, { kind: "query" }> | null = null;
  private warming: AbortController | null = null;
  private querying: AbortController | null = null;
  private closed = false;
  private readonly publish: (message: MentionResponse) => void;

  constructor(publish: (message: MentionResponse) => void) {
    this.publish = publish;
  }

  receive(message: MentionRequest): void {
    if (this.closed) return;
    if (message.kind === "load" || message.kind === "exclusions") {
      if (message.revision <= this.revision) return;
      this.warming?.abort();
      this.querying?.abort();
      this.revision = message.revision;
      this.scopeRevision = 0;
      this.request = null;
      const abort = new AbortController();
      this.warming = abort;
      if (message.kind === "load") this.blocks = message.blocks;
      try {
        this.index.replace(this.blocks, message.excludedPhrases);
      } catch (error) {
        this.fail(error, message.revision);
        return;
      }
      void this.index
        .warm((progress) => {
          if (!abort.signal.aborted && !this.closed)
            this.publish({ kind: "progress", revision: message.revision, progress });
        }, abort.signal)
        .then(() => {
          if (abort.signal.aborted || this.closed) return;
          this.publish({
            kind: "ready",
            revision: message.revision,
            progress: { ...this.index.progress },
          });
          this.runQuery();
        })
        .catch((error) => {
          if (!abort.signal.aborted) this.fail(error, message.revision);
        });
      return;
    }
    if (message.revision !== this.revision) return;
    if (message.kind === "scope") {
      if (message.scopeRevision <= this.scopeRevision) return;
      this.querying?.abort();
      this.scope = message.scope;
      this.scopeRevision = message.scopeRevision;
      this.request = null;
      return;
    }
    if (
      message.scopeRevision !== this.scopeRevision ||
      (this.request && message.request <= this.request.request)
    )
      return;
    this.querying?.abort();
    this.request = message;
    if (message.mode === "selected") this.index.prioritize(message.chosenIds);
    this.runQuery();
  }

  dispose(): void {
    this.closed = true;
    this.warming?.abort();
    this.querying?.abort();
    this.request = null;
    this.blocks = [];
  }

  private runQuery(): void {
    const request = this.request;
    if (
      !request ||
      this.closed ||
      (!this.index.ready &&
        request.mode !== "off" &&
        !(request.mode === "selected" && !request.chosenIds.length))
    )
      return;
    this.querying?.abort();
    const abort = new AbortController();
    this.querying = abort;
    void this.index
      .query(this.scope, request.mode, request.chosenIds, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted && !this.closed && this.request === request)
          this.publish({
            kind: "result",
            revision: request.revision,
            scopeRevision: request.scopeRevision,
            request: request.request,
            result,
          });
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          this.fail(error, request.revision, request.scopeRevision, request.request);
      });
  }

  private fail(error: unknown, revision: number, scopeRevision?: number, request?: number): void {
    if (!this.closed)
      this.publish({
        kind: "error",
        revision,
        scopeRevision,
        request,
        message: error instanceof Error ? error.message : String(error),
      });
  }
}
