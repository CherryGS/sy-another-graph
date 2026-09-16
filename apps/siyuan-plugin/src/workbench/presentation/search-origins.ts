import { t } from "../../shared/i18n/runtime";
import {
  searchNodeOrigin,
  type SearchOrigin,
  type SearchOrigins,
} from "../../modules/search/origins";
export const SEARCH_MATCH_RING_COLOR = "#ff4fd8";

export const SEARCH_ORIGIN_LABELS: Record<SearchOrigin, string> = {
  get match() {
    return t("text.directMatch");
  },
  get "projected-match"() {
    return t("text.projectedMatch");
  },
  get ancestor() {
    return t("text.ancestor");
  },
};

export function searchOriginDescription(id: string, origins?: SearchOrigins): string | undefined {
  const origin = searchNodeOrigin(id, origins);
  if (!origin) return undefined;
  const count = origins?.projected.get(id) ?? 0;
  if (origin === "ancestor") return t("text.ancestorAddedToCompleteTheAncestorChainOf");
  if (origin === "projected-match")
    return t("text.projectedMatchRepresentsValueHiddenMatchingBlocksThis", { p0: count });
  return count
    ? t("text.directSearchMatchAlsoRepresentingValueHiddenMatching", { p0: count })
    : t("text.directMatchIncludedInTheOriginalSearchResults");
}
