import { failureOf, message, type Failure } from "../../core/diagnostics/message";
import type { MentionBlock } from "./types";
import { EXCLUSION_BUILD_TIMEOUT_MS, type MentionExclusions } from "./exclusions";
import type { ExclusionPreviewPage, MentionNameSource } from "./exclusion-preview";
import type {
  ExclusionPreviewRequest,
  ExclusionPreviewResponse,
} from "./exclusion-preview-protocol";

export interface ExclusionPreviewInput {
  blocks: readonly MentionBlock[];
  rules: MentionExclusions;
}
export interface ExclusionPreviewSnapshot {
  input: ExclusionPreviewInput | null;
  pending: boolean;
  page: ExclusionPreviewPage | null;
  error: Failure;
}
export interface ExclusionPreviewWorker {
  postMessage(message: ExclusionPreviewRequest): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  terminate(): void;
}
export const EMPTY_EXCLUSION_PREVIEW: ExclusionPreviewSnapshot = {
  input: null,
  pending: false,
  page: null,
  error: "",
};

/** Omit Markdown and unnamed blocks from this independently cancellable task. */
export async function compactMentionNames(
  blocks: readonly MentionBlock[],
  signal: AbortSignal,
): Promise<MentionNameSource[]> {
  const names: MentionNameSource[] = [];
  for (let offset = 0; offset < blocks.length; offset += 8192) {
    signal.throwIfAborted();
    for (const block of blocks.slice(offset, offset + 8192)) {
      if (block.title || block.ial.includes("name=") || block.ial.includes("alias="))
        names.push({ id: block.id, title: block.title, ial: block.ial });
    }
    if (offset + 8192 < blocks.length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  return names;
}

export class ExclusionPreviewClient {
  private worker: ExclusionPreviewWorker | null = null;
  private source: readonly MentionBlock[] | null = null;
  private revision = 0;
  private request = 0;
  private pageRequest = 0;
  private closed = false;
  private preparation: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private snapshot = EMPTY_EXCLUSION_PREVIEW;
  private readonly create: () => ExclusionPreviewWorker;
  private readonly publish: (snapshot: ExclusionPreviewSnapshot) => void;

  constructor(
    create: () => ExclusionPreviewWorker,
    publish: (snapshot: ExclusionPreviewSnapshot) => void,
  ) {
    this.create = create;
    this.publish = publish;
  }

  async update(input: ExclusionPreviewInput): Promise<void> {
    if (this.closed) return;
    this.cancel();
    const request = this.request;
    const controller = new AbortController();
    this.preparation = controller;
    this.set({ input, pending: true, page: null, error: "" });
    try {
      let names: MentionNameSource[] | null = null;
      if (!this.worker || this.source !== input.blocks) {
        this.stopWorker();
        names = await compactMentionNames(input.blocks, controller.signal);
        controller.signal.throwIfAborted();
        this.worker = this.create();
        this.worker.addEventListener("message", this.onMessage);
        this.worker.addEventListener("error", this.onError);
        this.worker.addEventListener("messageerror", this.onError);
        this.source = input.blocks;
        this.revision++;
      }
      this.pageRequest = 0;
      this.watch();
      if (names) this.worker!.postMessage({ kind: "load", revision: this.revision, blocks: names });
      this.worker!.postMessage({
        kind: "preview",
        revision: this.revision,
        request,
        rules: input.rules,
      });
    } catch (error) {
      if (!controller.signal.aborted) this.fail(failureOf(error));
    } finally {
      if (this.preparation === controller) this.preparation = null;
    }
  }

  page(offset: number, query: string): void {
    if (this.closed || !this.worker || !this.snapshot.page || this.snapshot.error) return;
    this.pageRequest++;
    this.set({ pending: true });
    this.watch();
    try {
      this.worker.postMessage({
        kind: "page",
        revision: this.revision,
        request: this.request,
        pageRequest: this.pageRequest,
        offset,
        query,
      });
    } catch (error) {
      this.fail(failureOf(error));
    }
  }

  cancel(): void {
    this.preparation?.abort();
    this.preparation = null;
    if (this.timer !== null) this.stopWorker();
    this.request++;
    this.pageRequest = 0;
  }
  dispose(): void {
    this.closed = true;
    this.cancel();
    this.stopWorker();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private stopWorker(): void {
    this.clearTimer();
    this.worker?.removeEventListener("message", this.onMessage);
    this.worker?.removeEventListener("error", this.onError);
    this.worker?.removeEventListener("messageerror", this.onError);
    this.worker?.terminate();
    this.worker = null;
    this.source = null;
  }
  private watch(): void {
    this.clearTimer();
    this.timer = setTimeout(
      () =>
        this.fail(
          message("mentions.previewTimeout", { seconds: EXCLUSION_BUILD_TIMEOUT_MS / 1000 }),
        ),
      EXCLUSION_BUILD_TIMEOUT_MS,
    );
  }
  private fail(error: Failure): void {
    this.stopWorker();
    this.request++;
    this.set({ pending: false, page: null, error });
  }
  private onError: EventListener = () => {
    if (!this.closed) this.fail(message("mentions.previewFailed"));
  };
  private onMessage: EventListener = (event) => {
    const data = (event as MessageEvent<ExclusionPreviewResponse>).data;
    if (
      this.closed ||
      data.revision !== this.revision ||
      (data.request !== undefined && data.request !== this.request) ||
      (data.pageRequest !== undefined && data.pageRequest !== this.pageRequest)
    )
      return;
    if (data.kind === "error") this.fail(data.error);
    else {
      this.clearTimer();
      this.set({ pending: false, page: data.page, error: "" });
    }
  };
  private set(patch: Partial<ExclusionPreviewSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.publish(this.snapshot);
  }
}
