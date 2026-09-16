import { useEffect, useId, useState } from "react";
import { ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
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
import { PREVIEW_PAGE_SIZE } from "../exclusion-preview";
import type { MentionExclusions } from "../exclusions";
import { useExclusionPreview } from "../use-exclusion-preview";
import type { MentionControlsProps } from "./types";

export function ExclusionPreview({
  rules,
  source,
}: {
  rules: MentionExclusions | null;
  source: MentionControlsProps["previewSource"];
}) {
  useLocale();
  const preview = useExclusionPreview(source.blocks, rules);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const page = preview.page;
  const queryKey = page?.query ?? "";
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- A new preview or page response supplies the current result query.
    setQuery(queryKey);
  }, [queryKey]);
  if (!rules || !source.blocks || !preview.enabled) return null;
  const summary = page
    ? t("mentions.previewSummary", { names: page.matchedNames, nodes: page.matchedNodes })
    : "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <FieldDescription>
          {preview.error || (preview.pending ? t("mentions.previewPending") : summary)}
        </FieldDescription>
        {preview.error ? (
          <Button size="sm" variant="ghost" onClick={preview.retry}>
            {t("mentions.previewRetry")}
          </Button>
        ) : (
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" disabled={!page || preview.pending}>
              {t("mentions.previewDetails")}
            </Button>
          </DialogTrigger>
        )}
      </div>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-4xl" data-filter-dialog>
        <DialogHeader>
          <DialogTitle>{t("mentions.previewTitle")}</DialogTitle>
          <DialogDescription>{t("mentions.previewDescription")}</DialogDescription>
        </DialogHeader>
        <FieldDescription aria-live="polite">
          {preview.error || (preview.pending ? t("mentions.previewPending") : summary)}
        </FieldDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            preview.requestPage(0, query);
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={searchId}>{t("mentions.previewSearch")}</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id={searchId}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  maxLength={256}
                />
                <Button type="submit" variant="outline" disabled={!page || preview.pending}>
                  {t("mentions.previewFind")}
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </form>
        <div className="min-h-0 overflow-auto" data-scroll-panel aria-busy={preview.pending}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("mentions.previewName")}</TableHead>
                <TableHead>{t("mentions.previewNode")}</TableHead>
                <TableHead>{t("mentions.previewRule")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page?.rows.map((row) => {
                const node = source.nodes?.get(row.id);
                return (
                  <TableRow key={`${row.id}:${row.keyword}`}>
                    <TableCell className="max-w-64 whitespace-normal break-words">
                      <p>{row.name}</p>
                      {row.name !== row.keyword && (
                        <FieldDescription>
                          {t("mentions.previewNormalized", { name: row.keyword })}
                        </FieldDescription>
                      )}
                    </TableCell>
                    <TableCell className="max-w-80 whitespace-normal break-words">
                      <Button
                        size="sm"
                        variant="link"
                        className="h-auto max-w-full justify-start px-0 whitespace-normal text-left"
                        disabled={!node}
                        onClick={() => source.open(row.id)}
                      >
                        <ExternalLink data-icon="inline-start" />
                        {node?.documentLabel || node?.label || row.id}
                      </Button>
                      <FieldDescription>{node?.humanPath || node?.path}</FieldDescription>
                      <code>{row.id}</code>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal break-words">
                      <code>
                        {row.rule.kind === "pattern" ? `/${row.rule.source}/` : row.rule.source}
                      </code>
                    </TableCell>
                  </TableRow>
                );
              })}
              {page && !page.rows.length && (
                <TableRow>
                  <TableCell colSpan={3}>{t("mentions.previewNoMatches")}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldDescription>
            {page &&
              t("mentions.previewPage", {
                from: page.rows.length ? page.offset + 1 : 0,
                to: page.offset + page.rows.length,
                count: page.filteredRows,
              })}
          </FieldDescription>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!page || preview.pending || page.offset === 0}
              onClick={() =>
                page && preview.requestPage(page.offset - PREVIEW_PAGE_SIZE, page.query)
              }
            >
              <ChevronLeft data-icon="inline-start" />
              {t("mentions.previewPrevious")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                !page || preview.pending || page.offset + page.rows.length >= page.filteredRows
              }
              onClick={() =>
                page && preview.requestPage(page.offset + PREVIEW_PAGE_SIZE, page.query)
              }
            >
              {t("mentions.previewNext")}
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
        <FieldDescription>{t("mentions.previewRuleHint")}</FieldDescription>
      </DialogContent>
    </Dialog>
  );
}
