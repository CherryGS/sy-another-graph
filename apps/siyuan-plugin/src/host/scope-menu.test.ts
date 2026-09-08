import type { EventBus, IEventBusMap } from "siyuan";
import { describe, expect, it, vi } from "vitest";
import {
  blockScopeId,
  documentScopeId,
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
  const dispose = registerScopeMenus(
    bus as unknown as Pick<EventBus, "on" | "off">,
    open,
  );
  const items: { label: string; click: () => void }[] = [];
  const menu = { addItem: (item: (typeof items)[number]) => items.push(item) };
  const emit = (type: string, detail: unknown) =>
    listeners.get(type)?.({ detail } as CustomEvent);
  return { bus, listeners, open, dispose, items, menu, emit };
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

  it("adds the native menu action with a captured source ID", () => {
    const host = menuHarness();
    const title = { ...documentDetail(DOCUMENT_ID), menu: host.menu };
    host.emit("click-editortitleicon", title);
    title.protyle.block.rootID = BLOCK_ID;
    host.items[0].click();
    expect(host.open).toHaveBeenLastCalledWith(DOCUMENT_ID);
    host.emit("click-blockicon", { ...blockDetail(BLOCK_ID), menu: host.menu });
    host.items[1].click();
    expect(host.open).toHaveBeenLastCalledWith(BLOCK_ID);
    expect(host.items.map((item) => item.label)).toEqual([
      "在图谱中查看",
      "在图谱中查看",
    ]);
    host.dispose();
  });

  it("unbinds the exact listeners and invalidates already-open menu actions on unload", () => {
    const host = menuHarness();
    host.emit("click-blockicon", { ...blockDetail(BLOCK_ID), menu: host.menu });
    host.dispose();
    host.dispose();
    expect(host.listeners.size).toBe(0);
    expect(host.bus.off.mock.calls).toEqual(host.bus.on.mock.calls);
    host.items[0].click();
    expect(host.open).not.toHaveBeenCalled();
  });
});
