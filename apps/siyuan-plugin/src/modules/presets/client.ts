import { message as msg, MessageError, isFailure } from "../../core/diagnostics/message";
import { readPresetStore, type PresetStore } from "./model";
import { WORKBENCH_PRESET_CHANNEL, type PresetRequest } from "./host-protocol";

interface Pending {
  resolve: (store: PresetStore | null) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Correlated requests to the owned SiYuan host; no browser-local fallback. */
export class PresetClient {
  private readonly pending = new Map<string, Pending>();
  private closed = false;
  private readonly target: Window;
  private readonly timeout: number;
  constructor(target: Window, timeout = 15_000) {
    this.target = target;
    this.timeout = timeout;
    target.addEventListener("message", this.onMessage);
  }

  load(): Promise<PresetStore | null> {
    return this.send({ type: "preset-load" });
  }
  save(store: PresetStore): Promise<PresetStore | null> {
    return this.send({ type: "preset-save", store });
  }

  dispose(): void {
    this.closed = true;
    this.target.removeEventListener("message", this.onMessage);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new MessageError(msg("text.thePresetConnectionIsClosed")));
    }
    this.pending.clear();
  }

  private send(
    payload: { type: "preset-load" } | { type: "preset-save"; store: PresetStore },
  ): Promise<PresetStore | null> {
    if (this.closed || this.target.parent === this.target)
      return Promise.reject(new MessageError(msg("text.openTheGraphInASiyuanPluginTab")));
    const request = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request);
        reject(new MessageError(msg("text.siyuanDidNotRespondToThePresetRequest")));
      }, this.timeout);
      this.pending.set(request, { resolve, reject, timer });
      try {
        const message: PresetRequest = { channel: WORKBENCH_PRESET_CHANNEL, request, ...payload };
        this.target.parent.postMessage(message, this.target.location.origin);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(request);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private onMessage = (event: MessageEvent) => {
    if (
      this.closed ||
      event.source !== this.target.parent ||
      event.origin !== this.target.location.origin
    )
      return;
    const message: unknown = event.data;
    if (!message || typeof message !== "object") return;
    const value = message as Record<string, unknown>;
    if (
      value.channel !== WORKBENCH_PRESET_CHANNEL ||
      value.type !== "preset-response" ||
      typeof value.request !== "string"
    )
      return;
    const pending = this.pending.get(value.request);
    if (!pending) return;
    this.pending.delete(value.request);
    clearTimeout(pending.timer);
    if (value.ok === false && isFailure(value.error)) pending.reject(new MessageError(value.error));
    else if (value.ok === true && value.store === null) pending.resolve(null);
    else if (value.ok === true) {
      const store = readPresetStore(value.store);
      if (store) pending.resolve(store);
      else
        pending.reject(new MessageError(msg("text.thePresetFormatIsUnsupportedTheOriginalFile")));
    } else pending.reject(new MessageError(msg("text.siyuanReturnedAnInvalidPresetResponse")));
  };
}
