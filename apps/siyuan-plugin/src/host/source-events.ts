import type { EventBus, IEventBusMap } from "siyuan";

// Confirmed against SiYuan 8641553: app/src/index.ts, kernel/util/websocket.go,
// kernel/api/{transaction,filetree,notebook}.go, kernel/model/file.go, and
// kernel/sql/queue.go. General progress, appearance and sync-status commands
// are deliberately absent; filetree-only channels are not ws-main messages.
const SOURCE_COMMANDS = new Set([
  "savedoc",
  "reloaddoc",
  "updateids",
  "setRefDynamicText",
  "setDefRefCount",
  "databaseIndexCommit",
  "rename",
  "moveDoc",
  "moveDocs",
  "removeDoc",
  "heading2doc",
  "li2doc",
  "createdailynote",
  "docsImported",
  "createnotebook",
  "renamenotebook",
  "mount",
  "closeBox",
  "removeBox",
  "notebookSortChanged",
  "syncMergeResult",
]);

// Native transaction actions that can change acquired blocks, database items,
// relation fields, or their source context. AV layout-only changes are omitted.
const SOURCE_ACTIONS = new Set([
  "create",
  "restoreCreatedDoc",
  "removeCreatedDoc",
  "update",
  "insert",
  "delete",
  "move",
  "moveOutlineHeading",
  "append",
  "appendInsert",
  "prependInsert",
  "setAttrs",
  "setAttrViewName",
  "insertAttrViewBlock",
  "removeAttrViewBlock",
  "addAttrViewCol",
  "updateAttrViewCol",
  "removeAttrViewCol",
  "updateAttrViewCell",
  "updateAttrViewCells",
  "updateAttrViewColOptions",
  "removeAttrViewColOption",
  "updateAttrViewColOption",
  "replaceAttrViewBlock",
  "duplicateAttrViewRow",
  "updateAttrViewColRelation",
  "duplicateAttrViewKey",
  "removeAttrViewGroup",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isSourceChange(message: unknown): boolean {
  const event = record(message);
  if (!event || event.code !== 0 || typeof event.cmd !== "string") return false;
  if (SOURCE_COMMANDS.has(event.cmd)) return true;
  if (event.cmd !== "transactions" || !Array.isArray(event.data)) return false;
  return event.data.some((value) => {
    const transaction = record(value);
    if (!Array.isArray(transaction?.doOperations)) return false;
    return transaction.doOperations.some((value: unknown) => {
      const operation = record(value);
      return (
        typeof operation?.action === "string" &&
        SOURCE_ACTIONS.has(operation.action)
      );
    });
  });
}

/** Consume the supported host event without forwarding any note content. */
export function registerSourceChanges(
  eventBus: Pick<EventBus, "on" | "off">,
  changed: () => void,
): () => void {
  let disposed = false;
  const onSource = ({ detail }: CustomEvent<IEventBusMap["ws-main"]>) => {
    if (!disposed && isSourceChange(detail)) changed();
  };
  eventBus.on("ws-main", onSource);
  return () => {
    if (disposed) return;
    disposed = true;
    eventBus.off("ws-main", onSource);
  };
}
