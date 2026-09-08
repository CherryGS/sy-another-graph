import type { EventBus, IEventBusMap } from "siyuan";

export function isNativeBlockId(value: unknown): value is string {
  return typeof value === "string" && /^\d{14}-[a-z0-9]{7}$/.test(value);
}

export function documentScopeId(
  detail: IEventBusMap["click-editortitleicon"],
): string | null {
  // The title menu belongs to the document even when its editor is zoomed into
  // another block. SiYuan fetches its document details using this same rootID.
  const id = detail.protyle?.block?.rootID;
  return isNativeBlockId(id) ? id : null;
}

export function blockScopeId(
  detail: IEventBusMap["click-blockicon"],
): string | null {
  // One scope needs one explicit source; a batch block menu has no single root.
  if (detail.blockElements?.length !== 1) return null;
  const id = detail.blockElements[0]?.dataset.nodeId;
  return isNativeBlockId(id) ? id : null;
}

/** Registers native context-menu entries and invalidates open menus on unload. */
export function registerScopeMenus(
  eventBus: Pick<EventBus, "on" | "off">,
  openScope: (id: string) => void,
): () => void {
  let disposed = false;
  const addItem = (
    menu: IEventBusMap["click-blockicon"]["menu"],
    id: string | null,
  ) => {
    if (disposed || !id) return;
    menu.addItem({
      id: "sy-another-graph-scope",
      icon: "iconAtlasGraph",
      label: "在图谱中查看",
      click: () => {
        if (!disposed) openScope(id);
      },
    });
  };
  const onDocument = ({
    detail,
  }: CustomEvent<IEventBusMap["click-editortitleicon"]>) =>
    addItem(detail.menu, documentScopeId(detail));
  const onBlock = ({ detail }: CustomEvent<IEventBusMap["click-blockicon"]>) =>
    addItem(detail.menu, blockScopeId(detail));
  eventBus.on("click-editortitleicon", onDocument);
  eventBus.on("click-blockicon", onBlock);
  return () => {
    if (disposed) return;
    disposed = true;
    eventBus.off("click-editortitleicon", onDocument);
    eventBus.off("click-blockicon", onBlock);
  };
}
