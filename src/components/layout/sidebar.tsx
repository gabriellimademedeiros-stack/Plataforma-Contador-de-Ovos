"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";
import type { Role } from "@/server/permissions";

function NavIcon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Circle;
  return <C className={className} />;
}

export function NavList({ role, openAlerts, collapsed, onNavigate }: { role: Role; openAlerts: number; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(role)).map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-white/15 font-medium text-white" : "text-slate-300 hover:bg-white/10 hover:text-white",
              collapsed && "justify-center px-2",
            )}
          >
            <NavIcon name={item.icon} className="size-4 shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
            {!collapsed && item.badge === "alerts" && openAlerts > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">{openAlerts}</span>
            )}
            {collapsed && item.badge === "alerts" && openAlerts > 0 && <span className="absolute ml-5 -mt-4 size-2 rounded-full bg-red-500" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ role, openAlerts }: { role: Role; openAlerts: number }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem("ovos:sidebar") === "1");
    } catch {}
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("ovos:sidebar", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };
  return (
    <aside className={cn("no-print sticky top-6 hidden h-[calc(100vh-1.5rem)] shrink-0 flex-col overflow-y-auto bg-sidebar lg:flex", collapsed ? "w-16" : "w-60")}>
      <div className={cn("flex items-center gap-2 px-4 py-4 text-white", collapsed && "justify-center px-2")}>
        {!collapsed && (
          <Link href="/" className="font-semibold leading-tight">
            Contador de Ovos
            <span className="block text-xs font-normal text-slate-400">Beta · dados simulados</span>
          </Link>
        )}
        <button onClick={toggle} className="ml-auto rounded p-1 text-slate-300 hover:bg-white/10" aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
      <NavList role={role} openAlerts={openAlerts} collapsed={collapsed} />
    </aside>
  );
}
