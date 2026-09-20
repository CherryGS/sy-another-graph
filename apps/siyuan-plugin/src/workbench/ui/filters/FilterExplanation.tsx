import { useId, useMemo, useState } from "react";
import { ExternalLink, ScanSearch } from "lucide-react";
import {
  explainNode,
  explainRelation,
  type NodeExplanation,
} from "../../../core/scope/graph-explanation";
import { isBlock } from "../../../core/scope/filter-types";
import { useLocale } from "../../../shared/i18n/react";
import { t, text } from "../../../shared/i18n/runtime";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../shared/ui/card";
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
import { EDGE_KIND_LABELS } from "../../presentation/graph-labels";
import type { WorkbenchState } from "../../model/state";

const STAGES = {
  source: "graph.traceStageSource",
  scope: "graph.traceStageScope",
  projection: "graph.traceStageProjection",
  display: "graph.traceStageDisplay",
} as const;

function NodeTrace({
  id,
  result,
  onOpen,
}: {
  id: string;
  result: NodeExplanation;
  onOpen: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-words">{result.node?.label || id}</CardTitle>
        <CardDescription className="break-all">{id}</CardDescription>
        {result.node && isBlock(result.node) && (
          <Button size="sm" variant="link" className="w-fit px-0" onClick={() => onOpen(id)}>
            <ExternalLink data-icon="inline-start" />
            {t("graph.traceOpenSource")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {result.steps.map((step) => (
            <li key={step.stage} className="flex flex-wrap items-start gap-2">
              <Badge variant="secondary">{t(STAGES[step.stage])}</Badge>
              <p className="min-w-0 flex-1 break-words">{text(step.message)}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function FilterExplanation({
  state,
  compact = false,
}: {
  state: WorkbenchState;
  compact?: boolean;
}) {
  useLocale();
  const [from, setFrom] = useState(state.selectedId ?? "");
  const [to, setTo] = useState("");
  const [submitted, setSubmitted] = useState<{ from: string; to: string } | null>(null);
  const id = useId();
  const { data, currentGraph, view, backgroundIds } = state;
  const result = useMemo(
    () =>
      data && currentGraph && submitted
        ? {
            from: explainNode(data, currentGraph, view, backgroundIds, submitted.from),
            to: submitted.to
              ? explainNode(data, currentGraph, view, backgroundIds, submitted.to)
              : null,
            relation: submitted.to
              ? explainRelation(data, currentGraph, submitted.from, submitted.to)
              : null,
          }
        : null,
    [data, currentGraph, view, backgroundIds, submitted],
  );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={!data || !currentGraph}
          aria-label={t("graph.traceTrigger")}
          title={t("graph.traceTrigger")}
        >
          <ScanSearch data-icon="inline-start" />
          {t(compact ? "filter.inspectShort" : "graph.traceTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl" data-filter-dialog>
        <DialogHeader>
          <DialogTitle>{t("graph.traceTitle")}</DialogTitle>
          <DialogDescription>{t("graph.traceDescription")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (from.trim()) setSubmitted({ from: from.trim(), to: to.trim() });
          }}
        >
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor={`${id}-from`}>{t("graph.traceNodeId")}</FieldLabel>
              <Input
                id={`${id}-from`}
                value={from}
                maxLength={256}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-to`}>{t("graph.traceTargetId")}</FieldLabel>
              <Input
                id={`${id}-to`}
                value={to}
                maxLength={256}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
            <Button
              className="self-start"
              type="submit"
              disabled={!from.trim() || !data || !currentGraph}
            >
              {t("graph.traceCheck")}
            </Button>
          </FieldGroup>
        </form>
        {result && submitted && (
          <div className="min-h-0 overflow-auto" data-scroll-panel aria-live="polite">
            <div className="flex flex-col gap-3">
              <NodeTrace
                id={submitted.from}
                result={result.from}
                onOpen={state.openReadIssueSource}
              />
              {result.to && (
                <NodeTrace
                  id={submitted.to}
                  result={result.to}
                  onOpen={state.openReadIssueSource}
                />
              )}
              {result.relation && (
                <>
                  <FieldLabel>{t("graph.traceOriginalRelations")}</FieldLabel>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("graph.traceKind")}</TableHead>
                        <TableHead>{t("graph.traceCount")}</TableHead>
                        <TableHead>{t("graph.traceOutcome")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.relation.original.map((row) => (
                        <TableRow key={row.kind}>
                          <TableCell>{EDGE_KIND_LABELS[row.kind]}</TableCell>
                          <TableCell>{row.count}</TableCell>
                          <TableCell className="whitespace-normal">{text(row.reason)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!result.relation.original.length && (
                    <FieldDescription>{t("graph.traceNoOriginalRelation")}</FieldDescription>
                  )}
                  <FieldLabel>{t("graph.traceDisplayedRelations")}</FieldLabel>
                  <FieldDescription>{t("graph.traceDisplayedDescription")}</FieldDescription>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("graph.traceKind")}</TableHead>
                        <TableHead>{t("graph.traceCount")}</TableHead>
                        <TableHead>{t("graph.traceWeight")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.relation.displayed.map((row) => (
                        <TableRow key={row.kind}>
                          <TableCell>{EDGE_KIND_LABELS[row.kind]}</TableCell>
                          <TableCell>{row.count}</TableCell>
                          <TableCell>{row.weight}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!result.relation.displayed.length && (
                    <FieldDescription>{t("graph.traceNoDisplayedRelation")}</FieldDescription>
                  )}
                  <FieldDescription>
                    {state.filters.mentions === "off"
                      ? t("graph.traceMentionsOff")
                      : state.mentionState.error ||
                        (!state.mentionState.ready || state.mentionState.pending
                          ? t("graph.traceMentionsPending")
                          : t("graph.traceMentionResultOnly"))}
                  </FieldDescription>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
