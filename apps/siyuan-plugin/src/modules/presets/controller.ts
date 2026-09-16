import { DEFAULT_FILTERS, type GraphFilters } from "./filters";
import {
  createPresetStore,
  presetFilters,
  presetName,
  readPresetStore,
  samePresetFilters,
  PRESET_LIMIT,
  type FilterPreset,
  type PresetFilters,
  type PresetStore,
} from "./model";

export interface PresetPort {
  load(): Promise<PresetStore | null>;
  save(store: PresetStore): Promise<PresetStore | null>;
  dispose(): void;
}
export interface PresetSnapshot {
  store: PresetStore;
  loading: boolean;
  saving: boolean;
  available: boolean;
  error: string;
  deleted: FilterPreset | null;
}
interface Context {
  getFilters: () => GraphFilters;
  applyFilters: (filters: PresetFilters) => void;
  ruleRevision: () => number;
  sourceReady: () => boolean;
  validate: (filters: PresetFilters) => string;
}
export const initialPresetSnapshot = (): PresetSnapshot => ({
  store: createPresetStore(),
  loading: true,
  saving: false,
  available: false,
  error: "",
  deleted: null,
});

/** A save is committed only after SiYuan acknowledges it. Filter drafts and
 * source navigation remain independent of slow or unsuccessful persistence. */
export class PresetController {
  private snapshot = initialPresetSnapshot();
  private generation = 0;
  private closed = false;
  private pendingRestore = false;
  private undo: { preset: FilterPreset; index: number; active: boolean } | null = null;
  private readonly port: PresetPort;
  private readonly context: Context;
  private readonly publish: (snapshot: PresetSnapshot) => void;

  constructor(port: PresetPort, context: Context, publish: (snapshot: PresetSnapshot) => void) {
    this.port = port;
    this.context = context;
    this.publish = publish;
  }

  async load(restore = false): Promise<void> {
    if (this.closed || this.snapshot.saving) return;
    const generation = ++this.generation;
    this.pendingRestore = restore;
    this.set({ loading: true, available: false, error: "" });
    try {
      const stored = await this.port.load();
      if (this.closed || generation !== this.generation) return;
      const store = stored === null ? createPresetStore() : readPresetStore(stored);
      if (!store) throw new Error("预设数据格式不受支持；原文件保持不变。");
      this.undo = null;
      this.set({ store, loading: false, available: true, error: "", deleted: null });
      this.hydrate();
    } catch (error) {
      if (!this.closed && generation === this.generation)
        this.set({ loading: false, available: false, error: this.message(error) });
    }
  }

  /** Startup preferences wait for actual source availability. Any explicit rule
   * edit, even one later reverted, takes precedence over delayed restoration. */
  hydrate(): void {
    if (this.closed || !this.pendingRestore || this.snapshot.loading || !this.snapshot.available)
      return;
    if (this.context.ruleRevision() !== 0) {
      this.pendingRestore = false;
      return;
    }
    if (!this.context.sourceReady()) return;
    this.pendingRestore = false;
    const preset = this.snapshot.store.presets.find(
      (item) => item.id === this.snapshot.store.activePresetId,
    );
    if (!preset) return;
    const error = this.context.validate(preset.filters);
    if (error) {
      this.set({ error: `${error}预设未自动应用。` });
      return;
    }
    this.context.applyFilters(preset.filters);
  }

  apply(id: string): Promise<boolean> {
    return this.action(() => {
      const preset = this.find(id);
      const error = this.context.validate(preset.filters);
      if (error) throw new Error(error);
      const revision = this.context.ruleRevision();
      const apply = () => {
        if (this.context.ruleRevision() === revision) this.context.applyFilters(preset.filters);
      };
      if (this.snapshot.store.activePresetId === id) {
        apply();
        return true;
      }
      return this.commit({ ...this.snapshot.store, activePresetId: id }, apply);
    });
  }

  create(name: string): Promise<boolean> {
    return this.add(name, presetFilters(DEFAULT_FILTERS));
  }
  saveAs(name: string): Promise<boolean> {
    return this.add(name, presetFilters(this.context.getFilters()), false);
  }
  copy(id: string, name: string): Promise<boolean> {
    return this.action(() => this.add(name, this.find(id).filters));
  }

  rename(id: string, name: string): Promise<boolean> {
    return this.action(() => {
      this.find(id);
      const normalized = presetName(name);
      return this.commit({
        ...this.snapshot.store,
        presets: this.snapshot.store.presets.map((item) =>
          item.id === id ? { ...item, name: normalized } : item,
        ),
      });
    });
  }

  update(): Promise<boolean> {
    return this.action(() => {
      const id = this.snapshot.store.activePresetId;
      if (!id) throw new Error("请将当前筛选另存为新预设。");
      const filters = presetFilters(this.context.getFilters());
      return this.commit({
        ...this.snapshot.store,
        presets: this.snapshot.store.presets.map((item) =>
          item.id === id ? { ...item, filters } : item,
        ),
      });
    });
  }

  remove(id: string): Promise<boolean> {
    return this.action(() => {
      const preset = this.find(id);
      const store = this.snapshot.store;
      const undo = {
        preset,
        index: store.presets.indexOf(preset),
        active: store.activePresetId === id,
      };
      return this.commit(
        {
          ...store,
          presets: store.presets.filter((item) => item.id !== id),
          activePresetId: undo.active ? null : store.activePresetId,
        },
        () => {
          this.undo = undo;
        },
      );
    });
  }

  undoDelete(): Promise<boolean> {
    return this.action(() => {
      const undo = this.undo;
      if (!undo) return true;
      if (this.snapshot.store.presets.length >= PRESET_LIMIT)
        throw new Error(`最多保存 ${PRESET_LIMIT} 个预设。`);
      if (this.snapshot.store.presets.some((item) => item.id === undo.preset.id)) return true;
      const presets = [...this.snapshot.store.presets];
      presets.splice(Math.min(undo.index, presets.length), 0, undo.preset);
      const restoreActive =
        undo.active &&
        !this.snapshot.store.activePresetId &&
        samePresetFilters(this.context.getFilters(), undo.preset.filters);
      return this.commit(
        {
          ...this.snapshot.store,
          presets,
          activePresetId: restoreActive ? undo.preset.id : this.snapshot.store.activePresetId,
        },
        () => {
          this.undo = null;
        },
      );
    });
  }

  dispose(): void {
    this.closed = true;
    this.generation++;
    this.port.dispose();
  }

  private add(name: string, filters: PresetFilters, activate = true): Promise<boolean> {
    return this.action(() => {
      if (this.snapshot.store.presets.length >= PRESET_LIMIT)
        throw new Error(`最多保存 ${PRESET_LIMIT} 个预设。`);
      const error = activate ? this.context.validate(filters) : "";
      if (error) throw new Error(error);
      const preset = {
        id: crypto.randomUUID(),
        name: presetName(name),
        filters: presetFilters(filters),
      };
      const revision = this.context.ruleRevision();
      return this.commit(
        {
          ...this.snapshot.store,
          presets: [...this.snapshot.store.presets, preset],
          activePresetId: preset.id,
        },
        () => {
          if (activate && this.context.ruleRevision() === revision)
            this.context.applyFilters(preset.filters);
        },
      );
    });
  }

  private find(id: string): FilterPreset {
    const preset = this.snapshot.store.presets.find((item) => item.id === id);
    if (!preset) throw new Error("该预设已不可用，请重新读取预设。");
    return preset;
  }

  private async action(run: () => Promise<boolean> | boolean): Promise<boolean> {
    if (this.closed || this.snapshot.loading || this.snapshot.saving) return false;
    if (!this.snapshot.available) {
      this.set({ error: "请先重试读取预设，确认已保存的内容后再操作。" });
      return false;
    }
    try {
      return await run();
    } catch (error) {
      if (!this.closed) this.set({ error: this.message(error) });
      return false;
    }
  }

  private async commit(value: PresetStore, after?: () => void): Promise<boolean> {
    const next = readPresetStore(value);
    if (!next) throw new Error("当前筛选无法保存为预设，请检查范围、类型和名称。");
    this.set({ saving: true, error: "" });
    try {
      const result = await this.port.save(next);
      if (this.closed) return false;
      if (!result || JSON.stringify(result) !== JSON.stringify(next))
        throw new Error("思源返回的预设与本次保存不一致，请重试读取确认。");
      after?.();
      this.set({
        store: result,
        saving: false,
        available: true,
        error: "",
        deleted: this.undo?.preset ?? null,
      });
      return true;
    } catch (error) {
      if (!this.closed) this.set({ saving: false, available: false, error: this.message(error) });
      return false;
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
  private set(patch: Partial<PresetSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.publish(this.snapshot);
  }
}
