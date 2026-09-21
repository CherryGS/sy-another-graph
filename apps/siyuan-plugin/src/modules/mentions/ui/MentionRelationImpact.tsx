import { useMemo, useState } from "react";
import type { GraphDataset } from "../../../core/graph/types";
import type { CurrentGraph } from "../../../core/scope/graph-model";
import { t } from "../../../shared/i18n/runtime";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../shared/ui/dialog";
import { FieldDescription } from "../../../shared/ui/field";
import { ToggleGroup, ToggleGroupItem } from "../../../shared/ui/toggle-group";
import { useMentions } from "../use-mentions";
import { mentionRelationImpact } from "../relation-impact";
import type { MentionMode } from "../types";

const NO_RULES: readonly string[] = [];
interface Props {
  data: GraphDataset | null;
  graph: CurrentGraph | null;
  mode: MentionMode;
  chosenIds: readonly string[];
  status: ReturnType<typeof useMentions>;
  enabled: boolean;
  onOpen: (id: string) => void;
}
export function MentionRelationImpact(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="w-full"
          variant="outline"
          disabled={!props.enabled || props.mode === "off" || !props.graph}
        >
          {t("mentions.relationImpact")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl" data-filter-dialog>
        <DialogHeader>
          <DialogTitle>{t("mentions.relationImpact")}</DialogTitle>
          <DialogDescription>{t("mentions.relationImpactDescription")}</DialogDescription>
        </DialogHeader>
        {open && <ImpactBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}
function ImpactBody({ data, graph, mode, chosenIds, status, onOpen }: Props) {
  const baseline = useMentions(data, graph, mode, chosenIds, NO_RULES, NO_RULES);
  const [category, setCategory] = useState<"removed" | "added">("removed"),
    [page, setPage] = useState(0);
  const pending = baseline.pending || !baseline.ready || status.pending || !status.ready;
  const error = baseline.error || status.error;
  const impact = useMemo(
    () =>
      pending || error ? null : mentionRelationImpact(baseline.result.edges, status.result.edges),
    [pending, error, baseline.result, status.result],
  );
  const byIndex = useMemo(
    () => new Map(graph?.nodes.map((node) => [node.index, node]) ?? []),
    [graph],
  );
  const partial = [baseline, status].some(
    (state) =>
      state.result.truncated ||
      state.progress.skippedKeywords ||
      state.progress.skippedSources ||
      state.progress.limitedSources,
  );
  const rows = impact?.[category] ?? [],
    offset = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1)) * 50;
  return (
    <>
      <FieldDescription aria-live="polite">
        {error ||
          (pending
            ? t("mentions.previewPending")
            : impact
              ? t("mentions.relationImpactCounts", {
                  removed: impact.removed.length,
                  added: impact.added.length,
                })
              : "")}
      </FieldDescription>
      {error && (
        <Button
          variant="outline"
          onClick={() => {
            baseline.retry();
            status.retry();
          }}
        >
          {t("mentions.previewRetry")}
        </Button>
      )}
      {partial && <FieldDescription>{t("mentions.relationImpactPartial")}</FieldDescription>}
      <ToggleGroup
        type="single"
        value={category}
        onValueChange={(value) => {
          if (value === "removed" || value === "added") {
            setCategory(value);
            setPage(0);
          }
        }}
      >
        <ToggleGroupItem value="removed">{t("mentions.relationsRemoved")}</ToggleGroupItem>
        <ToggleGroupItem value="added">{t("mentions.relationsAdded")}</ToggleGroupItem>
      </ToggleGroup>
      <div className="flex min-h-0 flex-col gap-2 overflow-auto" data-scroll-panel>
        {rows.slice(offset, offset + 50).map((edge) => (
          <div key={`${edge.source}:${edge.target}`} className="flex items-center gap-2">
            {[edge.source, edge.target].map((index, side) => {
              const node = byIndex.get(index);
              return (
                <span key={side} className="flex min-w-0 flex-1 items-center gap-2">
                  {side === 1 && "→"}
                  <Button
                    size="sm"
                    variant="link"
                    title={node?.id}
                    className="min-w-0 justify-start"
                    disabled={!node}
                    onClick={() => node && onOpen(node.id)}
                  >
                    <span className="truncate">
                      {(node?.blockType === "d" ? node.content || node.label : node?.label) ||
                        node?.id}
                    </span>
                  </Button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldDescription>
          {t("mentions.previewPage", {
            from: rows.length ? offset + 1 : 0,
            to: Math.min(offset + 50, rows.length),
            count: rows.length,
          })}
        </FieldDescription>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!offset || pending}
            onClick={() => setPage(offset / 50 - 1)}
          >
            {t("mentions.previewPrevious")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + 50 >= rows.length || pending}
            onClick={() => setPage(offset / 50 + 1)}
          >
            {t("mentions.previewNext")}
          </Button>
        </div>
      </div>
    </>
  );
}
