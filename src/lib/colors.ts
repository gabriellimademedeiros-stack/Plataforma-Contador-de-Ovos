/** Cores fixas (Parte 4.9). */
export const STATUS_COLORS = {
  verde: "#16a34a",
  amarelo: "#d97706",
  vermelho: "#dc2626",
  cinza: "#6b7280",
} as const;

export type StatusColor = keyof typeof STATUS_COLORS;

export const HOUSE_COLORS: Record<string, string> = {
  P001: "#2563eb",
  P002: "#7c3aed",
  P003: "#0891b2",
  P004: "#db2777",
  P005: "#ea580c",
  P006: "#65a30d",
  P007: "#4b5563",
  P008: "#0d9488",
};

export function houseColor(code: string): string {
  return HOUSE_COLORS[code] ?? "#334155";
}

export const EVENT_CATEGORY_COLORS: Record<string, string> = {
  sanitario: "#dc2626",
  manejo: "#2563eb",
  ambiente: "#d97706",
  estrutura: "#6b7280",
  detectado: "#7c3aed",
  outro: "#334155",
};

export const STRAIN_LINE_COLOR = "#374151"; // tracejada cinza-escura
export const INTERNAL_BAND_COLOR = "rgba(156,163,175,0.25)";
export const INTERNAL_MEDIAN_COLOR = "#9ca3af";
export const TARGET_LINE_COLOR = "#16a34a";

export const SEVERITY_COLORS: Record<string, string> = {
  critica: "#991b1b",
  alta: "#dc2626",
  media: "#d97706",
  baixa: "#2563eb",
  aviso: "#7c3aed",
};

export const CLASS_COLORS: Record<string, string> = {
  clean: "#16a34a",
  dirty_feces: "#92400e",
  dirty_blood: "#b91c1c",
  cracked: "#d97706",
  broken: "#4b5563",
  undetermined: "#9ca3af",
};
