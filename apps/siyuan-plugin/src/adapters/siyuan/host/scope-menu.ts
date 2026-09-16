import { t } from "../../../shared/i18n/runtime";
import type { EventBus, IEventBusMap } from "siyuan";

const SCOPE_MENU_ID = "sy-another-graph-scope";

export function isNativeBlockId(value: unknown): value is string {
  return typeof value === "string" && /^\d{14}-[a-z0-9]{7}$/.test(value);
}

export function documentScopeId(
  detail: Pick<IEventBusMap["click-editortitleicon"], "protyle">,
): string | null {
  // The title menu belongs to the document even when its editor is zoomed into
  // another block. SiYuan fetches its document details using this same rootID.
  const id = detail.protyle?.block?.rootID;
  return isNativeBlockId(id) ? id : null;
}

export function documentTreeScopeId(detail: IEventBusMap["open-menu-doctree"]): string | null {
  // Native document-tree menus also cover notebooks and multi-selection. Only
  // the single document variant has one document block as its explicit scope.
  if (detail.type !== "doc" || detail.items?.length !== 1) return null;
  const id = detail.items[0]?.id;
  return isNativeBlockId(id) ? id : null;
}

export function blockScopeId(detail: IEventBusMap["click-blockicon"]): string | null {
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
  const addItem = (menu: IEventBusMap["click-blockicon"]["menu"], id: string | null) => {
    if (disposed || !id || menu.menus.some((item) => item.id === SCOPE_MENU_ID)) return;
    menu.addItem({
      id: SCOPE_MENU_ID,
      icon: "iconAtlasGraph",
      label: t("text.viewInGraph"),
      click: () => {
        if (!disposed) openScope(id);
      },
    });
  };
  const onDocument = ({ detail }: CustomEvent<IEventBusMap["click-editortitleicon"]>) =>
    addItem(detail.menu, documentScopeId(detail));
  const onBlock = ({ detail }: CustomEvent<IEventBusMap["click-blockicon"]>) =>
    addItem(detail.menu, blockScopeId(detail));
  // In SiYuan v3.8.3, the top-right ellipsis has its own event; it does not emit
  // click-editortitleicon. Both events receive the native plugin submenu.
  const onDocumentMore = ({ detail }: CustomEvent<IEventBusMap["open-menu-breadcrumbmore"]>) =>
    addItem(detail.menu, documentScopeId(detail));
  const onDocumentTree = ({ detail }: CustomEvent<IEventBusMap["open-menu-doctree"]>) =>
    addItem(detail.menu, documentTreeScopeId(detail));
  eventBus.on("click-editortitleicon", onDocument);
  eventBus.on("click-blockicon", onBlock);
  eventBus.on("open-menu-breadcrumbmore", onDocumentMore);
  eventBus.on("open-menu-doctree", onDocumentTree);
  return () => {
    if (disposed) return;
    disposed = true;
    eventBus.off("click-editortitleicon", onDocument);
    eventBus.off("click-blockicon", onBlock);
    eventBus.off("open-menu-breadcrumbmore", onDocumentMore);
    eventBus.off("open-menu-doctree", onDocumentTree);
  };
}
