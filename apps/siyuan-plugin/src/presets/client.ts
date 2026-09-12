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

  load(): Promise<PresetStore | null> { return this.send({ type: "preset-load" }); }
  save(store: PresetStore): Promise<PresetStore | null> { return this.send({ type: "preset-save", store }); }

  dispose(): void {
    this.closed = true;
    this.target.removeEventListener("message", this.onMessage);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("预设连接已关闭。"));
    }
    this.pending.clear();
  }

  private send(payload: { type: "preset-load" } | { type: "preset-save"; store: PresetStore }): Promise<PresetStore | null> {
    if (this.closed || this.target.parent === this.target)
      return Promise.reject(new Error("请在思源插件页签中读取和保存预设。"));
    const request = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request);
        reject(new Error("思源未及时回应预设请求，请重试读取后确认保存结果。"));
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
    if (this.closed || event.source !== this.target.parent || event.origin !== this.target.location.origin) return;
    const message: unknown = event.data;
    if (!message || typeof message !== "object") return;
    const value = message as Record<string, unknown>;
    if (value.channel !== WORKBENCH_PRESET_CHANNEL || value.type !== "preset-response" || typeof value.request !== "string") return;
    const pending = this.pending.get(value.request);
    if (!pending) return;
    this.pending.delete(value.request);
    clearTimeout(pending.timer);
    if (value.ok === false && typeof value.error === "string") pending.reject(new Error(value.error));
    else if (value.ok === true && value.store === null) pending.resolve(null);
    else if (value.ok === true) {
      const store = readPresetStore(value.store);
      if (store) pending.resolve(store);
      else pending.reject(new Error("预设数据格式不受支持；原文件保持不变。"));
    } else pending.reject(new Error("思源返回了无效的预设响应。"));
  };
}
