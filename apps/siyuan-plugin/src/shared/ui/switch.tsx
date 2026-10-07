"use client";

import * as React from "react";
import { cn } from "cn";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-xs border p-px transition-shadow duration-150 ease-out outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-switch-border focus-visible:ring-3 focus-visible:ring-switch-border aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-4 data-[size=sm]:w-7 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-switch-on data-checked:bg-switch-on data-unchecked:border-switch-border data-unchecked:bg-switch-off not-data-disabled:hover:data-checked:bg-switch-on-hover not-data-disabled:hover:data-unchecked:bg-switch-off-hover data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block shrink-0 rounded-[calc(var(--radius-xs)-2px)] duration-150 ease-out group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-checked:translate-x-full data-unchecked:translate-x-0 data-checked:bg-switch-thumb-on data-unchecked:bg-switch-thumb-off motion-safe:transition-[translate] motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
