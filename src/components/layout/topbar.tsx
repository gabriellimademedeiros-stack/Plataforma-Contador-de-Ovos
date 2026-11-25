"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, User } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input, NativeSelect } from "@/components/ui/input";
import { NavList } from "./sidebar";
import { NotificationBell } from "./notification-bell";
import { PERIOD_OPTIONS } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import type { Role } from "@/server/permissions";

export function Topbar(props: { farmName: string; refDate: string; userName: string; roleLabel: string; role: Role; openAlerts: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const period = sp.get("periodo") ?? "30d";
  const axis = sp.get("eixo") ?? "data";

  const setParam = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) q.delete(k);
      else q.set(k, v);
    }
    router.push(`${pathname}${q.toString() ? `?${q}` : ""}`);
  };

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="no-print sticky top-6 z-30 flex flex-wrap items-center gap-2 border-b bg-white/95 px-3 py-2 backdrop-blur md:px-4">
      <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
        <Menu className="size-5" />
      </button>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="bg-sidebar p-0 text-white">
          <SheetTitle className="px-4 pt-4 text-white">Contador de Ovos · Beta</SheetTitle>
          <NavList role={props.role} openAlerts={props.openAlerts} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{props.farmName}</div>
        <div className="text-xs text-muted-foreground">Dados até {fmtDate(props.refDate)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label="Período"
          value={period}
          onChange={(e) => setParam({ periodo: e.target.value, ...(e.target.value !== "custom" ? { de: null, ate: null } : {}) })}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
          <option value="custom">Personalizado</option>
        </NativeSelect>
        {period === "custom" && (
          <>
            <Input type="date" aria-label="De" className="w-36" defaultValue={sp.get("de") ?? ""} onBlur={(e) => e.target.value && setParam({ de: e.target.value })} />
            <Input type="date" aria-label="Até" className="w-36" defaultValue={sp.get("ate") ?? ""} onBlur={(e) => e.target.value && setParam({ ate: e.target.value })} />
          </>
        )}
        <NativeSelect aria-label="Eixo" value={axis} onChange={(e) => setParam({ eixo: e.target.value === "data" ? null : e.target.value })}>
          <option value="data">Eixo: data</option>
          <option value="idade">Eixo: idade</option>
        </NativeSelect>
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
            <User className="size-4" />
            <span className="hidden max-w-40 truncate sm:inline">{props.userName}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {props.userName}
              <div className="text-xs font-normal text-muted-foreground">Perfil: {props.roleLabel}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/configuracoes">Configurações</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout}>
              <LogOut className="size-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
