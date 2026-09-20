import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./popover";

export function FieldHelp({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label}>
          <CircleHelp />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-4">
        <PopoverTitle>{label}</PopoverTitle>
        {children}
      </PopoverContent>
    </Popover>
  );
}
