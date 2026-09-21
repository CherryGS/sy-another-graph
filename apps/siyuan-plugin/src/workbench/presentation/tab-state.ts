import { t } from "../../shared/i18n/runtime";
import type { GraphDataset } from "../../core/graph/types";
import type { GraphFilters } from "../../modules/presets/filters";
import { getGraphLookups } from "../../core/graph/graph-lookups";
import { NODE_TYPE_LABELS } from "./graph-labels";

const clean = (value: string) =>
  Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
const short = (value: string, length: number) => {
  const text = clean(value);
  if (text.length <= length) return text;
  let clipped = "";
  for (const character of text) {
    if (clipped.length + character.length >= length) break;
    clipped += character;
  }
  return clipped + "…";
};

/** A semantic summary of filter rules; transient selection and runtime counts
 * never determine the native tab title. */
export function graphTabState(
  filters: GraphFilters,
  data: GraphDataset | null,
  name: string,
  modified: boolean,
  searchScope?: string,
) {
  const source = data ? getGraphLookups(data).byId : null;
  const notebook = filters.notebook
    ? (data?.notebooks.find((book) => book.id === filters.notebook)?.name ??
      t("text.specifiedNotebook"))
    : t("text.all");
  const scope =
    searchScope ??
    (filters.scopeId ? source?.get(filters.scopeId)?.label || t("text.specifiedScope") : notebook);
  const preset = clean(name) || t("text.custom");
  const title = t("text.graphValueValueValue", {
    p0: short(scope, 28),
    p1: short(preset, 28),
    p2: modified ? "*" : "",
  });
  const relations = [
    filters.references && t("text.references"),
    filters.hierarchy && t("text.containment"),
    filters.databases && t("text.databaseRelationships"),
  ].filter(Boolean);
  const types = filters.documentsOnly
    ? t("text.documentsOnly")
    : filters.hiddenTypes.length
      ? t("text.customHiddenValue", {
          p0: filters.hiddenTypes
            .map((type) => NODE_TYPE_LABELS[type] ?? type)
            .join(t("common.listSeparator")),
        })
      : t("text.allTypes");
  const description = clean(
    [
      t("text.graphScopeValueValue", {
        p0: scope,
        p1: filters.scopeId ? `（${filters.scopeId}）` : "",
      }),
      t("text.notebookValue", { p0: notebook }),
      t("text.presetValueValue", {
        p0: preset,
        p1: modified ? t("text.modifiedNotSavedToPreset") : "",
      }),
      t("text.typesValue", { p0: types }),
      t("text.relationshipsValue", { p0: relations.join("、") || t("text.off") }),
      t("text.textMentionsValue", {
        p0:
          filters.mentions === "off"
            ? t("text.off")
            : filters.mentions === "selected"
              ? t("text.selectedNodes")
              : t("text.allInScope"),
      }),
      ...(filters.excludedMentionPhrases.length + filters.excludedMentionPatterns.length
        ? [
            t("text.excludedPhrasesValue", {
              p0: filters.excludedMentionPhrases.length + filters.excludedMentionPatterns.length,
            }),
          ]
        : []),
      t("text.childDocumentsValue", {
        p0: filters.includeChildDocuments ? t("text.included") : t("text.excluded"),
      }),
      t("contentExclusions.summary", {
        count: filters.excludeIds.length + filters.exclusionRules.length,
      }),
      t("grouping.summary", {
        mode: t(
          filters.grouping.mode === "sets"
            ? "grouping.sets"
            : filters.grouping.mode === "community"
              ? "grouping.community"
              : "text.off",
        ),
      }),
      t("text.isolatedNodesValue", {
        p0: filters.hideIsolated ? t("text.hideUnselectedNodes") : t("text.shown"),
      }),
    ].join(t("common.summarySeparator")),
  );
  return { title, description: short(description, 900) };
}
