import { Plugin, openTab, type Custom } from "siyuan";
import {
  PersistentWorkbench,
  WORKBENCH_CHANNEL,
} from "./host/persistent-workbench";

const TAB_TYPE = "atlas";

export default class SiYuanGraphPlugin extends Plugin {
  private workbench: PersistentWorkbench | null = null;
  private opening: ReturnType<typeof openTab> | null = null;
  private unloaded = false;

  onload() {
    this.unloaded = false;
    const workbench = new PersistentWorkbench(this.name);
    this.workbench = workbench;
    this.addIcons(
      '<symbol id="iconAtlasGraph" viewBox="0 0 24 24"><path d="m7 7 10 2M7 7l4 11m6-9-6 9" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="6" r="3" fill="currentColor"/><circle cx="18" cy="9" r="3" fill="currentColor"/><circle cx="11" cy="19" r="3" fill="currentColor"/></symbol>',
    );
    this.addTab({
      type: TAB_TYPE,
      init(this: Custom) {
        (this.element as HTMLElement).style.cssText =
          "height:100%;width:100%;min-width:0;min-height:0;overflow:hidden;";
        workbench.attach(this.element as HTMLElement);
      },
      resize() {
        workbench.refresh();
      },
      update() {
        workbench.refresh();
      },
      beforeDestroy(this: Custom) {
        workbench.detach(this.element as HTMLElement);
      },
      destroy(this: Custom) {
        workbench.detach(this.element as HTMLElement);
      },
    });
    this.addTopBar({
      icon: "iconAtlasGraph",
      title: "Atlas 思源图谱",
      position: "right",
      callback: () => {
        void this.openGraph();
      },
    });
    this.addCommand({
      langKey: "openAtlasGraph",
      langText: "打开 Atlas 思源图谱",
      hotkey: "⌥⇧G",
      callback: () => {
        void this.openGraph();
      },
    });
    window.addEventListener("message", this.onMessage);
    this.eventBus.on("switch-protyle", this.onHostSwitch);
  }

  private openGraph() {
    if (this.unloaded) return Promise.resolve();
    const existing = Object.values(this.getOpenedTab())
      .flat()
      .find((custom) => custom.tab?.headElement.isConnected);
    if (existing) {
      existing.tab.parent.switchTab(existing.tab.headElement);
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
        title: "Atlas 图谱",
        icon: "iconAtlasGraph",
      },
    }).finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private onMessage = (event: MessageEvent) => {
    if (!this.workbench?.ownsMessage(event)) return;
    const data = event.data as {
      channel?: string;
      type?: string;
      id?: unknown;
    };
    if (
      data?.channel === WORKBENCH_CHANNEL &&
      data.type === "workbench-ready"
    ) {
      this.workbench.announceVisibility();
      return;
    }
    if (
      data?.channel === WORKBENCH_CHANNEL &&
      data.type === "open-block" &&
      typeof data.id === "string" &&
      /^\d{14}-[a-z0-9]{7}$/.test(data.id)
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
    this.workbench?.dispose();
    this.workbench = null;
  }
}
