import * as React from "react";
import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("table-sticky w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b bg-muted/50", className)} {...props} />;
}
function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b transition-colors hover:bg-muted/40", className)} {...props} />;
}
function TH({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn("h-9 px-2 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground", className)}
      {...props}
    />
  );
}
function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-2 py-1.5 align-middle whitespace-nowrap", className)} {...props} />;
}
export { Table, THead, TBody, TR, TH, TD };
