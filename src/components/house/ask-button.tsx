"use client";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askAI } from "@/components/charts/echart";

export function AskButton({ question, context, label = "Perguntar à IA", variant = "outline" }: { question: string; context?: Record<string, unknown>; label?: string; variant?: "outline" | "default" | "secondary" }) {
  return (
    <Button variant={variant} size="sm" onClick={() => askAI(question, context)}>
      <Bot /> {label}
    </Button>
  );
}
