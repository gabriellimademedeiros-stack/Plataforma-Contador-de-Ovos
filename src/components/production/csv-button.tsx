"use client";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/components/charts/csv";

export function CsvButton({ name, rows, label = "Baixar CSV" }: { name: string; rows: unknown[][]; label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        const [h, ...r] = rows;
        const blob = new Blob(["﻿" + toCsv(h as string[], r)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }}
    >
      <Download /> {label}
    </Button>
  );
}
