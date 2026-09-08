import type { EventBus } from "siyuan";
import { describe, expect, it, vi } from "vitest";
import { isSourceChange, registerSourceChanges } from "./source-events";

const event = (cmd: string, data: unknown = null, code = 0) => ({
  cmd,
  data,
  code,
  msg: "",
});
const transaction = (...actions: string[]) =>
  event("transactions", [
    { doOperations: actions.map((action) => ({ action })) },
  ]);

describe("SiYuan source-change event classification", () => {
  it.each([
    "savedoc",
    "reloaddoc",
    "updateids",
    "setRefDynamicText",
    "setDefRefCount",
    "databaseIndexCommit",
    "rename",
    "moveDocs",
    "removeDoc",
    "docsImported",
    "createnotebook",
    "renamenotebook",
    "mount",
    "closeBox",
    "removeBox",
    "syncMergeResult",
  ])("accepts a successful native source notification: %s", (cmd) => {
    expect(isSourceChange(event(cmd))).toBe(true);
    expect(isSourceChange(event(cmd, null, -1))).toBe(false);
  });

  it.each([
    "update",
    "insert",
    "delete",
    "moveOutlineHeading",
    "setAttrs",
    "insertAttrViewBlock",
    "removeAttrViewBlock",
    "updateAttrViewCell",
    "updateAttrViewCells",
    "updateAttrViewColRelation",
    "duplicateAttrViewRow",
  ])("recognizes committed block or database mutations: %s", (action) => {
    expect(isSourceChange(transaction(action))).toBe(true);
  });

  it("finds a source mutation inside a batched transaction without requiring source text", () => {
    expect(
      isSourceChange(
        event("transactions", [
          { doOperations: [{ action: "setAttrViewColWidth" }] },
          {
            doOperations: [
              {
                action: "updateAttrViewColRelation",
                data: { privateText: "not forwarded" },
              },
            ],
          },
        ]),
      ),
    ).toBe(true);
  });

  it.each([
    "heartbeat",
    "statusbar",
    "progress",
    "backgroundtask",
    "downloadProgress",
    "setAppearance",
    "refreshtheme",
    "setConf",
    "setLocalStorageVal",
    "syncing",
    "txerr",
    "openFileById",
    "reloadFiletree",
    "reloadDocInfo",
    "unrecognized-command",
  ])(
    "does not treat activity or another channel as a source mutation: %s",
    (cmd) => {
      expect(isSourceChange(event(cmd))).toBe(false);
    },
  );

  it("ignores empty, read-only, layout-only, failed and malformed transaction messages", () => {
    for (const message of [
      null,
      undefined,
      [],
      "transactions",
      { cmd: "transactions" },
      event("transactions", []),
      event("transactions", [{ doOperations: [] }]),
      event("transactions", [{ undoOperations: [{ action: "update" }] }]),
      event("transactions", [{ doOperations: [null, {}, { action: 1 }] }]),
      transaction(
        "setAttrViewColWidth",
        "setAttrViewCardLayout",
        "sortAttrViewView",
      ),
      { ...transaction("update"), code: -1 },
    ])
      expect(isSourceChange(message)).toBe(false);
  });

  it("emits one content-free invalidation and disconnects the exact host listener on unload", () => {
    let listener: ((event: CustomEvent) => void) | undefined;
    const bus = {
      on: vi.fn((_type: string, callback: (event: CustomEvent) => void) => {
        listener = callback;
      }),
      off: vi.fn(),
    };
    const changed = vi.fn();
    const dispose = registerSourceChanges(
      bus as unknown as Pick<EventBus, "on" | "off">,
      changed,
    );
    const callback = listener!;
    callback({ detail: event("statusbar") } as CustomEvent);
    callback({
      detail: transaction("update", "updateAttrViewCell"),
    } as CustomEvent);
    expect(changed.mock.calls).toEqual([[]]);
    dispose();
    dispose();
    expect(bus.off.mock.calls).toEqual(bus.on.mock.calls);
    callback({ detail: transaction("update") } as CustomEvent);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
