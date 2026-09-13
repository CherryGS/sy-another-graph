import { Badge } from "@/components/ui/badge";
import { SEARCH_ORIGIN_LABELS, searchNodeOrigin, searchOriginDescription, type SearchOrigins } from "../search/origins";

export function SearchOriginBadge({ id, origins }: { id: string; origins?: SearchOrigins }) {
  const origin = searchNodeOrigin(id, origins);
  if (!origin) return null;
  return <Badge variant={origin === "ancestor" ? "outline" : "secondary"} title={searchOriginDescription(id, origins)}>
    {SEARCH_ORIGIN_LABELS[origin]}
  </Badge>;
}
