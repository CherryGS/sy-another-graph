import { useId, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";

export function FilterSection({
  title,
  summary,
  notice,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  notice?: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <h3>
        <CollapsibleTrigger asChild>
          <Button
            id={id}
            variant="ghost"
            className="group h-auto w-full justify-start gap-3 px-4 py-3 text-left"
            aria-label={title}
            aria-describedby={`${id}-summary${notice ? ` ${id}-notice` : ""}`}
          >
            <Icon data-icon="inline-start" />
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span>{title}</span>
              <span
                id={`${id}-summary`}
                className="max-w-full truncate text-xs font-normal text-muted-foreground"
                title={summary}
              >
                {summary}
              </span>
            </span>
            {notice && (
              <Badge id={`${id}-notice`} variant="secondary">
                {notice}
              </Badge>
            )}
            <ChevronDown
              data-icon="inline-end"
              className="transition-transform group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
      </h3>
      {/* Keep form drafts and validation alive when the user folds a section. */}
      <CollapsibleContent
        forceMount
        hidden={!open}
        role="group"
        aria-labelledby={id}
        className="px-4 pb-4"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
