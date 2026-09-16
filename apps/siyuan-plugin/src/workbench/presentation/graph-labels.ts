import { t } from "../../shared/i18n/runtime";
import type { GraphEdgeKind } from "../../core/graph/types";

export const NODE_TYPE_LABELS: Record<string, string> = {
  get d() {
    return t("text.document");
  },
  get p() {
    return t("text.paragraph");
  },
  get h() {
    return t("text.heading");
  },
  get l() {
    return t("text.list");
  },
  get i() {
    return t("text.listItem");
  },
  get b() {
    return t("text.quote");
  },
  get s() {
    return t("text.superBlock");
  },
  get c() {
    return t("text.codeBlock");
  },
  get m() {
    return t("text.mathBlock");
  },
  get t() {
    return t("text.table");
  },
  get tb() {
    return t("text.divider");
  },
  html: "HTML",
  get iframe() {
    return t("text.embeddedPage");
  },
  get video() {
    return t("text.video");
  },
  get audio() {
    return t("text.audio");
  },
  get widget() {
    return t("text.widget");
  },
  get query_embed() {
    return t("text.embeddedQuery");
  },
  get av() {
    return t("text.databaseContainer");
  },
  get database() {
    return t("text.database");
  },
  get "database-item"() {
    return t("text.databaseItem");
  },
};

export const EDGE_KIND_LABELS: Record<GraphEdgeKind, string> = {
  get reference() {
    return t("text.blockReference");
  },
  get "text-mention"() {
    return t("text.textMention");
  },
  get hierarchy() {
    return t("text.containment");
  },
  get "database-embedding"() {
    return t("text.databaseContainer");
  },
  get "database-membership"() {
    return t("text.databaseMembership");
  },
  get "database-binding"() {
    return t("text.itemBinding");
  },
  get "database-relation"() {
    return t("text.relationField");
  },
};
