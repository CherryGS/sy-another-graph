import { Copy } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { useLocale } from "../../shared/i18n/react";
import { t } from "../../shared/i18n/runtime";
import type { CanvasContextTarget } from "../presentation/types";

/** A controlled menu can close immediately when its renderer snapshot changes. */
export function GraphContextMenu({
  target,
  onClose,
}: {
  target: CanvasContextTarget | null;
  onClose: () => void;
}) {
  useLocale();
  const copyId = async () => {
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.id);
      toast.success(t("graph.nodeIdCopied"));
    } catch {
      toast.error(t("graph.nodeIdCopyFailed"));
    }
  };
  return (
    <DropdownMenu open={!!target} modal={false} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: target?.x ?? 0, top: target?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        aria-label={t("graph.nodeContextMenu")}
        className="w-56 max-w-[calc(100vw-1rem)]"
        side="right"
        align="start"
        sideOffset={0}
        collisionPadding={8}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate" title={target?.label || target?.id}>
            {target?.label || target?.id}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void copyId()}>
            <Copy />
            {t("graph.copyNodeId")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
