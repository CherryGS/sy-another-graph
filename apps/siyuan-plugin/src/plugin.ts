import { Plugin, openTab, type Custom } from "siyuan";

const TAB_TYPE = "atlas";
const CHANNEL = "sy-another-graph";

export default class SiYuanGraphPlugin extends Plugin {
  private frames = new Set<HTMLIFrameElement>();
  private opening: ReturnType<typeof openTab> | null = null;

  onload() {
    const frames = this.frames;
    const pluginName = this.name;
    this.addIcons(
      '<symbol id="iconAtlasGraph" viewBox="0 0 24 24"><path d="m7 7 10 2M7 7l4 11m6-9-6 9" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="6" r="3" fill="currentColor"/><circle cx="18" cy="9" r="3" fill="currentColor"/><circle cx="11" cy="19" r="3" fill="currentColor"/></symbol>',
    );
    this.addTab({
      type: TAB_TYPE,
      init(this: Custom) {
        const frame = document.createElement("iframe");
        frame.src = `/plugins/${pluginName}/ui/index.html?v=${Date.now()}`;
        frame.title = "Atlas 思源图谱";
        frame.style.cssText =
          "width:100%;height:100%;border:0;display:block;background:#11121a;";
        (this.element as HTMLElement).style.cssText =
          "height:100%;overflow:hidden;";
        this.element.appendChild(frame);
        frames.add(frame);
      },
      destroy(this: Custom) {
        this.element.querySelectorAll("iframe").forEach((frame) => {
          frames.delete(frame);
          frame.remove();
        });
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
  }

  private openGraph() {
    const existing = Object.values(this.getOpenedTab())
      .flat()
      .find((custom) => custom.tab?.headElement.isConnected);
    if (existing) {
      existing.tab.parent.switchTab(existing.tab.headElement);
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
    if (
      event.origin !== window.location.origin ||
      !Array.from(this.frames).some(
        (frame) => frame.contentWindow === event.source,
      )
    )
      return;
    const data = event.data as {
      channel?: string;
      type?: string;
      id?: unknown;
    };
    if (
      data?.channel === CHANNEL &&
      data.type === "open-block" &&
      typeof data.id === "string" &&
      /^\d{14}-[a-z0-9]{7}$/.test(data.id)
    ) {
      void openTab({ app: this.app, doc: { id: data.id } });
    }
  };

  onunload() {
    window.removeEventListener("message", this.onMessage);
    for (const frame of this.frames) frame.remove();
    this.frames.clear();
  }
}
