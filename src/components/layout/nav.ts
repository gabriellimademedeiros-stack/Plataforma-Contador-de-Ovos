import type { Role } from "@/server/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles?: Role[];
  badge?: "alerts";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: "House" },
  { href: "/granja", label: "Granja", icon: "Warehouse" },
  { href: "/producao", label: "Produção", icon: "Egg" },
  { href: "/qualidade", label: "Qualidade do ovo", icon: "ShieldCheck" },
  { href: "/laboratorio", label: "Laboratório", icon: "FlaskConical" },
  { href: "/sanidade", label: "Sanidade", icon: "HeartPulse" },
  { href: "/nutricao", label: "Nutrição", icon: "Wheat" },
  { href: "/ambiencia", label: "Ambiência", icon: "Thermometer" },
  { href: "/financeiro", label: "Financeiro", icon: "CircleDollarSign", roles: ["diretor", "gerente"] },
  { href: "/eventos", label: "Eventos", icon: "CalendarClock" },
  { href: "/alertas", label: "Alertas", icon: "BellRing", badge: "alerts" },
  { href: "/comparativos", label: "Comparativos", icon: "GitCompareArrows" },
  { href: "/relatorios", label: "Relatórios", icon: "FileText" },
  { href: "/assistente", label: "Assistente", icon: "Bot" },
  { href: "/dispositivos", label: "Dispositivos", icon: "Cpu" },
  { href: "/configuracoes", label: "Configurações", icon: "Settings" },
  { href: "/campo", label: "Campo", icon: "Smartphone" },
  { href: "/demo", label: "Demonstração", icon: "CirclePlay", roles: ["diretor"] },
];
