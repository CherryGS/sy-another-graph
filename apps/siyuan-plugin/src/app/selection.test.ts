import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION, retainSelection, selectNode } from "./selection";

describe("equal chosen membership and independent inspection", () => {
  it("treats ordinary single selection as a singleton chosen set", () => {
    const one = selectNode(EMPTY_SELECTION, "a");
    expect(one).toEqual({
      chosenIds: ["a"],
      inspectedId: "a",
      multiple: false,
    });
    const replacement = selectNode(one, "b");
    expect(replacement).toEqual({
      chosenIds: ["b"],
      inspectedId: "b",
      multiple: false,
    });
    expect(selectNode(replacement, null)).toEqual(EMPTY_SELECTION);
    expect(EMPTY_SELECTION.chosenIds).toEqual([]);
  });

  it("lets Shift add and remove any member without assigning a privileged root", () => {
    const initial = selectNode(EMPTY_SELECTION, "a");
    const pair = selectNode(initial, "b", true);
    const triple = selectNode(pair, "c", true);
    expect(triple).toEqual({
      chosenIds: ["a", "b", "c"],
      inspectedId: "c",
      multiple: true,
    });
    const withoutFirst = selectNode(triple, "a", true);
    expect(withoutFirst).toEqual({
      chosenIds: ["b", "c"],
      inspectedId: "a",
      multiple: true,
    });
    const withoutLast = selectNode(withoutFirst, "c", true);
    expect(withoutLast.chosenIds).toEqual(["b"]);
    expect(withoutLast.multiple).toBe(true);
    expect(selectNode(withoutLast, "b", true).chosenIds).toEqual([]);
    expect(initial.chosenIds).toEqual(["a"]);
  });

  it("inspects a different node or the background without replacing an active chosen set", () => {
    const chosen = selectNode(selectNode(EMPTY_SELECTION, "a"), "b", true);
    const inspected = selectNode(chosen, "neighbor");
    expect(inspected).toEqual({
      chosenIds: ["a", "b"],
      inspectedId: "neighbor",
      multiple: true,
    });
    expect(selectNode(inspected, null)).toEqual({
      chosenIds: ["a", "b"],
      inspectedId: null,
      multiple: true,
    });
    expect(selectNode(inspected, "a").chosenIds).toEqual(["a", "b"]);
    expect(selectNode(inspected, "neighbor", true).chosenIds).toEqual(["a", "b", "neighbor"]);
  });

  it("preserves explicit multiple-selection behavior with just one remaining member", () => {
    const one = selectNode(EMPTY_SELECTION, "a", true);
    expect(one.chosenIds).toEqual(["a"]);
    expect(selectNode(one, "inspection-only").chosenIds).toEqual(["a"]);
    expect(selectNode(one, null).chosenIds).toEqual(["a"]);
  });
});

describe("selection retention after independent graph eligibility changes", () => {
  it("drops a type-hidden original choice without migrating membership to its document", () => {
    const previous = selectNode(selectNode(EMPTY_SELECTION, "hidden-block"), "visible-block", true);
    const inspected = selectNode(previous, "hidden-block");
    const next = retainSelection(inspected, new Set(["owning-document", "visible-block"]));
    expect(next).toEqual({
      chosenIds: ["visible-block"],
      inspectedId: null,
      multiple: true,
    });
    expect(next.chosenIds).not.toContain("owning-document");
    expect(previous.chosenIds).toEqual(["hidden-block", "visible-block"]);
    const restoredType = retainSelection(
      next,
      new Set(["owning-document", "hidden-block", "visible-block"]),
    );
    expect(restoredType.chosenIds).toEqual(["visible-block"]);
  });

  it("removes excluded choices and clears inspection when no selected identity remains", () => {
    const previous = selectNode(EMPTY_SELECTION, "excluded", true);
    expect(retainSelection(previous, new Set(["other"]))).toEqual({
      chosenIds: [],
      inspectedId: null,
      multiple: false,
    });
  });

  it("keeps an eligible inspected neighbor separate from surviving selected membership", () => {
    const chosen = selectNode(selectNode(EMPTY_SELECTION, "a"), "b", true);
    const inspected = selectNode(chosen, "neighbor");
    const next = retainSelection(inspected, new Set(["a", "neighbor"]));
    expect(next).toEqual({
      chosenIds: ["a"],
      inspectedId: "neighbor",
      multiple: true,
    });
    expect(retainSelection(next, new Set(["a", "neighbor", "unrelated"]))).toBe(next);
  });
});
