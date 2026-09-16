import type { Custom } from "siyuan";
import { WORKBENCH_PRESET_CHANNEL, type GraphTabStateMessage } from "../presets/host-protocol";

export const DEFAULT_GRAPH_TAB_TITLE = "图谱 · 全部 · 文档引用";

type GraphTab = Pick<Custom["tab"], "title" | "headElement" | "updateTitle">;

function isLabel(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength &&
    Array.from(value).every((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && (code < 127 || code > 159);
    })
  );
}

function tooltipText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The state outlives disposable tab models, just like the workbench iframe. */
export class GraphTabTitle {
  private readonly ownsMessage: (event: MessageEvent) => boolean;
  private readonly tabs = new Set<GraphTab>();
  private state: Pick<GraphTabStateMessage, "title" | "description"> = {
    title: DEFAULT_GRAPH_TAB_TITLE,
    description: "范围：全部；预设：文档引用；包含关系：关闭；文本提及：关闭；类型：文档",
  };
  private disposed = false;

  constructor(ownsMessage: (event: MessageEvent) => boolean) {
    this.ownsMessage = ownsMessage;
  }

  get title(): string {
    return this.state.title;
  }

  attach(tab: GraphTab): void {
    if (this.disposed) return;
    this.tabs.add(tab);
    this.apply(tab);
  }

  detach(tab: GraphTab): void {
    this.tabs.delete(tab);
  }

  handle(event: MessageEvent): boolean {
    if (this.disposed || !this.ownsMessage(event)) return false;
    const data = event.data as Partial<GraphTabStateMessage> | null;
    if (
      data?.channel !== WORKBENCH_PRESET_CHANNEL ||
      data.type !== "graph-tab-state" ||
      !isLabel(data.title, 160) ||
      !isLabel(data.description, 1000)
    )
      return false;
    if (data.title === this.state.title && data.description === this.state.description) return true;
    this.state = { title: data.title, description: data.description };
    for (const tab of this.tabs) this.apply(tab);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.tabs.clear();
  }

  private apply(tab: GraphTab): void {
    // SiYuan 3.8.3 Tab.updateTitle escapes its argument before rendering it.
    // Keep the model title literal so reopening/serializing never double escapes.
    if (tab.title !== this.state.title) tab.updateTitle(this.state.title);
    tab.headElement.title = this.state.description;
    // Native ariaLabel tooltips interpret HTML, unlike the DOM title property.
    tab.headElement.setAttribute("aria-label", tooltipText(this.state.description));
    tab.headElement.classList.add("ariaLabel");
  }
}
