"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AckButton({ id }: { id: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  return done ? (
    <span className="text-sm font-medium text-green-700">Registrado ✓</span>
  ) : (
    <Button
      size="lg"
      onClick={async () => {
        const r = await fetch(`/api/alertas/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reconhecer" }) });
        if (r.ok) {
          setDone(true);
          router.refresh();
        }
      }}
    >
      Estou verificando
    </Button>
  );
}
