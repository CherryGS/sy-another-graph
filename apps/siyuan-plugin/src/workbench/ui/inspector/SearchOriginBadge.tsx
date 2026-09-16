import { useLocale } from "../../../shared/i18n/react";
import { Badge } from "@/shared/ui/badge";
import { SEARCH_ORIGIN_LABELS, searchOriginDescription } from "../../presentation/search-origins";
import { searchNodeOrigin, type SearchOrigins } from "../../../modules/search/origins";

export function SearchOriginBadge({ id, origins }: { id: string; origins?: SearchOrigins }) {
  useLocale();
  const origin = searchNodeOrigin(id, origins);
  if (!origin) return null;
  return (
    <Badge
      variant={origin === "ancestor" ? "outline" : "secondary"}
      title={searchOriginDescription(id, origins)}
    >
      {SEARCH_ORIGIN_LABELS[origin]}
    </Badge>
  );
}
