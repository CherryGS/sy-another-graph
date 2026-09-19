import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Spinner } from "@/shared/ui/spinner";
import { useLocale } from "../../../shared/i18n/react";
import { t, text } from "../../../shared/i18n/runtime";
import type { WorkbenchState } from "../../model/state";
import { UNREACHABLE } from "../../../modules/layout/layers";

export function LayeredLayoutNotice({ state }: { state: WorkbenchState }) {
  useLocale();
  if (state.graphSettings.layoutMode !== "layered") return null;
  const { layers, pending, error } = state.layeredLayout;
  return (
    <Alert className="rounded-none py-2" variant={error ? "destructive" : "default"}>
      <AlertDescription className="flex flex-row flex-wrap items-center gap-2" role="status">
        {pending && <Spinner />}
        <span>
          {error
            ? text(error)
            : !state.chosenIds.length
              ? t("layout.chooseSeeds")
              : pending
                ? t("layout.pending")
                : layers
                  ? t("layout.summary", {
                      max: layers.maxDistance,
                      unreachable: state.view.nodes.filter(
                        (node) => layers.distanceById.get(node.id) === UNREACHABLE,
                      ).length,
                    })
                  : t("layout.pending")}
        </span>
      </AlertDescription>
    </Alert>
  );
}
