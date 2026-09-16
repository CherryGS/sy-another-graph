import {
  message as msg,
  MessageError,
  failureOf,
  type Failure,
} from "../../../core/diagnostics/message";
import { readPresetStore, type PresetStore } from "../../../modules/presets/model";
import {
  isPresetRequestId,
  WORKBENCH_PRESET_CHANNEL,
  type PresetResponse,
} from "../../../modules/presets/host-protocol";

export const PRESET_STORAGE_FILE = "filter-presets.json";
const PRESET_STORAGE_PATH = "/data/storage/petal/sy-another-graph/filter-presets.json";
const REQUEST_TIMEOUT_MS = 10_000;

interface PluginDataStorage {
  loadData(name: string): Promise<unknown>;
  saveData(name: string, data: PresetStore): Promise<unknown>;
}

function errorMessage(error: unknown): Failure {
  if (error instanceof MessageError) return failureOf(error);
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "msg" in error &&
          typeof error.msg === "string"
        ? error.msg
        : msg("text.storageRequestFailed");
  if (typeof message !== "string") return message;
  return Array.from(message, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) ? " " : character;
  })
    .join("")
    .slice(0, 240);
}

/** Only the owned iframe can read/write this one plugin data file. */
export class PresetStorage {
  private readonly storage: PluginDataStorage;
  private readonly ownsMessage: (event: MessageEvent) => boolean;
  private readonly origin: string;
  private readonly fetcher: typeof fetch;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly controllers = new Set<AbortController>();
  private readonly pending = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private initialized = false;
  private disposed = false;

  constructor(
    storage: PluginDataStorage,
    ownsMessage: (event: MessageEvent) => boolean,
    origin: string,
    fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.storage = storage;
    this.ownsMessage = ownsMessage;
    this.origin = origin;
    this.fetcher = fetcher;
  }

  handle(event: MessageEvent): boolean {
    if (this.disposed || event.origin !== this.origin || !this.ownsMessage(event)) return false;
    const data = event.data as Record<string, unknown> | null;
    if (
      data?.channel !== WORKBENCH_PRESET_CHANNEL ||
      (data.type !== "preset-load" && data.type !== "preset-save") ||
      !isPresetRequestId(data.request)
    )
      return false;
    const request = data.request;
    if (this.pending.has(request)) return true;
    const store = data.type === "preset-save" ? readPresetStore(data.store) : null;
    if (data.type === "preset-save" && !store) {
      this.reply(event, {
        channel: WORKBENCH_PRESET_CHANNEL,
        type: "preset-response",
        request,
        ok: false,
        error: msg("text.invalidPresetContentNothingWasSaved"),
      });
      return true;
    }
    this.pending.add(request);
    let replied = false;
    const respond = (
      result: { ok: true; store: PresetStore | null } | { ok: false; error: Failure },
    ) => {
      if (replied) return;
      replied = true;
      clearTimeout(timer);
      this.timers.delete(timer);
      this.pending.delete(request);
      this.reply(event, {
        channel: WORKBENCH_PRESET_CHANNEL,
        type: "preset-response",
        request,
        ...result,
      });
    };
    const timer = setTimeout(
      () => respond({ ok: false, error: msg("text.presetStorageDidNotFinishRetryLaterReload") }),
      REQUEST_TIMEOUT_MS,
    );
    this.timers.add(timer);
    this.queue = this.queue.then(async () => {
      // An expired request must not later start a stale write behind a retry.
      if (this.disposed || replied) return;
      try {
        if (store) {
          if (!this.initialized) throw new MessageError(msg("text.reloadPresetsBeforeSaving"));
          // Preserve an existing malformed file even if it changed after load.
          await this.readVerifiedFile();
          if (this.disposed || replied) return;
          const result = await this.storage.saveData(PRESET_STORAGE_FILE, store);
          if (
            typeof result !== "object" ||
            result === null ||
            !("code" in result) ||
            result.code !== 0
          ) {
            throw new MessageError(msg("text.saveFailedValue", { p0: errorMessage(result) }));
          }
          respond({ ok: true, store });
        } else {
          this.initialized = false;
          await this.storage.loadData(PRESET_STORAGE_FILE);
          if (this.disposed || replied) return;
          // SiYuan loadData can return a cached value or an empty string after
          // a failed read. Verify against the fixed file path before treating
          // anything as missing or allowing a subsequent default write.
          const loaded = await this.readVerifiedFile();
          if (this.disposed || replied) return;
          this.initialized = true;
          respond({ ok: true, store: loaded });
        }
      } catch (error) {
        respond({ ok: false, error: errorMessage(error) });
      }
      // A timeout sends an error but does not race the underlying save promise:
      // later saves stay serialized until its outcome is known.
    });
    return true;
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers) clearTimeout(timer);
    for (const controller of this.controllers) controller.abort();
    this.timers.clear();
    this.controllers.clear();
    this.pending.clear();
  }

  private reply(event: MessageEvent, response: PresetResponse): void {
    if (this.disposed || !this.ownsMessage(event)) return;
    (event.source as Window | null)?.postMessage(response, this.origin);
  }

  private async readVerifiedFile(): Promise<PresetStore | null> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    this.timers.add(timer);
    try {
      const response = await this.fetcher("/api/file/getFile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: PRESET_STORAGE_PATH }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new MessageError(msg("text.failedToReadPresetsHttpValue", { p0: response.status }));
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new MessageError(msg("text.thePresetFileIsNotValidJsonThe"));
      }
      if (response.status === 202) {
        if (typeof data === "object" && data !== null && "code" in data && data.code === 404)
          return null;
        throw new MessageError(msg("text.failedToReadPresetsValue", { p0: errorMessage(data) }));
      }
      const store = readPresetStore(data);
      if (!store) throw new MessageError(msg("text.thePresetFileIsInvalidOrItsVersion"));
      return store;
    } finally {
      clearTimeout(timer);
      this.timers.delete(timer);
      this.controllers.delete(controller);
    }
  }
}
