import Link from "next/link";
import { cn } from "@/lib/utils";

export function TabNav({ base, tabs, active, query }: { base: string; tabs: Array<{ key: string; label: string }>; active: string; query?: string }) {
  return (
    <div className="no-print mb-4 flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${base}?aba=${t.key}${query ? `&${query}` : ""}`}
          scroll={false}
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap", active === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
