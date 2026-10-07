// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { DEFAULT_FILTERS, type GraphFilters } from "../../modules/presets/filters";
import { getGraphLookups, GRAPH_SEARCH_RESULT_LIMIT } from "../../core/graph/graph-lookups";
import type { GraphNode } from "../../core/graph/types";
import type { WorkbenchState } from "../model/state";
import { GraphSearch } from "./GraphSearch";
import { ScopeFilters } from "./filters/ScopeFilters";
import { t } from "../../shared/i18n/runtime";

afterEach(cleanup);

const NATIVE_ID = "20261008010101-abcdefg";
const source: GraphNode = {
  id: NATIVE_ID,
  index: 0,
  label: "Known document",
  notebook: "book",
  path: "",
};

function ScopeExample({
  selected = source,
  acquired = true,
  edge = false,
  scopeId = "",
}: {
  selected?: GraphNode | null;
  acquired?: boolean;
  edge?: boolean;
  scopeId?: string;
}) {
  const [filters, setFilters] = useState<GraphFilters>({
    ...structuredClone(DEFAULT_FILTERS),
    notebook: "book",
    scopeId,
  });
  const state = {
    filters,
    setFilters,
    data: { notebooks: [{ id: "book", name: "Notebook" }] },
    sourceLookups: getGraphLookups({ nodes: acquired ? [source] : [], edges: [] }),
    selected,
    inspectedEdge: edge ? { source: 0, target: 0, kind: "reference" } : null,
    nativeBlockId: () => NATIVE_ID,
  } as unknown as WorkbenchState;
  return (
    <>
      <ScopeFilters state={state} />
      <output data-testid="filters">{JSON.stringify(filters)}</output>
    </>
  );
}

it("uses the acquired inspected ID through existing filters without changing the notebook or other rules", async () => {
  const user = userEvent.setup();
  render(<ScopeExample />);
  await user.click(screen.getByRole("button", { name: t("scope.useInspectedNode") }));
  expect(JSON.parse(screen.getByTestId("filters").textContent!)).toEqual({
    ...DEFAULT_FILTERS,
    notebook: "book",
    scopeId: NATIVE_ID,
  });
  expect(
    screen.getByLabelText(t("text.initialScopeDocumentOrBlockId")).getAttribute("aria-invalid"),
  ).toBe("false");
  expect(screen.getByText(t("scope.activeNode", { name: source.label }))).toBeTruthy();
});

it.each([
  { selected: null },
  { selected: { ...source, id: "tag:synthetic" } },
  { acquired: false },
  { edge: true },
])("does not scope a missing, synthetic, unavailable or edge-only inspection: %j", (props) => {
  render(<ScopeExample {...props} />);
  expect(
    (screen.getByRole("button", { name: t("scope.useInspectedNode") }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(JSON.parse(screen.getByTestId("filters").textContent!).scopeId).toBe("");
});

it("keeps the applied scope on invalid manual input and still permits clearing it", async () => {
  const user = userEvent.setup();
  render(<ScopeExample scopeId={NATIVE_ID} />);
  const input = screen.getByLabelText(t("text.initialScopeDocumentOrBlockId"));
  await user.click(input);
  await user.keyboard("{Control>}a{/Control}");
  await user.type(input, "invalid");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(JSON.parse(screen.getByTestId("filters").textContent!).scopeId).toBe(NATIVE_ID);
  expect(screen.getByText(t("scope.activeNode", { name: source.label }))).toBeTruthy();
  await user.clear(input);
  expect(JSON.parse(screen.getByTestId("filters").textContent!).scopeId).toBe("");
});

function SearchExample({
  count,
  onSelect = vi.fn(),
}: {
  count: number;
  onSelect?: ReturnType<typeof vi.fn>;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState({ ...structuredClone(DEFAULT_FILTERS), query: "" });
  const state = {
    filters,
    setFilters,
    chosenIds: [],
    data: { notebooks: [] },
    results: Array.from({ length: count }, (_, index) => ({
      ...source,
      id: `node-${index}`,
      index,
      label: `Match ${index}`,
    })),
    setSelectedId: onSelect,
    openDocument: vi.fn(),
    colorBy: "type",
  } as unknown as WorkbenchState;
  return (
    <div ref={anchor}>
      <GraphSearch state={state} anchorRef={anchor} />
    </div>
  );
}

it("discloses the cap without claiming there are additional matches", async () => {
  const user = userEvent.setup();
  render(<SearchExample count={GRAPH_SEARCH_RESULT_LIMIT} />);
  await user.type(screen.getByRole("textbox", { name: t("text.searchGraphNodes") }), "Match");
  expect(
    await screen.findByText(t("search.resultLimit", { limit: GRAPH_SEARCH_RESULT_LIMIT })),
  ).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /^Match / })).toHaveLength(
    GRAPH_SEARCH_RESULT_LIMIT,
  );
});

it("reports the uncapped count and preserves Down/Enter selection and Escape focus", async () => {
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(<SearchExample count={2} onSelect={onSelect} />);
  const input = screen.getByRole("textbox", { name: t("text.searchGraphNodes") });
  await user.type(input, "Match");
  expect(await screen.findByText(t("search.resultCount", { count: 2 }))).toBeTruthy();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onSelect.mock.calls[0][0]).toBe("node-0");
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(input);
});
