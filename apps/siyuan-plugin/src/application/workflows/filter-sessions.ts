import { DEFAULT_FILTERS, type GraphFilters } from "../../modules/presets/filters";
import { samePresetFilters } from "../../modules/presets/model";
import type { SearchGraphSnapshot } from "../../modules/search/model";

type FilterAction = GraphFilters | ((previous: GraphFilters) => GraphFilters);
const defaults = (): GraphFilters => ({
  ...DEFAULT_FILTERS,
  excludeIds: [],
  hiddenTypes: [],
  excludedMentionPhrases: [],
  excludedMentionPatterns: [],
});
const searchDefaults = (): GraphFilters => ({
  ...defaults(),
  documentsOnly: false,
  hierarchy: true,
});
export interface TemporarySearch {
  snapshot: SearchGraphSnapshot;
  /** Original hits; ancestor context is derived from the current source data. */
  ids: ReadonlySet<string>;
  filters: GraphFilters;
}

/** Normal filters are the only state exposed to PresetController. Switching to
 * a temporary search never captures, restores, or writes a persisted preset. */
export class FilterSessions {
  readonly normalRef = { current: defaults() };
  readonly ruleRevisionRef = { current: 0 };
  private listeners = new Set<() => void>();
  private state = {
    normal: this.normalRef.current,
    temporary: null as TemporarySearch | null,
    active: false,
  };
  generation = 0;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish = (patch: Partial<typeof this.state>) => {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  };
  setNormal = (action: FilterAction) => {
    const previous = this.normalRef.current;
    const next = typeof action === "function" ? action(previous) : action;
    if (next === previous) return;
    if (!samePresetFilters(previous, next)) this.ruleRevisionRef.current++;
    this.normalRef.current = next;
    this.publish({ normal: next });
  };
  setFilters = (action: FilterAction) => {
    const temporary = this.state.active && this.state.temporary;
    if (!temporary) {
      this.setNormal(action);
      return;
    }
    const next = typeof action === "function" ? action(temporary.filters) : action;
    this.generation++;
    this.publish({ temporary: { ...temporary, filters: next } });
  };
  search = (snapshot: SearchGraphSnapshot) => {
    if (this.state.temporary?.snapshot.requestId === snapshot.requestId) return;
    this.generation++;
    this.publish({
      temporary: { snapshot, ids: new Set(snapshot.ids), filters: searchDefaults() },
      active: true,
    });
  };
  reset = () => this.setFilters(this.state.active ? searchDefaults() : defaults());
  resume = () => {
    if (!this.state.temporary) return;
    this.generation++;
    this.publish({ active: true });
  };
  leave = () => {
    this.generation++;
    this.publish({ active: false });
  };
  scope = (id: string) => {
    this.leave();
    this.setNormal((previous) => ({ ...previous, scopeId: id }));
  };
  async switchNormal(action: () => Promise<boolean>): Promise<boolean> {
    const generation = this.generation;
    const applied = await action();
    if (!applied || generation !== this.generation) return false;
    this.leave();
    return true;
  }
}
