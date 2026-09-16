import type { GraphDataset } from "../../core/graph/types";
import type { SourceProgress } from "../../core/diagnostics/progress";
import { SourceRefresh, type RefreshScheduler } from "./source-refresh";

export type GraphSource = (
  signal: AbortSignal,
  report: (progress: SourceProgress) => void,
) => Promise<GraphDataset>;

export interface WorkspaceState {
  data: GraphDataset | null;
  revision: number;
  refreshing: boolean;
  progress: SourceProgress | null;
  error: unknown;
}

/** One source owner per application runtime; sessions borrow its published snapshots. */
export class SourceStore {
  private state: WorkspaceState = {
    data: null,
    revision: 0,
    refreshing: false,
    progress: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  private pending: Promise<GraphDataset | undefined> | null = null;
  private abort: AbortController | null = null;
  private generation = 0;
  private closed = false;
  private readonly reader: GraphSource;
  private readonly scheduling: SourceRefresh;
  readonly dataRef: { readonly current: GraphDataset | null };

  constructor(reader: GraphSource, scheduler: RefreshScheduler) {
    this.reader = reader;
    this.scheduling = new SourceRefresh(() => {
      void this.refresh();
    }, scheduler);
    const readData = () => this.state.data;
    this.dataRef = Object.freeze({
      get current() {
        return readData();
      },
    });
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    if (this.closed) return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  sourceChanged = (version: number) => this.scheduling.sourceChanged(version);
  setActive = (active: boolean) => this.scheduling.setActive(active);

  refresh = (): Promise<GraphDataset | undefined> => {
    if (this.closed) return Promise.resolve(undefined);
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    const sourceVersion = this.scheduling.beginLoad();
    const abort = new AbortController();
    this.abort = abort;
    let succeeded = false;
    let finished = false;
    this.publish({ refreshing: true, error: null, progress: { phase: "preparing" } });
    const owns = () =>
      !finished && !this.closed && this.generation === generation && !abort.signal.aborted;
    const pending = Promise.resolve()
      .then(() => {
        abort.signal.throwIfAborted();
        return this.reader(abort.signal, (progress) => {
          if (owns()) this.publish({ progress });
        });
      })
      .then((data) => {
        if (!owns()) return undefined;
        succeeded = true;
        this.publish({ data, revision: this.state.revision + 1 });
        return data;
      })
      .catch((error) => {
        if (owns()) this.publish({ error });
        return undefined;
      })
      .finally(() => {
        if (!owns()) return;
        finished = true;
        this.pending = null;
        this.abort = null;
        this.publish({ refreshing: false, progress: null });
        this.scheduling.completeLoad(sourceVersion, succeeded);
      });
    this.pending = pending;
    return pending;
  };

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.scheduling.dispose();
    this.abort?.abort();
    this.abort = null;
    this.pending = null;
    this.listeners.clear();
    this.state = {
      data: null,
      revision: this.state.revision,
      refreshing: false,
      progress: null,
      error: null,
    };
  }

  private publish(patch: Partial<WorkspaceState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
