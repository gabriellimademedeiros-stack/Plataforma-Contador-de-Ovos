"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdvanceButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch("/api/demo/avancar", { method: "POST" });
          const d = await r.json().catch(() => ({}));
          setBusy(false);
          setMsg(r.ok ? d.message : (d.error ?? "Falhou."));
          router.refresh();
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <CalendarClock />} Rodar o avanço diário agora
      </Button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </span>
  );
}
