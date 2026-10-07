// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { Popover, PopoverTrigger } from "../../../shared/ui/popover";
import { TooltipProvider } from "../../../shared/ui/tooltip";
import { Button } from "../../../shared/ui/button";
import { DEFAULT_FILTERS, type GraphFilters } from "../../../modules/presets/filters";
import { FilterPresetMenu } from "./FilterPresetMenu";
import type { WorkbenchState } from "../../model/state";
import { t } from "../../../shared/i18n/runtime";

afterEach(cleanup);

function Workbench({ modified = false }: { modified?: boolean }) {
  const host = useRef<HTMLElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<GraphFilters>(() => structuredClone(DEFAULT_FILTERS));
  // This fixture supplies the real editor's UI dependencies, leaving acquisition and rendering out of the interaction test.
  const state = {
    filtersOpen,
    setFiltersOpen,
    filters,
    setFilters,
    data: null,
    contentRules: filters.exclusionRules,
    exclusionContext: { pipeline: filters.exclusionPipeline, projection: filters },
    contentExclusions: { result: null, pending: false, error: "", retry: vi.fn() },
    chosenIds: [],
    mentionState: { progress: {}, ready: false, pending: false, error: "", result: { edges: [] } },
    layoutGrouping: { presentation: { pending: false, error: "", partition: null } },
    graphSettings: { layoutMode: "force", dimensions: 2 },
    view: { nodes: [], edges: [] },
    openReadIssueSource: vi.fn(),
    setSelectedId: vi.fn(),
    resetFilters: vi.fn(),
    filterPresets: {
      activeName: "Custom",
      presets: [],
      activeId: null,
      modified,
      temporaryActive: false,
      loading: false,
      saving: false,
      available: true,
      error: "",
      deleted: null,
    },
  } as unknown as WorkbenchState;
  return (
    <TooltipProvider>
      <style>{".hidden{display:none}"}</style>
      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div ref={anchor}>
          <PopoverTrigger data-filter-presets-trigger render={<Button />}>
            Presets
          </PopoverTrigger>
        </div>
        <section ref={host} data-testid="graph-stage" />
        <FilterPresetMenu state={state} editorHost={host} anchorRef={anchor} />
      </Popover>
      <output data-testid="applied">{JSON.stringify(filters)}</output>
    </TooltipProvider>
  );
}

async function openEditor(modified = false) {
  const user = userEvent.setup();
  render(<Workbench modified={modified} />);
  await user.click(await screen.findByRole("button", { name: t("text.editFilterCustom") }));
  await screen.findByRole("button", { name: t("text.backToFilterPresets") });
  return user;
}

async function mentionDraft(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: t("filter.mentions") }));
  const input = screen.getByRole("textbox", { name: t("text.excludedMentionPhrases") });
  await user.type(input, "Archive");
  return input;
}

it("keeps a draft mounted through category, collapse, and canceled Back", async () => {
  const user = await openEditor();
  const input = await mentionDraft(user);
  await user.click(screen.getByRole("button", { name: t("filter.scope") }));
  await user.click(screen.getByRole("button", { name: t("filter.collapse") }));
  expect(screen.queryByText(t("filter.discardTitle"))).toBeNull();
  await user.click(screen.getByRole("button", { name: t("filter.mentions") }));
  expect(screen.getByRole("textbox", { name: t("text.excludedMentionPhrases") })).toBe(input);
  await user.click(screen.getByRole("button", { name: t("text.backToFilterPresets") }));
  await screen.findByRole("heading", { name: t("filter.discardTitle") });
  await user.click(screen.getByRole("button", { name: t("filter.continueEditing") }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: t("text.backToFilterPresets") }),
    ),
  );
  expect(screen.getByRole("textbox", { name: t("text.excludedMentionPhrases") })).toBe(input);
  expect((input as HTMLTextAreaElement).value).toBe("Archive");
});

it.each(["back", "close", "escape"] as const)(
  "discards only the local draft and completes %s's destination",
  async (exit) => {
    const user = await openEditor(true);
    await mentionDraft(user);
    const applied = screen.getByTestId("applied").textContent;
    if (exit === "escape") await user.keyboard("{Escape}");
    else
      await user.click(
        screen.getByRole("button", {
          name: t(exit === "back" ? "text.backToFilterPresets" : "filter.close"),
        }),
      );
    await user.click(await screen.findByRole("button", { name: t("filter.discardAndExit") }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: t("text.backToFilterPresets") })).toBeNull(),
    );
    expect(screen.getByTestId("applied").textContent).toBe(applied);
    if (exit === "back")
      expect(await screen.findByRole("button", { name: t("text.editFilterCustom") })).toBeTruthy();
    else expect(screen.queryByRole("button", { name: t("text.editFilterCustom") })).toBeNull();
  },
);

it("cancels the confirmation with Escape and preserves the editor focus and draft", async () => {
  const user = await openEditor();
  const input = await mentionDraft(user);
  await user.keyboard("{Escape}");
  await screen.findByRole("heading", { name: t("filter.discardTitle") });
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: t("filter.discardTitle") })).toBeNull(),
  );
  expect(document.activeElement).toBe(input);
  expect((input as HTMLTextAreaElement).value).toBe("Archive");
});

it("starts a fresh draft session when immediately reopening after discard", async () => {
  const user = await openEditor();
  await mentionDraft(user);
  await user.click(screen.getByRole("button", { name: t("text.backToFilterPresets") }));
  await user.click(await screen.findByRole("button", { name: t("filter.discardAndExit") }));
  await user.click(await screen.findByRole("button", { name: t("text.editFilterCustom") }));
  await user.click(screen.getByRole("button", { name: t("filter.mentions") }));
  expect(
    (screen.getByRole("textbox", { name: t("text.excludedMentionPhrases") }) as HTMLTextAreaElement)
      .value,
  ).toBe("");
});

it("exits without prompting when a draft returns to applied values, despite an unsaved preset", async () => {
  const user = await openEditor(true);
  const input = await mentionDraft(user);
  await user.clear(input);
  await user.click(screen.getByRole("button", { name: t("filter.close") }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: t("text.backToFilterPresets") })).toBeNull(),
  );
  expect(screen.queryByRole("heading", { name: t("filter.discardTitle") })).toBeNull();
});

it("mounts the nonmodal editor inside the graph stage and ignores outside presses", async () => {
  const user = await openEditor();
  const stage = screen.getByTestId("graph-stage");
  expect(within(stage).getByRole("button", { name: t("text.backToFilterPresets") })).toBeTruthy();
  await user.click(screen.getByTestId("applied"));
  expect(within(stage).getByRole("button", { name: t("text.backToFilterPresets") })).toBeTruthy();
});

it.each(["content", "grouping"] as const)(
  "guards an unapplied %s draft independently",
  async (kind) => {
    const user = await openEditor();
    if (kind === "content") {
      await user.click(screen.getByRole("button", { name: t("contentExclusions.title") }));
      await user.click(
        screen.getByRole("button", {
          name: t("contentExclusions.documentLabelShort"),
        }),
      );
      await user.type(
        screen.getByRole("textbox", { name: t("contentExclusions.documentLabelShort") }),
        "/[[/",
      );
    } else {
      await user.click(screen.getByRole("button", { name: t("grouping.title") }));
      await user.click(screen.getByRole("button", { name: t("grouping.sets") }));
      await user.click(screen.getByRole("button", { name: t("grouping.addSet") }));
      await user.type(screen.getByRole("textbox", { name: t("grouping.rules") }), "Archive");
    }
    await user.click(screen.getByRole("button", { name: t("filter.close") }));
    expect(await screen.findByRole("heading", { name: t("filter.discardTitle") })).toBeTruthy();
  },
);

it("keeps the local draft mounted while a save-name dialog opens and closes", async () => {
  const user = await openEditor(true);
  const input = await mentionDraft(user);
  await user.click(screen.getByRole("button", { name: t("text.saveAsPreset") }));
  expect(await screen.findByRole("textbox", { name: t("text.presetName") })).toBeTruthy();
  expect(input.isConnected).toBe(true);
  expect(screen.queryByRole("heading", { name: t("filter.discardTitle") })).toBeNull();
  await user.click(screen.getByRole("button", { name: t("text.cancel") }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: t("text.excludedMentionPhrases") })).toBe(input),
  );
  expect((input as HTMLTextAreaElement).value).toBe("Archive");
});

it("does not prompt after applying a draft and leaves that applied change intact on Back", async () => {
  const user = await openEditor();
  await mentionDraft(user);
  await user.click(screen.getByRole("button", { name: t("text.applyExclusions") }));
  await user.click(screen.getByRole("button", { name: t("text.backToFilterPresets") }));
  expect(await screen.findByRole("button", { name: t("text.editFilterCustom") })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: t("filter.discardTitle") })).toBeNull();
  expect(screen.getByTestId("applied").textContent).toContain(
    '"excludedMentionPhrases":["archive"]',
  );
});
