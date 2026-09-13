import { Plugin, openTab, showMessage, type Custom } from "siyuan";
import {
  PersistentWorkbench,
  WORKBENCH_CHANNEL,
} from "./host/persistent-workbench";
import { isNativeBlockId, registerScopeMenus } from "./host/scope-menu";
import { registerSourceChanges } from "./host/source-events";
import { PresetStorage } from "./host/preset-storage";
import { GraphTabTitle, DEFAULT_GRAPH_TAB_TITLE } from "./host/graph-tab-title";
import { registerSearchGraphs } from "./host/search-graphs";

const TAB_TYPE = "atlas";

export default class SiYuanGraphPlugin extends Plugin {
  private workbench: PersistentWorkbench | null = null;
  private opening: ReturnType<typeof openTab> | null = null;
  private unloaded = false;
  private removeScopeMenus: (() => void) | null = null;
  private removeSourceChanges: (() => void) | null = null;
  private removeSearchGraphs: (() => void) | null = null;
  private presetStorage: PresetStorage | null = null;
  private graphTitle: GraphTabTitle | null = null;

  onload() {
    this.unloaded = false;
    const workbench = new PersistentWorkbench(this.name);
    this.workbench = workbench;
    const ownsMessage = (event: MessageEvent) => workbench.ownsMessage(event);
    this.presetStorage = new PresetStorage(this, ownsMessage, window.location.origin);
    const graphTitle = new GraphTabTitle(ownsMessage);
    this.graphTitle = graphTitle;
    this.addIcons(
      '<symbol id="iconAtlasGraph" viewBox="0 0 24 24"><path d="m7 7 10 2M7 7l4 11m6-9-6 9" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="6" r="3" fill="currentColor"/><circle cx="18" cy="9" r="3" fill="currentColor"/><circle cx="11" cy="19" r="3" fill="currentColor"/></symbol>',
    );
    this.addTab({
      type: TAB_TYPE,
      init(this: Custom) {
        (this.element as HTMLElement).style.cssText =
          "height:100%;width:100%;min-width:0;min-height:0;overflow:hidden;";
        workbench.attach(this.element as HTMLElement);
        graphTitle.attach(this.tab);
      },
      resize() {
        workbench.refresh();
      },
      update() {
        workbench.refresh();
      },
      beforeDestroy(this: Custom) {
        graphTitle.detach(this.tab);
        workbench.detach(this.element as HTMLElement);
      },
      destroy(this: Custom) {
        graphTitle.detach(this.tab);
        workbench.detach(this.element as HTMLElement);
      },
    });
    this.addTopBar({
      icon: "iconAtlasGraph",
      title: "一个思源图谱",
      position: "right",
      callback: () => {
        void this.openGraph();
      },
    });
    this.addCommand({
      langKey: "openAtlasGraph",
      langText: "打开一个思源图谱",
      hotkey: "⌥⇧G",
      callback: () => {
        void this.openGraph();
      },
    });
    window.addEventListener("message", this.onMessage);
    this.eventBus.on("switch-protyle", this.onHostSwitch);
    this.removeScopeMenus = registerScopeMenus(this.eventBus, (id) => {
      if (this.unloaded) return;
      workbench.requestScope(id);
      void this.openGraph();
    });
    this.removeSourceChanges = registerSourceChanges(this.eventBus, () => {
      if (!this.unloaded) workbench.markSourceChanged();
    });
    this.removeSearchGraphs = registerSearchGraphs(this.eventBus, async snapshot => {
      if (this.unloaded) return;
      workbench.requestSearch(snapshot);
      await this.openGraph();
    }, message => {
      // showMessage accepts HTML; search and server error text must stay literal.
      const text = document.createElement("span");
      text.textContent = message;
      showMessage(text.innerHTML, 10_000, "error");
    });
  }

  private openGraph() {
    if (this.unloaded) return Promise.resolve();
    const existing = Object.values(this.getOpenedTab())
      .flat()
      .find((custom) => custom.tab?.headElement.isConnected);
    if (existing) {
      existing.tab.parent.switchTab(existing.tab.headElement);
      this.graphTitle?.attach(existing.tab);
      this.workbench?.refresh();
      return Promise.resolve(existing.tab);
    }
    // getOpenedTab excludes restored tabs until SiYuan initializes their models.
    // Activate the matching persisted header through the host's normal click handler.
    for (const header of document.querySelectorAll<HTMLElement>(
      '.layout-tab-bar [data-type="tab-header"][data-initdata]',
    )) {
      let restored: { instance?: string; customModelType?: string } | null;
      try {
        restored = JSON.parse(header.getAttribute("data-initdata") ?? "null");
      } catch {
        continue;
      }
      if (
        header.isConnected &&
        restored?.instance === "Custom" &&
        restored.customModelType === this.name + TAB_TYPE
      ) {
        header.click();
        this.workbench?.refresh();
        return Promise.resolve();
      }
    }
    this.opening ??= openTab({
      app: this.app,
      custom: {
        id: this.name + TAB_TYPE,
        title: this.graphTitle?.title ?? DEFAULT_GRAPH_TAB_TITLE,
        icon: "iconAtlasGraph",
      },
    }).finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private onMessage = (event: MessageEvent) => {
    if (!this.workbench?.ownsMessage(event)) return;
    if (this.presetStorage?.handle(event) || this.graphTitle?.handle(event)) return;
    const data = event.data as {
      channel?: string;
      type?: string;
      id?: unknown;
      requestId?: unknown;
    };
    if (data?.channel === WORKBENCH_CHANNEL && data.type === "native-preview") {
      this.workbench.previewBlock(event);
      return;
    }
    if (
      data?.channel === WORKBENCH_CHANNEL && data.type === "search-applied" && typeof data.requestId === "string"
    ) {
      this.workbench.acknowledgeSearch(data.requestId);
      return;
    }
    if (
      data?.channel === WORKBENCH_CHANNEL &&
      data.type === "workbench-ready"
    ) {
      this.workbench.announceVisibility();
      return;
    }
    if (
      data?.channel === WORKBENCH_CHANNEL &&
      data.type === "scope-applied" &&
      isNativeBlockId(data.id)
    ) {
      this.workbench.acknowledgeScope(data.id);
      return;
    }
    if (
      data?.channel === WORKBENCH_CHANNEL &&
      data.type === "open-block" &&
      isNativeBlockId(data.id)
    ) {
      void openTab({ app: this.app, doc: { id: data.id } });
    }
  };

  private onHostSwitch = () => {
    this.workbench?.refresh();
  };

  onunload() {
    this.unloaded = true;
    window.removeEventListener("message", this.onMessage);
    this.eventBus.off("switch-protyle", this.onHostSwitch);
    this.removeScopeMenus?.();
    this.removeScopeMenus = null;
    this.removeSourceChanges?.();
    this.removeSourceChanges = null;
    this.removeSearchGraphs?.();
    this.removeSearchGraphs = null;
    this.presetStorage?.dispose();
    this.presetStorage = null;
    this.graphTitle?.dispose();
    this.graphTitle = null;
    this.workbench?.dispose();
    this.workbench = null;
  }
}
