import type { JSX, ReactNode } from "react";
import { cn } from "../lib/utils";

type PageHeaderParams = {
  breadcrumbs: ReactNode;
  title?: string;
  description?: string;
  className?: string;
  children?: ReactNode;
};

export function PageHeader({
  breadcrumbs,
  title = "",
  description = "",
  className,
  children,
}: PageHeaderParams): JSX.Element {
  const hasTitle = title !== "";
  const hasDescription = description !== "";
  const hasContent = hasTitle || hasDescription || children !== null;

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="border-b border-border">{breadcrumbs}</div>

      {hasContent && (
        <div className="flex items-center justify-between gap-2 py-3 pl-3">
          <div className="flex min-w-0 flex-col gap-2">
            {hasTitle && (
              <h1 className="font-heading text-lg font-semibold tracking-wider uppercase text-foreground">
                {title}
              </h1>
            )}
            {hasDescription && (
              <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {children !== null && <div className="flex shrink-0 items-center gap-2">{children}</div>}
        </div>
      )}
    </div>
  );
}
