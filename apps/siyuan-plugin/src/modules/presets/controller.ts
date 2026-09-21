import {
  message as msg,
  MessageError,
  failureOf,
  type Failure,
} from "../../core/diagnostics/message";
import { DEFAULT_FILTERS, type GraphFilters } from "./filters";
import { defaultGrouping, type LayoutGrouping } from "../layout-groups/model";
import {
  createPresetStore,
  presetFilters,
  presetName,
  readPresetStore,
  samePresetFilters,
  migratePresetGrouping,
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
  error: Failure;
  deleted: FilterPreset | null;
}
interface Context {
  defaultName?: () => string;
  legacyGrouping?: () => LayoutGrouping;
  getFilters: () => GraphFilters;
  applyFilters: (filters: PresetFilters) => void;
  ruleRevision: () => number;
  sourceReady: () => boolean;
  validate: (filters: PresetFilters) => Failure;
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
  private pendingLegacyGrouping: LayoutGrouping | null = null;
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
    this.pendingLegacyGrouping = null;
    this.set({ loading: true, available: false, error: "" });
    try {
      const stored = await this.port.load();
      if (this.closed || generation !== this.generation) return;
      const legacy = this.context.legacyGrouping?.() ?? defaultGrouping();
      const restored =
        stored === null
          ? createPresetStore(this.context.defaultName?.(), legacy)
          : readPresetStore(stored);
      const store = restored && migratePresetGrouping(restored, legacy);
      if (!store) throw new MessageError(msg("text.thePresetFormatIsUnsupportedTheOriginalFile"));
      this.pendingLegacyGrouping =
        restore && restored?.version === 1 && !store.activePresetId ? legacy : null;
      this.undo = null;
      this.set({ store, loading: false, available: true, error: "", deleted: null });
      this.hydrate();
    } catch (error) {
      if (!this.closed && generation === this.generation)
        this.set({ loading: false, available: false, error: failureOf(error) });
    }
  }

  /** Startup preferences wait for actual source availability. Any explicit rule
   * edit, even one later reverted, takes precedence over delayed restoration. */
  hydrate(): void {
    if (this.closed || !this.pendingRestore || this.snapshot.loading || !this.snapshot.available)
      return;
    if (this.context.ruleRevision() !== 0) {
      this.pendingRestore = false;
      this.pendingLegacyGrouping = null;
      return;
    }
    if (!this.context.sourceReady()) return;
    this.pendingRestore = false;
    const preset = this.snapshot.store.presets.find(
      (item) => item.id === this.snapshot.store.activePresetId,
    );
    const legacy = this.pendingLegacyGrouping;
    this.pendingLegacyGrouping = null;
    if (!preset) {
      // Old global community settings also applied when no saved preset was selected.
      if (legacy)
        this.context.applyFilters(
          presetFilters({ ...this.context.getFilters(), grouping: legacy }),
        );
      return;
    }
    const error = this.context.validate(preset.filters);
    if (error) {
      this.set({ error: msg("text.valueThePresetWasNotAppliedAutomatically", { p0: error }) });
      return;
    }
    this.context.applyFilters(preset.filters);
  }

  apply(id: string): Promise<boolean> {
    return this.action(() => {
      const preset = this.find(id);
      const error = this.context.validate(preset.filters);
      if (error) throw new MessageError(error);
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
      if (!id) throw new MessageError(msg("text.saveTheCurrentFiltersAsANewPreset"));
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
        throw new MessageError(msg("text.youCanSaveUpToValuePresets", { p0: PRESET_LIMIT }));
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
        throw new MessageError(msg("text.youCanSaveUpToValuePresets", { p0: PRESET_LIMIT }));
      const error = activate ? this.context.validate(filters) : "";
      if (error) throw new MessageError(error);
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
    if (!preset) throw new MessageError(msg("text.thisPresetIsNoLongerAvailableReloadPresets"));
    return preset;
  }

  private async action(run: () => Promise<boolean> | boolean): Promise<boolean> {
    if (this.closed || this.snapshot.loading || this.snapshot.saving) return false;
    if (!this.snapshot.available) {
      this.set({ error: msg("text.reloadPresetsAndConfirmTheirSavedStateBefore") });
      return false;
    }
    try {
      return await run();
    } catch (error) {
      if (!this.closed) this.set({ error: failureOf(error) });
      return false;
    }
  }

  private async commit(value: PresetStore, after?: () => void): Promise<boolean> {
    const next = readPresetStore(value);
    if (!next) throw new MessageError(msg("text.theseFiltersCannotBeSavedAsAPreset"));
    this.set({ saving: true, error: "" });
    try {
      const result = await this.port.save(next);
      if (this.closed) return false;
      if (!result || JSON.stringify(result) !== JSON.stringify(next))
        throw new MessageError(msg("text.siyuanReturnedADifferentPresetFromTheOne"));
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
      if (!this.closed) this.set({ saving: false, available: false, error: failureOf(error) });
      return false;
    }
  }

  private set(patch: Partial<PresetSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.publish(this.snapshot);
  }
}
