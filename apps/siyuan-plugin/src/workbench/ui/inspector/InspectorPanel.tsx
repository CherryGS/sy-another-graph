import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

/** Node and relationship inspection share one overlay geometry; neither reallocates the canvas. */
export function InspectorPanel({ className, ...props }: ComponentProps<"aside">) {
  return (
    <aside
      className={cn(
        "inspector-panel absolute top-3 right-3 bottom-20 min-h-0 w-80 min-w-0 max-w-[calc(100%-1.5rem)] overflow-hidden rounded-xl shadow-inspector max-compact:w-[min(18.75rem,48%)] max-narrow:top-auto max-narrow:h-[48%] max-narrow:w-[calc(100%-1.5rem)]",
        className,
      )}
      {...props}
    />
  );
}
