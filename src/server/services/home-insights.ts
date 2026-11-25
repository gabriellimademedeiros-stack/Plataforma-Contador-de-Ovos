import "server-only";
import type { Scope } from "@/server/permissions";

/** Briefing, ranking e previsão da Início. Preenchidos nos marcos M7 (briefing) e M9 (ranking e previsão). */
export async function getHomeBriefing(_scope: Scope): Promise<{ lines: string[] }> {
  return { lines: [] };
}
export async function getHomeRanking(_scope: Scope): Promise<{ weekLabel: string | null; items: Array<{ house: string; position: number; score: number; phase: string }> }> {
  return { weekLabel: null, items: [] };
}
export async function getHomeForecast(_scope: Scope): Promise<{ weeks: Array<{ weekStart: string; label: string; boxes: number; boxesLow: number; boxesHigh: number }> }> {
  return { weeks: [] };
}
