"use client";
/** Formulários do laboratório: nova amostra de casca, novo teste de shelf life, medição do dia e limite de Haugh. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

async function post(url: string, body: unknown): Promise<string | null> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return d.error ?? "Não foi possível gravar.";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
const inp = "w-full rounded-md border px-2 py-1.5 text-sm";

export function NewShellSample({ houses, today, defaultHouse }: { houses: string[]; today: string; defaultHouse: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ house: defaultHouse, date: today, n: "30", strength: "", thickness: "", gravity: "", haugh: "", weight: "", yolk: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open)
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> Nova amostra
      </Button>
    );
  return (
    <form
      className="w-full space-y-2 rounded-lg border bg-slate-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await post("/api/laboratorio/casca", { house: f.house, date: f.date, n: Number(f.n), strength: num(f.strength), thickness: num(f.thickness), gravity: num(f.gravity), haugh: num(f.haugh), weight: num(f.weight), yolk: num(f.yolk), notes: f.notes || null });
        setBusy(false);
        if (err) setMsg({ ok: false, text: err });
        else {
          setMsg({ ok: true, text: "Amostra registrada; indicadores de laboratório atualizados." });
          setF({ ...f, strength: "", thickness: "", gravity: "", haugh: "", weight: "", yolk: "", notes: "" });
          router.refresh();
        }
      }}
    >
      <div className="text-sm font-semibold">Nova amostra de casca</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Field label="Galpão">
          <select className={inp} value={f.house} onChange={(e) => setF({ ...f, house: e.target.value })}>
            {houses.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
        <Field label="Data">
          <input className={inp} type="date" max={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        </Field>
        <Field label="Ovos (n)">
          <input className={inp} inputMode="numeric" value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} required />
        </Field>
        <Field label="Resistência (kgf)">
          <input className={inp} inputMode="decimal" placeholder="3,6" value={f.strength} onChange={(e) => setF({ ...f, strength: e.target.value })} />
        </Field>
        <Field label="Espessura (mm)">
          <input className={inp} inputMode="decimal" placeholder="0,38" value={f.thickness} onChange={(e) => setF({ ...f, thickness: e.target.value })} />
        </Field>
        <Field label="Gravidade específica">
          <input className={inp} inputMode="decimal" placeholder="1,080" value={f.gravity} onChange={(e) => setF({ ...f, gravity: e.target.value })} />
        </Field>
        <Field label="Unidade Haugh">
          <input className={inp} inputMode="decimal" placeholder="82" value={f.haugh} onChange={(e) => setF({ ...f, haugh: e.target.value })} />
        </Field>
        <Field label="Peso (g)">
          <input className={inp} inputMode="decimal" placeholder="62,5" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
        </Field>
        <Field label="Cor da gema">
          <input className={inp} inputMode="decimal" placeholder="7" value={f.yolk} onChange={(e) => setF({ ...f, yolk: e.target.value })} />
        </Field>
        <Field label="Observação">
          <input className={inp} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Registrar amostra
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Fechar
        </Button>
        {msg && <span className={msg.ok ? "text-xs text-emerald-700" : "text-xs text-red-700"}>{msg.text}</span>}
      </div>
    </form>
  );
}

export function NewShelfTest({ houses, today }: { houses: string[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ house: houses[0], start: today, temp: "25", rh: "60" });
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Novo teste
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-lg border bg-slate-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post("/api/laboratorio/shelf-life", { house: f.house, start: f.start, temp: Number(f.temp.replace(",", ".")), rh: num(f.rh) });
        if (r) setErr(r);
        else {
          setOpen(false);
          router.refresh();
        }
      }}
    >
      <Field label="Galpão">
        <select className={inp} value={f.house} onChange={(e) => setF({ ...f, house: e.target.value })}>
          {houses.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
      </Field>
      <Field label="Início">
        <input className={inp} type="date" max={today} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
      </Field>
      <Field label="Temperatura (°C)">
        <input className={inp} inputMode="decimal" value={f.temp} onChange={(e) => setF({ ...f, temp: e.target.value })} />
      </Field>
      <Field label="Umidade (%)">
        <input className={inp} inputMode="decimal" value={f.rh} onChange={(e) => setF({ ...f, rh: e.target.value })} />
      </Field>
      <Button size="sm" type="submit">
        Criar teste (medições nos dias 0, 7, 14, 21 e 28)
      </Button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </form>
  );
}

export function ShelfMeasurementForm({ testId, days }: { testId: string; days: number[] }) {
  const router = useRouter();
  const [f, setF] = useState({ day: String(days[0] ?? 0), n: "12", haugh: "", weightLoss: "", airCell: "" });
  const [err, setErr] = useState<string | null>(null);
  if (!days.length) return null;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post(`/api/laboratorio/shelf-life/${testId}/medicao`, { day: Number(f.day), n: Number(f.n), haugh: Number(f.haugh.replace(",", ".")), weightLoss: num(f.weightLoss), airCell: num(f.airCell) });
        if (r) setErr(r);
        else {
          setErr(null);
          router.refresh();
        }
      }}
    >
      <Field label="Dia">
        <select className={inp} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>
          {days.map((d) => (
            <option key={d} value={d}>
              dia {d}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ovos (n)">
        <input className={`${inp} w-20`} value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} />
      </Field>
      <Field label="Haugh média">
        <input className={`${inp} w-24`} required inputMode="decimal" value={f.haugh} onChange={(e) => setF({ ...f, haugh: e.target.value })} />
      </Field>
      <Field label="Perda de peso (%)">
        <input className={`${inp} w-24`} inputMode="decimal" value={f.weightLoss} onChange={(e) => setF({ ...f, weightLoss: e.target.value })} />
      </Field>
      <Field label="Câmara de ar (mm)">
        <input className={`${inp} w-24`} inputMode="decimal" value={f.airCell} onChange={(e) => setF({ ...f, airCell: e.target.value })} />
      </Field>
      <Button size="sm" type="submit">
        Registrar medição
      </Button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </form>
  );
}

export function HaughLimitForm({ value }: { value: number }) {
  const router = useRouter();
  const [v, setV] = useState(String(value));
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex items-center gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post("/api/laboratorio/limite", { haughLimit: Number(v.replace(",", ".")) });
        if (!r) {
          setSaved(true);
          router.refresh();
        }
      }}
    >
      <span>Limite de vida útil:</span>
      <input aria-label="Limite de Haugh" className="w-16 rounded border px-2 py-1" value={v} onChange={(e) => { setV(e.target.value); setSaved(false); }} />
      <span>UH</span>
      <Button size="sm" variant="outline" type="submit">
        Salvar
      </Button>
      {saved && <span className="text-xs text-emerald-700">salvo</span>}
    </form>
  );
}
