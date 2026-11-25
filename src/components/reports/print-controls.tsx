"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Baixar PDF" (Parte 15.3): abre a impressão do navegador quando todos os gráficos sinalizarem que terminaram
 * de desenhar (evento ovos:chart-rendered), com a dica de escolher "Salvar como PDF".
 */
export function PrintControls({ charts, back, auto }: { charts: number; back: string; auto?: boolean }) {
  const [rendered, setRendered] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const want = useRef(false);
  const ready = rendered >= charts;
  useEffect(() => {
    const on = () => setRendered((n) => n + 1);
    window.addEventListener("ovos:chart-rendered", on);
    const t = setTimeout(() => setRendered((n) => Math.max(n, charts)), 10000);
    return () => {
      window.removeEventListener("ovos:chart-rendered", on);
      clearTimeout(t);
    };
  }, [charts]);
  useEffect(() => {
    if (ready && (want.current || auto)) {
      want.current = false;
      setTimeout(() => {
        setWaiting(false);
        window.print();
      }, 300);
    }
  }, [ready, auto]);
  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-white px-4 py-2 shadow-sm">
      <Button asChild size="sm" variant="ghost">
        <Link href={back}>
          <ArrowLeft /> Voltar
        </Link>
      </Button>
      <Button
        size="sm"
        onClick={() => {
          if (ready) window.print();
          else {
            want.current = true;
            setWaiting(true);
          }
        }}
      >
        {waiting ? <Loader2 className="animate-spin" /> : <Printer />} Baixar PDF
      </Button>
      <span className="text-xs text-slate-600">
        Na janela de impressão, escolha <b>“Salvar como PDF”</b>, papel A4 e orientação paisagem.{" "}
        {!ready && (
          <span className="text-amber-700">
            Desenhando gráficos… {Math.min(rendered, charts)} de {charts}
          </span>
        )}
      </span>
    </div>
  );
}
