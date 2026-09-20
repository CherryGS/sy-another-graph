import { useId, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
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
import { useContentExclusions } from "../use-content-exclusions";
import type { ContentExclusionRule } from "../rules";

const PAGE_SIZE = 50;

export function ContentExclusionPreview({
  data,
  rules,
  onOpen,
}: {
  data: GraphDataset | null;
  rules: readonly ContentExclusionRule[] | null;
  onOpen: (id: string) => void;
}) {
  useLocale();
  const preview = useContentExclusions(data, rules, 400);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const searchId = useId();
  const source = useMemo(() => (data ? getGraphLookups(data).byId : null), [data]);
  const result = preview.result;
  const ids = useMemo(() => {
    const search = normalizeKeyword(query);
    return (
      result?.ids.filter((id) => {
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
  }, [query, result, source]);
  if (!data || !rules?.length) return null;
  const offset = Math.min(page, Math.max(0, Math.ceil(ids.length / PAGE_SIZE) - 1)) * PAGE_SIZE;
  const summary = result
    ? t("contentExclusions.previewSummary", {
        roots: result.matchedRoots,
        documents: result.documents,
        blocks: result.blocks,
      })
    : "";
  return (
    <Dialog>
      <div className="flex flex-wrap items-center justify-between gap-3" aria-live="polite">
        <FieldDescription>
          {preview.error ||
            (preview.pending
              ? t("contentExclusions.previewPending")
              : result
                ? t("contentExclusions.previewCompact", {
                    documents: result.documents,
                    blocks: result.blocks,
                  })
                : "")}
        </FieldDescription>
        {preview.error ? (
          <Button size="sm" variant="ghost" onClick={preview.retry}>
            {t("mentions.previewRetry")}
          </Button>
        ) : (
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" disabled={!result || preview.pending}>
              {t("mentions.previewDetails")}
            </Button>
          </DialogTrigger>
        )}
      </div>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-4xl" data-filter-dialog>
        <DialogHeader>
          <DialogTitle>{t("contentExclusions.previewTitle")}</DialogTitle>
          <DialogDescription>{t("contentExclusions.previewDescription")}</DialogDescription>
        </DialogHeader>
        <FieldDescription aria-live="polite">
          {preview.error || (preview.pending ? t("contentExclusions.previewPending") : summary)}
        </FieldDescription>
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
        <div className="min-h-0 overflow-auto" data-scroll-panel aria-busy={preview.pending}>
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
              disabled={offset === 0 || preview.pending}
              onClick={() => setPage(offset / PAGE_SIZE - 1)}
            >
              <ChevronLeft data-icon="inline-start" />
              {t("mentions.previewPrevious")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGE_SIZE >= ids.length || preview.pending}
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
