import { message as msg, MessageError, failureOf } from "../../../core/diagnostics/message";

import { t, text } from "../../../shared/i18n/runtime";
import { api } from "../data/api";
import type { EventBus, IEventBusMap } from "siyuan";
import {
  collectSearchResults,
  unsupportedSearch,
  type SearchConfig,
} from "../../../modules/search/collect";
import type { SearchGraphSnapshot } from "../../../modules/search/model";

type SearchEvent = CustomEvent<IEventBusMap["input-search"]>;
interface SearchPanel {
  input: HTMLInputElement;
  button: HTMLButtonElement;
  config: SearchConfig | null;
  requestValue: string | null;
  abort: AbortController | null;
  invalidate: () => void;
}

/** The public hooks cover both native tabs/dialogs and HZ Simple Search 1.3.6.
 * Each input owns its final request and button; plugin listener order is irrelevant. */
export function registerSearchGraphs(
  bus: Pick<EventBus, "on" | "off">,
  open: (snapshot: SearchGraphSnapshot) => Promise<unknown>,
  report: (message: string) => void,
): () => void {
  const panels = new Map<HTMLInputElement, SearchPanel>();
  let disposed = false;
  let latest = 0;
  const remove = (panel: SearchPanel) => {
    panel.abort?.abort();
    panel.input.removeEventListener("input", panel.invalidate, true);
    panel.button.remove();
    panels.delete(panel.input);
  };
  const prune = () => {
    for (const panel of panels.values()) if (!panel.input.isConnected) remove(panel);
  };
  const update = (panel: SearchPanel) => {
    panel.button.textContent = t("text.graphAllResults");
    panel.button.disabled = !panel.config;
    panel.button.title = panel.config
      ? text(unsupportedSearch(panel.config)) || t("text.useAllResultPagesInAnIndependentTemporary")
      : t("text.waitForTheSearchToFinish");
  };
  const ensure = (input: HTMLInputElement) => {
    prune();
    if (disposed || !input?.isConnected) return null;
    const existing = panels.get(input);
    if (existing) return existing;
    const toolbar = input
      .closest(".fn__flex-column")
      ?.querySelector("#searchResult")?.parentElement;
    if (!toolbar) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "b3-button b3-button--small b3-button--outline fn__flex-shrink";
    button.style.marginLeft = "8px";
    button.dataset.searchGraph = "true";
    const panel: SearchPanel = {
      input,
      button,
      config: null,
      requestValue: null,
      abort: null,
      invalidate: () => {
        panel.abort?.abort();
        panel.abort = null;
        panel.config = null;
        panel.requestValue = null;
        update(panel);
      },
    };
    // Invalidate before the host's bubble listener can start a synchronous
    // request; otherwise that new request would invalidate itself.
    input.addEventListener("input", panel.invalidate, true);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (panel.abort) {
        panel.abort.abort();
        panel.abort = null;
        update(panel);
        return;
      }
      if (!panel.config) return;
      const reason = unsupportedSearch(panel.config);
      if (reason) {
        report(text(reason));
        return;
      }
      const notebooks =
        (window as unknown as { siyuan?: { notebooks?: { id: string; encrypted?: boolean }[] } })
          .siyuan?.notebooks ?? [];
      if (
        panel.config.idPath?.some((path) =>
          notebooks.some((book) => book.id === path.split("/")[0] && book.encrypted),
        )
      ) {
        report(t("text.searchGraphsDoNotSupportEncryptedNotebooksSelect"));
        return;
      }
      // A newer click in any search panel supersedes the previous request.
      for (const other of panels.values()) {
        other.abort?.abort();
        other.abort = null;
        update(other);
      }
      const generation = ++latest;
      const abort = new AbortController();
      panel.abort = abort;
      const timeout = setTimeout(
        () =>
          abort.abort(
            new MessageError(msg("text.readingSearchResultsExceededTwoMinutesNarrowThe")),
          ),
        120_000,
      );
      const config = structuredClone(panel.config);
      const label =
        input.value.trim().slice(0, 120) || config.hPath?.slice(0, 120) || t("text.specifiedPath");
      button.textContent = t("text.readingAllResultsClickToCancel");
      void collectSearchResults(
        config,
        abort.signal,
        (read, total) => {
          if (!abort.signal.aborted)
            button.textContent = t("text.valueValueCancel", { p0: read, p1: total });
        },
        api,
      )
        .then(async (ids) => {
          if (disposed || abort.signal.aborted || generation !== latest || !input.isConnected)
            return;
          await open({ requestId: crypto.randomUUID(), label, query: config.query ?? "", ids });
          // SiYuan's close control is an SVG, which has no HTMLElement.click().
          if (!disposed && !abort.signal.aborted)
            input
              .closest(".b3-dialog")
              ?.querySelector(".b3-dialog__close")
              ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        })
        .catch((failure: unknown) => {
          if (disposed || generation !== latest) return;
          if (
            abort.signal.aborted &&
            !(abort.signal.reason instanceof Error && abort.signal.reason.name !== "AbortError")
          )
            return;
          report(text(failureOf(failure)));
        })
        .finally(() => {
          clearTimeout(timeout);
          if (panel.abort === abort) {
            panel.abort = null;
            update(panel);
          }
        });
    });
    toolbar.appendChild(button);
    panels.set(input, panel);
    update(panel);
    return panel;
  };
  const input = ({ detail }: SearchEvent) => {
    const panel = ensure(detail.searchElement);
    if (!panel) return;
    panel.invalidate();
    panel.requestValue = detail.searchElement.value;
  };
  const results = ({ detail }: CustomEvent<IEventBusMap["before-search-results-render"]>) => {
    const panel = ensure(detail.searchElement);
    if (!panel || panel.requestValue !== detail.searchElement.value) return;
    const requestValue = panel.requestValue;
    panel.invalidate();
    panel.requestValue = requestValue;
    panel.config = structuredClone(detail.config);
    update(panel);
  };
  bus.on("input-search", input);
  bus.on("before-search-results-render", results);
  // Closing a search dialog does not necessarily emit destroy-protyle.
  const observer = new MutationObserver(prune);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    disposed = true;
    latest++;
    bus.off("input-search", input);
    bus.off("before-search-results-render", results);
    observer.disconnect();
    for (const panel of panels.values()) remove(panel);
  };
}
