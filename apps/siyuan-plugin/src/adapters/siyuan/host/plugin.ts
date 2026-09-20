import { hostLanguage, watchHostLanguage } from "./language";
import { setLocale, t } from "../../../shared/i18n/runtime";

import { Plugin, openTab, showMessage, type Custom } from "siyuan";
import { PersistentWorkbench, WORKBENCH_CHANNEL } from "./persistent-workbench";
import { isNativeBlockId, registerScopeMenus } from "./scope-menu";
import { registerSourceChanges } from "./source-events";
import { PresetStorage } from "./preset-storage";
import { GraphTabTitle, defaultGraphTabTitle } from "./graph-tab-title";
import { registerSearchGraphs } from "./search-graphs";

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

  private removeLanguage: (() => void) | null = null;

  onload() {
    setLocale(hostLanguage());
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
    const topBar = this.addTopBar({
      icon: "iconAtlasGraph",
      title: t("app.name"),
      position: "right",
      callback: () => {
        void this.openGraph();
      },
    });
    this.addCommand({
      langKey: "openAtlasGraph",
      langText: t("text.open"),
      hotkey: "⌥⇧G",
      callback: () => {
        void this.openGraph();
      },
    });
    this.removeLanguage = watchHostLanguage(() => {
      topBar.setAttribute("aria-label", t("app.name"));
      if (topBar.hasAttribute("title")) topBar.title = t("app.name");
      const command = this.commands.find((item) => item.langKey === "openAtlasGraph");
      if (command) command.langText = t("text.open");
      workbench.announceLanguage();
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
    this.removeSearchGraphs = registerSearchGraphs(
      this.eventBus,
      async (snapshot) => {
        if (this.unloaded) return;
        workbench.requestSearch(snapshot);
        await this.openGraph();
      },
      (message) => {
        // showMessage accepts HTML; search and server error text must stay literal.
        const text = document.createElement("span");
        text.textContent = message;
        showMessage(text.innerHTML, 10_000, "error");
      },
    );
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
        title: this.graphTitle?.title ?? defaultGraphTabTitle(),
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
      data?.channel === WORKBENCH_CHANNEL &&
      data.type === "search-applied" &&
      typeof data.requestId === "string"
    ) {
      this.workbench.acknowledgeSearch(data.requestId);
      return;
    }
    if (data?.channel === WORKBENCH_CHANNEL && data.type === "language-ready") {
      this.workbench.announceLanguage();
      return;
    }
    if (data?.channel === WORKBENCH_CHANNEL && data.type === "workbench-ready") {
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
    this.removeLanguage?.();
    this.removeLanguage = null;
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
