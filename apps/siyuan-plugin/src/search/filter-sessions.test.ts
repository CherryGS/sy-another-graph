import { describe, expect, it } from "vitest";
import { FilterSessions } from "./filter-sessions";
import { readSearchSnapshot, type SearchGraphSnapshot } from "./model";

const snapshot: SearchGraphSnapshot = { requestId: "first", label: "Topic", query: "topic", ids: ["20260913000000-0000001"] };

describe("temporary search preset isolation", () => {
  it("preserves the original preset draft, lookup, and rule revision across temporary edits", () => {
    const session = new FilterSessions();
    session.setNormal(previous => ({ ...previous, query: "draft lookup", scopeId: snapshot.ids[0], hierarchy: true }));
    const original = session.normalRef.current;
    const revision = session.ruleRevisionRef.current;
    session.search(snapshot);
    expect(session.getSnapshot().temporary?.filters.documentsOnly).toBe(false);
    expect(session.getSnapshot().temporary?.filters.hierarchy).toBe(true);
    session.setFilters(previous => ({ ...previous, references: false, notebook: "other" }));
    expect(session.normalRef.current).toBe(original);
    expect(session.ruleRevisionRef.current).toBe(revision);
    session.leave();
    expect(session.getSnapshot().normal).toBe(original);
    session.resume();
    expect(session.getSnapshot().temporary?.filters.references).toBe(false);
  });
  it("normal hydration cannot replace a search that arrived during startup", () => {
    const session = new FilterSessions();
    session.search(snapshot);
    session.setNormal(previous => ({ ...previous, notebook: "saved-notebook" }));
    expect(session.getSnapshot().active).toBe(true);
    expect(session.getSnapshot().temporary?.filters.notebook).toBe("");
    session.leave();
    expect(session.getSnapshot().normal.notebook).toBe("saved-notebook");
  });
  it("stale preset acknowledgements do not leave a newer search", async () => {
    const session = new FilterSessions();
    session.search(snapshot);
    let resolve!: (value: boolean) => void;
    const pending = session.switchNormal(() => new Promise<boolean>(done => { resolve = done; }));
    session.search({ ...snapshot, requestId: "newer" });
    resolve(true);
    expect(await pending).toBe(false);
    expect(session.getSnapshot().active).toBe(true);
    expect(session.getSnapshot().temporary?.snapshot.requestId).toBe("newer");
  });
  it("keeps the search active when a preset save fails and leaves on success", async () => {
    const session = new FilterSessions();
    session.search(snapshot);
    await session.switchNormal(() => Promise.resolve(false));
    expect(session.getSnapshot().active).toBe(true);
    await session.switchNormal(() => Promise.resolve(true));
    expect(session.getSnapshot().active).toBe(false);
  });
  it("deduplicates bridge retries and lets native scope entry supersede search", () => {
    const session = new FilterSessions();
    session.search(snapshot);
    session.setFilters(previous => ({ ...previous, hierarchy: false }));
    session.search(snapshot);
    expect(session.getSnapshot().temporary?.filters.hierarchy).toBe(false);
    session.scope(snapshot.ids[0]);
    expect(session.getSnapshot().active).toBe(false);
    expect(session.normalRef.current.scopeId).toBe(snapshot.ids[0]);
  });
  it("rejects malformed or empty bridge snapshots", () => {
    expect(readSearchSnapshot({ ...snapshot, ids: [] })).toBeNull();
    expect(readSearchSnapshot({ ...snapshot, ids: ["not-an-id"] })).toBeNull();
    expect(readSearchSnapshot({ ...snapshot, ids: [...snapshot.ids, ...snapshot.ids] })?.ids).toEqual(snapshot.ids);
  });
  it("resets search filters to connected all-type context without changing the original draft", () => {
    const session = new FilterSessions();
    session.setNormal(previous => ({ ...previous, notebook: "saved", query: "draft" }));
    const normal = session.normalRef.current;
    const revision = session.ruleRevisionRef.current;
    session.search(snapshot);
    const hits = session.getSnapshot().temporary!.ids;
    session.setFilters(previous => ({ ...previous, hierarchy: false, documentsOnly: true, scopeId: snapshot.ids[0] }));
    session.reset();
    expect(session.getSnapshot().temporary?.filters).toMatchObject({ hierarchy: true, documentsOnly: false, scopeId: "" });
    expect(session.getSnapshot().temporary?.ids).toBe(hits);
    expect(session.normalRef.current).toBe(normal);
    expect(session.ruleRevisionRef.current).toBe(revision);
    session.leave();
    session.reset();
    expect(session.normalRef.current).toMatchObject({ hierarchy: false, documentsOnly: true, notebook: "", query: "" });
  });
});
