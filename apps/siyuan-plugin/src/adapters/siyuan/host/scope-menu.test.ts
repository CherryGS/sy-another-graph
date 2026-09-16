import { beforeEach as beforeLocaleTest, describe, expect, it, vi } from "vitest";
import { setLocale } from "../../../shared/i18n/runtime";
beforeLocaleTest(() => setLocale("zh-CN"));
import type { EventBus, IEventBusMap } from "siyuan";

import {
  blockScopeId,
  documentScopeId,
  documentTreeScopeId,
  registerScopeMenus,
} from "./scope-menu";

const DOCUMENT_ID = "20260909010000-doc0001";
const BLOCK_ID = "20260909010001-block01";

function documentDetail(rootID: unknown, id = BLOCK_ID) {
  return {
    protyle: { block: { rootID, id } },
  } as IEventBusMap["click-editortitleicon"];
}

function blockDetail(...ids: unknown[]) {
  return {
    blockElements: ids.map((nodeId) => ({ dataset: { nodeId } })),
  } as unknown as IEventBusMap["click-blockicon"];
}

function treeDetail(type: IEventBusMap["open-menu-doctree"]["type"], ...ids: unknown[]) {
  return {
    type,
    items: ids.map((id) => ({ id, path: "/source.sy", notebookId: "book" })),
    elements: [],
  } as unknown as IEventBusMap["open-menu-doctree"];
}

function menuHarness() {
  const listeners = new Map<string, (event: CustomEvent) => void>();
  const bus = {
    on: vi.fn((type: string, listener: (event: CustomEvent) => void) =>
      listeners.set(type, listener),
    ),
    off: vi.fn((type: string, listener: (event: CustomEvent) => void) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    }),
  };
  const open = vi.fn();
  const dispose = registerScopeMenus(bus as unknown as Pick<EventBus, "on" | "off">, open);
  const items: { id: string; label: string; click: () => void }[] = [];
  const newMenu = () => {
    const menus: (typeof items)[number][] = [];
    return {
      menus,
      addItem: (item: (typeof items)[number]) => {
        menus.push(item);
        items.push(item);
      },
    };
  };
  const menu = newMenu();
  const emit = (type: string, detail: unknown) => listeners.get(type)?.({ detail } as CustomEvent);
  return { bus, listeners, open, dispose, items, menu, newMenu, emit };
}

describe("native document and block graph entry", () => {
  it("uses the document root for a title menu in a zoomed block editor", () => {
    expect(documentScopeId(documentDetail(DOCUMENT_ID))).toBe(DOCUMENT_ID);
    expect(documentScopeId(documentDetail(undefined))).toBeNull();
    expect(documentScopeId(documentDetail(`av:${DOCUMENT_ID}`))).toBeNull();
  });

  it("accepts one actual block and does not choose an arbitrary batch scope", () => {
    expect(blockScopeId(blockDetail(BLOCK_ID))).toBe(BLOCK_ID);
    expect(blockScopeId(blockDetail())).toBeNull();
    expect(blockScopeId(blockDetail(BLOCK_ID, DOCUMENT_ID))).toBeNull();
    expect(blockScopeId(blockDetail(`siyuan://blocks/${BLOCK_ID}`))).toBeNull();
    expect(blockScopeId(blockDetail(null))).toBeNull();
  });

  it("uses the document-tree event's actual item ID and excludes notebook and batch menus", () => {
    expect(documentTreeScopeId(treeDetail("doc", DOCUMENT_ID))).toBe(DOCUMENT_ID);
    expect(documentTreeScopeId(treeDetail("doc"))).toBeNull();
    expect(documentTreeScopeId(treeDetail("doc", DOCUMENT_ID, BLOCK_ID))).toBeNull();
    expect(documentTreeScopeId(treeDetail("doc", `siyuan://blocks/${DOCUMENT_ID}`))).toBeNull();
    for (const type of ["docs", "notebook", "notebooks", "items"] as const)
      expect(documentTreeScopeId(treeDetail(type, DOCUMENT_ID))).toBeNull();
  });

  it("adds the document-tree right-click action without opening the source document first", () => {
    const host = menuHarness();
    const detail = { ...treeDetail("doc", DOCUMENT_ID), menu: host.menu };
    host.emit("open-menu-doctree", detail);
    detail.items[0].id = BLOCK_ID;
    expect(host.items).toHaveLength(1);
    expect(host.items[0].label).toBe("在图谱中查看");
    host.items[0].click();
    expect(host.open).toHaveBeenCalledExactlyOnceWith(DOCUMENT_ID);
    host.dispose();
  });

  it("adds the top-right ellipsis action to the supplied plugin submenu using the document root", () => {
    const host = menuHarness();
    host.emit("open-menu-breadcrumbmore", {
      ...documentDetail(DOCUMENT_ID, BLOCK_ID),
      menu: host.menu,
      data: { runeCount: 12 },
    });
    expect(host.menu.menus).toHaveLength(1);
    expect(host.menu.menus[0].label).toBe("在图谱中查看");
    expect(host.menu.menus[0]).not.toHaveProperty("submenu");
    host.items[0].click();
    expect(host.open).toHaveBeenCalledExactlyOnceWith(DOCUMENT_ID);
    host.dispose();
  });

  it("adds at most one graph action per native submenu even if document hooks share it", () => {
    const host = menuHarness();
    const detail = { ...documentDetail(DOCUMENT_ID), menu: host.menu };
    host.emit("click-editortitleicon", detail);
    host.emit("open-menu-breadcrumbmore", detail);
    host.emit("open-menu-breadcrumbmore", detail);
    expect(host.menu.menus).toHaveLength(1);
    expect(host.items).toHaveLength(1);
    host.items[0].click();
    expect(host.open).toHaveBeenCalledExactlyOnceWith(DOCUMENT_ID);
    host.dispose();
  });

  it("adds the native menu action with a captured source ID", () => {
    const host = menuHarness();
    const title = { ...documentDetail(DOCUMENT_ID), menu: host.menu };
    host.emit("click-editortitleicon", title);
    title.protyle.block.rootID = BLOCK_ID;
    host.items[0].click();
    expect(host.open).toHaveBeenLastCalledWith(DOCUMENT_ID);
    host.emit("click-blockicon", { ...blockDetail(BLOCK_ID), menu: host.newMenu() });
    host.items[1].click();
    expect(host.open).toHaveBeenLastCalledWith(BLOCK_ID);
    expect(host.items.map((item) => item.label)).toEqual(["在图谱中查看", "在图谱中查看"]);
    host.dispose();
  });

  it("unbinds the exact listeners and invalidates already-open menu actions on unload", () => {
    const host = menuHarness();
    host.emit("click-blockicon", { ...blockDetail(BLOCK_ID), menu: host.menu });
    host.dispose();
    host.dispose();
    expect(host.bus.on.mock.calls.map(([type]) => type)).toEqual([
      "click-editortitleicon",
      "click-blockicon",
      "open-menu-breadcrumbmore",
      "open-menu-doctree",
    ]);
    expect(host.listeners.size).toBe(0);
    expect(host.bus.off.mock.calls).toEqual(host.bus.on.mock.calls);
    host.items[0].click();
    expect(host.open).not.toHaveBeenCalled();
  });
});
