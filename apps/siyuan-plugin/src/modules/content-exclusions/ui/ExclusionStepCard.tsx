import { useId, useState } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import type { GraphDataset } from "../../../core/graph/types";
import type { Message } from "../../../core/diagnostics/message";
import { t, text } from "../../../shared/i18n/runtime";
import { Button } from "../../../shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../shared/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../shared/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../../shared/ui/field";
import { Switch } from "../../../shared/ui/switch";
import { Textarea } from "../../../shared/ui/textarea";
import { Separator } from "../../../shared/ui/separator";
import type { usePrioritySorting } from "../../../shared/hooks/use-priority-sorting";
import type { ExclusionImpact } from "../pipeline";
import type { ExclusionPipeline, ExclusionStep } from "../pipeline-model";
import { ContentExclusionPreview } from "./ContentExclusionPreview";

const stepTitle = (kind: ExclusionStep) =>
  t(
    kind === "empty"
      ? "contentExclusions.emptyLabel"
      : kind === "subtree"
        ? "contentExclusions.subtreeLabelShort"
        : "contentExclusions.documentLabelShort",
  );

export function ExclusionStepCard({
  kind,
  index,
  pipeline,
  onPipelineChange,
  move,
  sortHandle,
  drop,
  draft,
  error,
  onDraft,
  data,
  impact,
  pending,
  valid,
  onOpen,
  onLocate,
  canLocate,
}: {
  kind: ExclusionStep;
  index: number;
  pipeline: ExclusionPipeline;
  onPipelineChange: (value: ExclusionPipeline) => void;
  move: (id: string, destination: number) => void;
  sortHandle: ReturnType<typeof usePrioritySorting>["handle"];
  drop: { after: boolean } | null;
  draft: string;
  error: Message | null;
  onDraft: (value: string) => void;
  data: GraphDataset | null;
  impact?: ExclusionImpact;
  pending: boolean;
  valid: boolean;
  onOpen: (id: string) => void;
  onLocate: (id: string) => void;
  canLocate: (id: string) => boolean;
}) {
  const id = useId(),
    [open, setOpen] = useState(false);
  const title = stepTitle(kind),
    enabled = pipeline.enabled[kind];
  return (
    <>
      {drop && !drop.after && <Separator />}
      <Collapsible open={open} onOpenChange={setOpen} asChild>
        <Card size="sm" role="listitem" aria-label={title} data-priority-item={kind}>
          <CardHeader>
            <CardTitle className="flex min-w-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                className="touch-none cursor-grab shrink-0"
                aria-label={t("contentExclusions.reorder", { name: title })}
                title={t("contentExclusions.reorderHint")}
                data-priority-id={kind}
                {...sortHandle}
                onKeyDown={(event) => {
                  sortHandle.onKeyDown(event);
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    move(kind, index + (event.key === "ArrowUp" ? -1 : 1));
                  }
                }}
              >
                <GripVertical />
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start px-1">
                  <span className="truncate">{title}</span>
                  <ChevronDown data-icon="inline-end" />
                </Button>
              </CollapsibleTrigger>
              <Switch
                checked={enabled}
                aria-label={t("contentExclusions.enable", { name: title })}
                onCheckedChange={(value) =>
                  onPipelineChange({ ...pipeline, enabled: { ...pipeline.enabled, [kind]: value } })
                }
              />
            </CardTitle>
            <CardDescription
              className="flex flex-wrap items-center justify-between gap-1"
              aria-live="polite"
            >
              <span>
                {!enabled
                  ? t("grouping.disabled")
                  : pending
                    ? t("contentExclusions.previewPending")
                    : valid
                      ? t("contentExclusions.stepCount", { count: impact?.removedIds.length ?? 0 })
                      : t("contentExclusions.unavailable")}
              </span>
              <ContentExclusionPreview
                data={data}
                impact={valid ? impact : undefined}
                pending={pending}
                title={title}
                onOpen={onOpen}
                onLocate={onLocate}
                canLocate={canLocate}
              />
            </CardDescription>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <FieldGroup className="gap-3 [container-type:normal]">
                {kind === "empty" ? (
                  <>
                    <Field orientation="horizontal">
                      <Switch
                        id={id}
                        checked={pipeline.preserveConnections}
                        onCheckedChange={(preserveConnections) =>
                          onPipelineChange({ ...pipeline, preserveConnections })
                        }
                      />
                      <FieldLabel htmlFor={id}>
                        {t("contentExclusions.preserveConnections")}
                      </FieldLabel>
                    </Field>
                    <FieldDescription>{t("contentExclusions.emptyDescription")}</FieldDescription>
                  </>
                ) : (
                  <Field data-invalid={!!error}>
                    <FieldLabel htmlFor={id} className="sr-only">
                      {title}
                    </FieldLabel>
                    <FieldDescription>
                      {t(
                        kind === "document"
                          ? "contentExclusions.documentHint"
                          : "contentExclusions.subtreeHint",
                      )}
                    </FieldDescription>
                    <Textarea
                      id={id}
                      value={draft}
                      rows={4}
                      className="min-h-24 max-h-80"
                      aria-invalid={!!error}
                      onChange={(event) => onDraft(event.target.value)}
                      placeholder={t(
                        kind === "document"
                          ? "contentExclusions.documentPlaceholder"
                          : "contentExclusions.subtreePlaceholder",
                      )}
                    />
                    {error && <FieldError>{text(error)}</FieldError>}
                  </Field>
                )}
              </FieldGroup>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      {drop?.after && <Separator />}
    </>
  );
}
