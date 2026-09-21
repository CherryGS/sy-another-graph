import { useId, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Copy, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import type { GraphDataset } from "../../../core/graph/types";
import { getGraphLookups } from "../../../core/graph/graph-lookups";
import { nodeType } from "../../../core/scope/filter-types";
import { useLocale } from "../../../shared/i18n/react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/ui/table";
import { normalizeKeyword } from "../../mentions/keywords";
import type { ExclusionImpact } from "../pipeline";
import { ToggleGroup, ToggleGroupItem } from "../../../shared/ui/toggle-group";

const PAGE_SIZE = 50;

export function ContentExclusionPreview({
  data,
  impact,
  pending,
  title,
  onOpen,
  onLocate,
  canLocate,
}: {
  data: GraphDataset | null;
  impact?: ExclusionImpact;
  pending: boolean;
  title: string;
  onOpen: (id: string) => void;
  onLocate: (id: string) => void;
  canLocate: (id: string) => boolean;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<
    "removedIds" | "previousIds" | "retainedIds" | "matchedIds"
  >("removedIds");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const searchId = useId();
  const source = useMemo(() => (data ? getGraphLookups(data).byId : null), [data]);
  const result = pending ? undefined : impact;
  const ids = useMemo(() => {
    const search = normalizeKeyword(query);
    return (
      result?.[category].filter((id) => {
        const node = source?.get(id);
        return (
          !search ||
          normalizeKeyword(
            [
              id,
              node?.label,
              node?.documentLabel,
              node?.humanPath,
              node?.path,
              node && nodeType(node) === "d" ? node.content : "",
            ].join(" "),
          ).includes(search)
        );
      }) ?? []
    );
  }, [query, result, source, category]);
  if (!data) return null;
  const offset = Math.min(page, Math.max(0, Math.ceil(ids.length / PAGE_SIZE) - 1)) * PAGE_SIZE;
  const summary = result
    ? t("contentExclusions.stepSummary", {
        matched: result.matchedIds.length,
        previous: result.previousIds.length,
        removed: result.removedIds.length,
        retained: result.retainedIds.length,
      })
    : "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={!result || pending}>
          {t("mentions.previewDetails")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-4xl" data-filter-dialog>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("contentExclusions.countScope")}</DialogDescription>
        </DialogHeader>
        <FieldDescription aria-live="polite">
          {pending ? t("contentExclusions.previewPending") : summary}
        </FieldDescription>
        <ToggleGroup
          type="single"
          value={category}
          onValueChange={(value) => {
            if (value) {
              setCategory(value as typeof category);
              setPage(0);
            }
          }}
          className="flex-wrap"
          aria-label={t("contentExclusions.detailCategory")}
        >
          {(["removedIds", "previousIds", "retainedIds", "matchedIds"] as const).map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {t(
                value === "removedIds"
                  ? "contentExclusions.removed"
                  : value === "previousIds"
                    ? "contentExclusions.previous"
                    : value === "retainedIds"
                      ? "contentExclusions.retained"
                      : "contentExclusions.matched",
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={searchId}>{t("contentExclusions.previewSearch")}</FieldLabel>
            <Input
              id={searchId}
              value={query}
              maxLength={256}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </Field>
        </FieldGroup>
        <div className="min-h-0 overflow-auto" data-scroll-panel aria-busy={pending}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("contentExclusions.previewNode")}</TableHead>
                <TableHead>{t("contentExclusions.previewLocation")}</TableHead>
                <TableHead>{t("contentExclusions.previewType")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ids.slice(offset, offset + PAGE_SIZE).map((id) => {
                const node = source?.get(id);
                return (
                  <TableRow key={id}>
                    <TableCell className="max-w-80 whitespace-normal break-words">
                      <Button
                        size="sm"
                        variant="link"
                        className="h-auto max-w-full justify-start px-0 whitespace-normal text-left"
                        disabled={!node}
                        onClick={() => onOpen(id)}
                      >
                        <ExternalLink data-icon="inline-start" />
                        {(node && nodeType(node) === "d"
                          ? node.content || node.label
                          : node?.label) || id}
                      </Button>
                      <FieldDescription>{id}</FieldDescription>
                      <div className="flex gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("graph.copyNodeId")}
                          title={t("graph.copyNodeId")}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(id);
                              toast.success(t("graph.nodeIdCopied"));
                            } catch {
                              toast.error(t("graph.nodeIdCopyFailed"));
                            }
                          }}
                        >
                          <Copy />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={!canLocate(id)}
                          aria-label={t("contentExclusions.locate")}
                          title={t("contentExclusions.locate")}
                          onClick={() => {
                            onLocate(id);
                            setOpen(false);
                          }}
                        >
                          <LocateFixed />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-80 whitespace-normal break-words">
                      {node?.humanPath || node?.documentLabel || node?.path}
                    </TableCell>
                    <TableCell>
                      {node && nodeType(node) === "d"
                        ? t("contentExclusions.document")
                        : t("contentExclusions.block")}
                    </TableCell>
                  </TableRow>
                );
              })}
              {result && !ids.length && (
                <TableRow>
                  <TableCell colSpan={3}>{t("contentExclusions.previewNoMatches")}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldDescription>
            {t("mentions.previewPage", {
              from: ids.length ? offset + 1 : 0,
              to: Math.min(offset + PAGE_SIZE, ids.length),
              count: ids.length,
            })}
          </FieldDescription>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0 || pending}
              onClick={() => setPage(offset / PAGE_SIZE - 1)}
            >
              <ChevronLeft data-icon="inline-start" />
              {t("mentions.previewPrevious")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGE_SIZE >= ids.length || pending}
              onClick={() => setPage(offset / PAGE_SIZE + 1)}
            >
              {t("mentions.previewNext")}
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
