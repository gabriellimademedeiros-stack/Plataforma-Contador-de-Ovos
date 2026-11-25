/** Metas padrão (Parte 8.5), editáveis em Configurações. */
import type { StatusColor } from "@/lib/colors";

export interface TargetDef {
  metricCode: string;
  label: string;
  phase: string | null;
  greenMin: number | null;
  greenMax: number | null;
  yellowMin: number | null;
  yellowMax: number | null;
}

export const DEFAULT_TARGETS: TargetDef[] = [
  { metricCode: "prod.desvio_interno", label: "Desvio de postura × padrão interno", phase: null, greenMin: -1.0, greenMax: null, yellowMin: -3.0, yellowMax: null },
  { metricCode: "mort.diaria", label: "Mortalidade semanal", phase: null, greenMin: null, greenMax: 0.1, yellowMin: null, yellowMax: 0.2 },
  { metricCode: "qual.trincados", label: "Trincados", phase: null, greenMin: null, greenMax: 2.5, yellowMin: null, yellowMax: 3.5 },
  { metricCode: "qual.quebrados", label: "Quebrados", phase: null, greenMin: null, greenMax: 0.6, yellowMin: null, yellowMax: 1.0 },
  { metricCode: "qual.sujos_fezes", label: "Sujos de fezes", phase: null, greenMin: null, greenMax: 1.8, yellowMin: null, yellowMax: 2.5 },
  { metricCode: "qual.sujos_sangue", label: "Sujos de sangue", phase: null, greenMin: null, greenMax: 0.5, yellowMin: null, yellowMax: 1.0 },
  { metricCode: "prod.aproveitamento", label: "Aproveitamento comercial", phase: null, greenMin: 95, greenMax: null, yellowMin: 93, yellowMax: null },
  { metricCode: "amb.temp_max", label: "Temperatura interna máxima", phase: null, greenMin: null, greenMax: 30, yellowMin: null, yellowMax: 32 },
  { metricCode: "fin.margem_dz", label: "Margem por dúzia", phase: null, greenMin: 0.2, greenMax: null, yellowMin: 0.0, yellowMax: null },
];

/**
 * Cor de status de um valor contra uma meta. Para "maior é melhor": verde se ≥ greenMin, amarelo se ≥ yellowMin.
 * Para "menor é melhor": verde se ≤ greenMax, amarelo se ≤ yellowMax. Sem meta ou sem valor = cinza.
 */
export function statusFor(value: number | null | undefined, t: TargetDef | undefined): StatusColor {
  if (value == null || !Number.isFinite(value) || !t) return "cinza";
  if (t.greenMin != null) {
    if (value >= t.greenMin) return "verde";
    if (t.yellowMin != null && value >= t.yellowMin) return "amarelo";
    return "vermelho";
  }
  if (t.greenMax != null) {
    if (value <= t.greenMax) return "verde";
    if (t.yellowMax != null && value <= t.yellowMax) return "amarelo";
    return "vermelho";
  }
  return "cinza";
}

export function targetFor(targets: TargetDef[], metricCode: string, phase?: string | null): TargetDef | undefined {
  return targets.find((t) => t.metricCode === metricCode && t.phase === (phase ?? null)) ?? targets.find((t) => t.metricCode === metricCode && t.phase == null);
}
