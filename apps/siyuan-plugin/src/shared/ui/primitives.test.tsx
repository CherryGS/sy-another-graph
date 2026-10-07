// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { Button } from "./button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { SettingSlider } from "../../workbench/ui/appearance/SettingsPanel";
import { GraphNotices } from "../../workbench/ui/GraphNotices";
import type { WorkbenchState } from "../../workbench/model/state";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("activates the settings tab when arrow navigation moves focus", async () => {
  const user = userEvent.setup();
  render(
    <Tabs defaultValue="display">
      <TabsList activateOnFocus>
        <TabsTrigger value="display">Display</TabsTrigger>
        <TabsTrigger value="forces">Forces</TabsTrigger>
      </TabsList>
      <TabsContent value="display">Appearance controls</TabsContent>
      <TabsContent value="forces">Force controls</TabsContent>
    </Tabs>,
  );
  await user.click(screen.getByRole("tab", { name: "Display" }));
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Forces" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tabpanel").textContent).toBe("Force controls");
});

it("uses array selection for toggles and supports clearing the selected category", async () => {
  function Example() {
    const [value, setValue] = useState(["scope"]);
    return (
      <ToggleGroup value={value} onValueChange={setValue}>
        <ToggleGroupItem value="scope">Scope</ToggleGroupItem>
        <ToggleGroupItem value="mentions">Mentions</ToggleGroupItem>
      </ToggleGroup>
    );
  }
  const user = userEvent.setup();
  render(<Example />);
  await user.click(screen.getByRole("button", { name: "Mentions" }));
  expect(screen.getByRole("button", { name: "Mentions" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(screen.getByRole("button", { name: "Scope" }).getAttribute("aria-pressed")).toBe("false");
  await user.click(screen.getByRole("button", { name: "Mentions" }));
  expect(screen.getByRole("button", { name: "Mentions" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
});

it("displays select item labels before opening and updates the selected label by keyboard", async () => {
  const items = [
    { value: "type", label: "By node type" },
    { value: "branch", label: "By document branch" },
  ];
  function Example() {
    const [value, setValue] = useState<string | null>("type");
    return (
      <Select items={items} value={value} onValueChange={setValue}>
        <SelectTrigger aria-label="Node color">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }
  const user = userEvent.setup();
  render(<Example />);
  expect(screen.getByRole("combobox").textContent).toBe("By node type");
  await user.click(screen.getByRole("combobox"));
  const firstOption = await screen.findByRole("option", { name: "By node type" });
  await waitFor(() => expect(document.activeElement).toBe(firstOption));
  await user.keyboard("{End}");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("option", { name: "By document branch" })),
  );
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("combobox").textContent).toBe("By document branch"));
});

it("commits the labeled single slider's keyboard value", async () => {
  const commit = vi.fn();
  // jsdom has no layout; provide only the geometry the Base UI edge-aligned thumb needs.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return new DOMRect(0, 0, this.getAttribute("data-slot") === "slider-thumb" ? 12 : 100, 20);
  });
  const user = userEvent.setup();
  render(
    <SettingSlider
      name="Node size"
      value={4}
      range={{ min: 1, max: 10, step: 0.5 }}
      onCommit={commit}
    />,
  );
  const slider = await screen.findByRole("slider", { name: "Node size" });
  slider.focus();
  await user.keyboard("{ArrowRight}");
  expect(commit).toHaveBeenCalledWith(4.5);
  expect(screen.getByText("4.5")).toBeTruthy();
});

it("composes nested triggers onto one button and restores focus on Escape", async () => {
  const user = userEvent.setup();
  render(
    <Popover>
      <PopoverTrigger render={<Button />}>Open</PopoverTrigger>
      <PopoverContent>
        <Button>Inside</Button>
      </PopoverContent>
    </Popover>,
  );
  await user.click(screen.getByRole("button", { name: "Open" }));
  expect(screen.getByRole("button", { name: "Open" }).querySelector("button")).toBeNull();
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open" })),
  );
});

it("preserves native download link semantics", () => {
  render(
    <GraphNotices
      state={
        {
          exportFile: { url: "blob:graph", name: "graph.json", nodesCount: 2, edgesCount: 1 },
          dismissExport: vi.fn(),
        } as unknown as WorkbenchState
      }
    />,
  );
  const link = screen.getByRole("link", { name: "Download JSON" });
  expect(link.tagName).toBe("A");
  expect(link.getAttribute("href")).toBe("blob:graph");
  expect(link.getAttribute("download")).toBe("graph.json");
  expect(link.hasAttribute("role")).toBe(false);
});

it("positions a popover from the actual toolbar anchor rather than its trigger", async () => {
  const toolbarRect = vi.fn(() => new DOMRect(40, 20, 360, 40));
  function Example() {
    const anchor = useRef<HTMLDivElement>(null);
    return (
      <Popover defaultOpen>
        <div
          ref={(element) => {
            anchor.current = element;
            if (element) element.getBoundingClientRect = toolbarRect;
          }}
        />
        <PopoverTrigger render={<Button />}>Open</PopoverTrigger>
        <PopoverContent anchor={anchor}>Anchored content</PopoverContent>
      </Popover>
    );
  }
  render(<Example />);
  await waitFor(() => {
    expect(toolbarRect).toHaveBeenCalled();
    expect(
      screen.getByText("Anchored content").parentElement?.style.getPropertyValue("--anchor-width"),
    ).toBe("360px");
  });
});
