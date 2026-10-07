import { useEffect, useState } from "react";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Focus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
import { t } from "../../../shared/i18n/runtime";
import type { WorkbenchState } from "../../model/state";
import { SettingSwitch } from "../appearance/SettingsPanel";

const NATIVE_ID = /^\d{14}-[a-z0-9]{7}$/;

export function ScopeFilters({ state }: { state: WorkbenchState }) {
  const { filters, setFilters, data } = state;
  const [draft, setDraft] = useState(filters.scopeId);
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Restore scope when a preset or native entry changes it.
    setDraft(filters.scopeId);
  }, [filters.scopeId]);
  const valid = !draft || NATIVE_ID.test(draft);
  const inspected = !state.inspectedEdge ? state.selected : null;
  // A synthetic node's open-source fallback is not the inspected node itself.
  // The shortcut requires the inspected node's own acquired native identity.
  const inspectedId =
    inspected && NATIVE_ID.test(inspected.id) && state.sourceLookups?.byId.has(inspected.id)
      ? inspected.id
      : null;
  const scopeNode = filters.scopeId ? state.sourceLookups?.byId.get(filters.scopeId) : null;
  return (
    <FieldGroup className="gap-4 [container-type:normal]">
      <Field>
        <FieldLabel htmlFor="notebook-filter">{t("text.notebook")}</FieldLabel>
        <Select
          items={[
            { value: "all", label: t("text.allNotebooks") },
            ...(data?.notebooks.map((book) => ({ value: book.id, label: book.name })) ?? []),
          ]}
          value={filters.notebook || "all"}
          onValueChange={(value) => {
            if (value !== null)
              setFilters((previous) => ({ ...previous, notebook: value === "all" ? "" : value }));
          }}
        >
          <SelectTrigger id="notebook-filter" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{t("text.allNotebooks")}</SelectItem>
              {data?.notebooks.map((book) => (
                <SelectItem key={book.id} value={book.id}>
                  {book.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Separator />
      <Field data-invalid={!valid}>
        <FieldLabel htmlFor="graph-scope">{t("text.initialScopeDocumentOrBlockId")}</FieldLabel>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={!inspectedId}
          title={inspectedId ? inspected?.label : undefined}
          onClick={() => {
            if (inspectedId) {
              setDraft(inspectedId);
              setFilters((previous) => ({ ...previous, scopeId: inspectedId }));
            }
          }}
        >
          <Focus data-icon="inline-start" />
          {t("scope.useInspectedNode")}
        </Button>
        <Input
          id="graph-scope"
          placeholder={t("text.leaveEmptyToViewEverything")}
          value={draft}
          aria-invalid={!valid}
          aria-describedby={`graph-scope-description${!valid ? " graph-scope-error" : ""}`}
          onChange={(event) => {
            const scopeId = event.target.value.trim();
            setDraft(scopeId);
            if (!scopeId || NATIVE_ID.test(scopeId))
              setFilters((previous) => ({ ...previous, scopeId }));
          }}
        />
        <FieldDescription id="graph-scope-description">
          {scopeNode && (
            <span className="block break-words">
              {t("scope.activeNode", { name: scopeNode.label })}
            </span>
          )}
          <span className="block">{t("scope.nativeHint")}</span>
          <span className="block">{t("text.traversalStaysWithinTheInitialScopeNodesOutside")}</span>
        </FieldDescription>
        {!valid && (
          <FieldError id="graph-scope-error">
            {t("text.enterACompleteBlockIdThePreviousScope")}
          </FieldError>
        )}
      </Field>
      <SettingSwitch
        id="include-children"
        name={t("text.includeChildDocuments")}
        checked={filters.includeChildDocuments}
        onChange={(includeChildDocuments) =>
          setFilters((previous) => ({ ...previous, includeChildDocuments }))
        }
      />
    </FieldGroup>
  );
}
