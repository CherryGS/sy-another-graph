import { useEffect, useRef, useState } from "react";
import { Compass, Plus, ChevronDown, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Spinner } from "@/shared/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/shared/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Separator } from "@/shared/ui/separator";
import { useLocale } from "../../../shared/i18n/react";
import { t, text, locale } from "../../../shared/i18n/runtime";
import type { WorkbenchState } from "../../model/state";
import type { GraphEdge } from "../../../core/graph/types";
import { supportingEdges } from "../../../modules/discovery/reference-graph";
import type { DiscoveryMatch } from "../../../modules/discovery/types";
import { NativePreviewButton } from "../inspector/NativePreviewButton";

function Pages({
  page,
  count,
  size,
  onChange,
}: {
  page: number;
  count: number;
  size: number;
  onChange: (page: number) => void;
}) {
  return count > size ? (
    <div className="flex items-center justify-between gap-2">
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onChange(page - 1)}>
        {t("discovery.previous")}
      </Button>
      <span className="text-xs text-muted-foreground">
        {t("discovery.page", { page: page + 1, total: Math.ceil(count / size) })}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={(page + 1) * size >= count}
        onClick={() => onChange(page + 1)}
      >
        {t("discovery.next")}
      </Button>
    </div>
  ) : null;
}

function EvidenceGroup({
  label,
  edges,
  state,
}: {
  label: string;
  edges: readonly GraphEdge[];
  state: WorkbenchState;
}) {
  const [requestedPage, setPage] = useState(0);
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(edges.length / 10) - 1));
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-between gap-2 whitespace-normal">
          <span>
            {label} · {t("discovery.connections", { count: edges.length })}
          </span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2">
        {edges.slice(page * 10, (page + 1) * 10).map((edge, i) => (
          <Button
            key={page * 10 + i}
            variant="outline"
            className="h-auto w-full justify-start whitespace-normal text-left"
            onClick={() => state.inspectEdge(edge)}
          >
            {state.currentLookups?.byIndex.get(edge.source)?.label} →{" "}
            {state.currentLookups?.byIndex.get(edge.target)?.label}
          </Button>
        ))}
        <Pages page={page} size={10} count={edges.length} onChange={setPage} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function SeedEvidence({
  state,
  match,
  candidate,
}: {
  state: WorkbenchState;
  match: DiscoveryMatch;
  candidate: number;
}) {
  const index = state.discovery.index!;
  const seed = index.documents[match.seed],
    candidateNode = index.documents[candidate];
  const [requestedPage, setPage] = useState(0);
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(match.supports.length / 5) - 1));
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-medium">
        {t("discovery.seedEvidence", {
          seed: seed.label,
          count: match.common,
          score: new Intl.NumberFormat(locale(), {
            style: "percent",
            maximumSignificantDigits: 2,
          }).format(match.score),
        })}
      </h3>
      {match.supports.slice(page * 5, (page + 1) * 5).map((support) => {
        const node = index.documents[support],
          nativeId = state.nativeBlockId(node.id);
        const [left, right] = supportingEdges(
          index,
          state.discovery.rule,
          match.seed,
          candidate,
          support,
        );
        const first =
          state.discovery.rule === "shared-targets"
            ? `${seed.label} → ${node.label}`
            : `${node.label} → ${seed.label}`;
        const second =
          state.discovery.rule === "shared-targets"
            ? `${candidateNode.label} → ${node.label}`
            : `${node.label} → ${candidateNode.label}`;
        return (
          <div key={node.id} className="flex min-w-0 flex-col gap-1">
            <Separator />
            <NativePreviewButton
              nativeId={nativeId}
              disabled={!nativeId}
              variant="ghost"
              className="h-auto justify-start whitespace-normal text-left"
              onClick={() => state.openDocument(node.id)}
            >
              <span data-native-preview-anchor>{node.label}</span>
            </NativePreviewButton>
            <EvidenceGroup label={first} edges={left} state={state} />
            <EvidenceGroup label={second} edges={right} state={state} />
          </div>
        );
      })}
      <Pages page={page} size={5} count={match.supports.length} onChange={setPage} />
      {match.supports.length < match.common && (
        <p className="text-xs text-muted-foreground">
          {t("discovery.supportLimit", { shown: match.supports.length, total: match.common })}
        </p>
      )}
    </section>
  );
}

export function DiscoveryPanel({ state }: { state: WorkbenchState }) {
  useLocale();
  const discovery = state.discovery;
  const { index, candidates, evidence } = discovery;
  const evidenceAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (discovery.candidate !== undefined)
      evidenceAnchor.current?.scrollIntoView({ block: "nearest" });
  }, [discovery.candidate]);
  const [candidatePage, setCandidatePage] = useState<{ result: typeof candidates; page: number }>({
    result: undefined,
    page: 0,
  });
  const [evidencePage, setEvidencePage] = useState<{ result: typeof evidence; page: number }>({
    result: undefined,
    page: 0,
  });
  const page = candidatePage.result === candidates ? candidatePage.page : 0;
  const detailPage = evidencePage.result === evidence ? evidencePage.page : 0;
  const formatScore = (value: number) =>
    new Intl.NumberFormat(locale(), { style: "percent", maximumSignificantDigits: 2 }).format(
      value,
    );
  const candidateNode =
    index && discovery.candidate !== undefined ? index.documents[discovery.candidate] : undefined;
  return (
    <Sheet modal={false} open={discovery.open} onOpenChange={discovery.setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={!state.data}
          aria-label={t("discovery.title")}
          title={t("discovery.title")}
        >
          <Compass />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(24rem,90vw)]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>{t("discovery.title")}</SheetTitle>
          <SheetDescription>{t("discovery.description")}</SheetDescription>
        </SheetHeader>
        <ScrollArea data-scroll-panel className="min-h-0 flex-1 px-4 pb-4">
          <div className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel id="discovery-rule-label">{t("discovery.rule")}</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="w-full"
                  aria-labelledby="discovery-rule-label"
                  value={discovery.rule}
                  onValueChange={(value) => {
                    if (value === "shared-targets" || value === "shared-sources")
                      discovery.setRule(value);
                  }}
                >
                  <ToggleGroupItem className="flex-1" value="shared-targets">
                    {t("discovery.sharedTargets")}
                  </ToggleGroupItem>
                  <ToggleGroupItem className="flex-1" value="shared-sources">
                    {t("discovery.sharedSources")}
                  </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>{t("discovery.ranking")}</FieldDescription>
              </Field>
            </FieldGroup>
            {!state.filters.references ? (
              <p>{t("discovery.enableReferences")}</p>
            ) : discovery.pending ? (
              <p className="flex items-center gap-2" role="status">
                <Spinner />
                {t("discovery.pending")}
              </p>
            ) : discovery.error ? (
              <Alert variant="destructive">
                <AlertDescription>
                  <p>{text(discovery.error)}</p>
                  <Button variant="outline" onClick={discovery.retry}>
                    {t("discovery.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : !discovery.origins.seeds.length ? (
              <p>{t("discovery.chooseSeeds")}</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {t("discovery.origins", { count: discovery.origins.seeds.length })}
                  {discovery.origins.skipped > 0 &&
                    ` ${t("discovery.skipped", { count: discovery.origins.skipped })}`}
                </p>
                {candidates && (
                  <>
                    <p className="text-sm" role="status">
                      {candidates.total
                        ? t("discovery.results", {
                            shown: candidates.candidates.length,
                            total: candidates.total,
                          })
                        : t("discovery.empty")}
                    </p>
                    <div className="flex flex-col gap-2">
                      {candidates.candidates.slice(page * 5, (page + 1) * 5).map((candidate) => {
                        const node = index!.documents[candidate.node],
                          seed = index!.documents[candidate.bestSeed];
                        return (
                          <div key={node.id} className="flex items-start gap-1">
                            <Button
                              variant={
                                discovery.candidate === candidate.node ? "secondary" : "ghost"
                              }
                              className="h-auto min-w-0 flex-1 flex-col items-start gap-1 whitespace-normal text-left"
                              aria-label={t("discovery.inspectCandidate", { name: node.label })}
                              onClick={() => discovery.choose(candidate.node)}
                            >
                              <span className="w-full truncate" title={node.label}>
                                {node.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t("discovery.candidateSummary", {
                                  seed: seed.label,
                                  count: candidate.common,
                                  score: formatScore(candidate.score),
                                })}
                              </span>
                              {candidate.matchedSeeds > 1 && (
                                <Badge variant="outline">
                                  {t("discovery.matchedSeeds", { count: candidate.matchedSeeds })}
                                </Badge>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={t("discovery.add", { name: node.label })}
                              aria-label={t("discovery.add", { name: node.label })}
                              onClick={() => state.addChosen(node.id)}
                            >
                              <Plus />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    <Pages
                      page={page}
                      size={5}
                      count={candidates.candidates.length}
                      onChange={(page) => setCandidatePage({ result: candidates, page })}
                    />
                  </>
                )}
                {candidateNode && (
                  <Card ref={evidenceAnchor}>
                    <CardHeader>
                      <CardTitle>{t("discovery.evidence")}</CardTitle>
                      <CardDescription>{candidateNode.label}</CardDescription>
                      <CardAction>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("discovery.clearHighlight")}
                          onClick={discovery.clearSpotlight}
                        >
                          <X />
                        </Button>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      {discovery.detailsPending && (
                        <p role="status" className="flex items-center gap-2">
                          <Spinner />
                          {t("discovery.pending")}
                        </p>
                      )}
                      {discovery.detailError && (
                        <Alert variant="destructive">
                          <AlertDescription>
                            <p>{text(discovery.detailError)}</p>
                            <Button variant="outline" onClick={discovery.retry}>
                              {t("discovery.retry")}
                            </Button>
                          </AlertDescription>
                        </Alert>
                      )}
                      {discovery.spotlight?.omitted && (
                        <p className="text-xs text-muted-foreground">
                          {t("discovery.limitedEvidence")}
                        </p>
                      )}
                      {evidence?.matches
                        .slice(detailPage * 5, (detailPage + 1) * 5)
                        .map((match) => (
                          <SeedEvidence
                            key={candidateNode.id + ":" + match.seed}
                            state={state}
                            match={match}
                            candidate={evidence.candidate}
                          />
                        ))}
                      {evidence && (
                        <Pages
                          page={detailPage}
                          size={5}
                          count={evidence.matches.length}
                          onChange={(page) => setEvidencePage({ result: evidence, page })}
                        />
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
