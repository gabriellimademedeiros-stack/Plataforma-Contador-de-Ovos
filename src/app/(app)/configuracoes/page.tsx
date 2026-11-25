import { BellOff, Lock, ShieldAlert } from "lucide-react";
import { getSql } from "@/db/client";
import { PageHeader, Section } from "@/components/layout/page-header";
import { TabNav } from "@/components/house/tab-nav";
import { CostRow, MemoryEditor, RuleEditor, TargetRow } from "@/components/settings/editors";
import { getScope } from "@/server/services/context";
import { listRules, listTargetsRaw } from "@/server/services/settings";
import { getHouses } from "@/server/repositories/reference";
import { KNOWLEDGE_BASE } from "@/engine/causes/knowledge-base";
import { METRIC_BY_CODE } from "@/engine/metrics/catalog";
import { ROLE_LABEL } from "@/server/permissions";

export const metadata = { title: "Configurações" };

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba = "metas" } = await searchParams;
  const scope = await getScope();
  if (!scope.canConfigure)
    return (
      <div className="space-y-4">
        <PageHeader title="Configurações" />
        <div className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm">
          <Lock className="size-4" /> Seu perfil não acessa as configurações (metas, regras e memória da empresa ficam com a diretoria e a gerência).
        </div>
      </div>
    );
  const tabs = [
    { key: "metas", label: "Metas" },
    { key: "regras", label: "Regras de alerta" },
    { key: "conhecimento", label: "Base de conhecimento" },
    { key: "memoria", label: "Memória da empresa" },
    { key: "custos", label: "Parâmetros de custo" },
    ...(scope.canSeeUsers ? [{ key: "usuarios", label: "Usuários" }] : []),
    { key: "notificacoes", label: "Notificações" },
  ];
  const active = tabs.some((t) => t.key === aba) ? aba : "metas";
  const sql = getSql();
  return (
    <div className="space-y-4">
      <PageHeader title="Configurações" description="Toda alteração fica registrada no histórico de auditoria, com o valor antes e depois." />
      <TabNav base="/configuracoes" tabs={tabs} active={active} />
      {active === "metas" && (
        <Section title="Metas" description="Faixas verde e amarela de cada indicador (Parte 8.5). Valem para os cartões, mapas de calor e relatórios.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-1">Indicador</th>
                <th>Direção</th>
                <th>Fase</th>
                <th>Verde</th>
                <th>Amarelo</th>
                <th>Unidade</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(await listTargetsRaw()).map((t) => (
                <TargetRow
                  key={t.id}
                  canEdit={scope.canConfigure}
                  t={{ id: t.id, label: METRIC_BY_CODE[t.metric_code]?.name ?? t.metric_code, unit: METRIC_BY_CODE[t.metric_code]?.unit ?? "", phase: t.phase, greenMin: t.green_min == null ? null : Number(t.green_min), greenMax: t.green_max == null ? null : Number(t.green_max), yellowMin: t.yellow_min == null ? null : Number(t.yellow_min), yellowMax: t.yellow_max == null ? null : Number(t.yellow_max) }}
                />
              ))}
            </tbody>
          </table>
        </Section>
      )}
      {active === "regras" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Ajuste os parâmetros e use a prévia para ver quantas vezes a regra teria disparado nos últimos 90 dias, antes de salvar. Parâmetros alterados aparecem com borda amarela; o padrão da especificação aparece embaixo de cada campo.</p>
          {(await listRules()).map((r) => (
            <RuleEditor key={r.code} r={r} canEdit={scope.canConfigure} />
          ))}
        </div>
      )}
      {active === "conhecimento" && (
        <Section title="Base de conhecimento (somente leitura)" description="Hipóteses que o motor de causas considera, com o que verificar.">
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" /> Base de demonstração: precisa de revisão por médico-veterinário antes de qualquer uso real. A plataforma levanta hipóteses, nunca diagnósticos, e não indica medicamentos.
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {KNOWLEDGE_BASE.map((h) => (
              <div key={h.code} className="rounded-lg border p-2 text-sm">
                <div className="font-semibold">{h.name}</div>
                <div className="text-xs text-slate-500">Vale para: {h.appliesTo.join(", ").replace(/_/g, " ")}</div>
                <div className="mt-1 text-xs">
                  <b>A favor:</b> {Object.entries(h.favor).map(([k, v]) => `${k.toLowerCase().replace(/_/g, " ")} (+${v})`).join(", ") || "—"}
                </div>
                <div className="text-xs">
                  <b>Contra:</b> {Object.entries(h.against).map(([k, v]) => `${k.toLowerCase().replace(/_/g, " ")} (−${v})`).join(", ") || "—"}
                </div>
                <div className="text-xs">
                  <b>Verificar:</b> {h.checks.join("; ")}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
      {active === "memoria" && (
        <Section title="Memória da empresa" description="Fatos da granja que o assistente leva em conta nas respostas (ex.: particularidades de um galpão). Itens desativados deixam de ser usados.">
          <MemoryEditor
            canEdit={scope.canConfigure}
            items={(await sql`select m.id, m.text, m.active, m.created_at, u.name from app.company_memory m left join app.users u on u.id = m.created_by order by m.created_at desc`).map((m) => ({ id: m.id, text: m.text, active: m.active, createdAt: new Date(m.created_at).toISOString(), author: m.name ?? null }))}
          />
        </Section>
      )}
      {active === "custos" && (
        <Section title="Parâmetros de custo" description="Usados no financeiro estimado (margem, custo por dúzia, postura de equilíbrio e decisão de descarte). Valores fictícios da beta.">
          <table className="w-full text-sm">
            <tbody>
              {(await sql`select key, value, unit, label_pt from app.cost_params order by key`).map((c) => (
                <CostRow key={c.key} canEdit={scope.canConfigure} c={{ key: c.key, label: c.label_pt ?? c.key, value: Number(c.value), unit: c.unit ?? "" }} />
              ))}
            </tbody>
          </table>
        </Section>
      )}
      {active === "usuarios" && scope.canSeeUsers && (
        <Section title="Usuários (somente leitura)" description="Contas de demonstração. Na beta, usuários não são criados pela tela.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-1">Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Galpões</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {await (async () => {
                const houses = await getHouses();
                const code = new Map(houses.map((h) => [h.id, h.code]));
                return (await sql`select name, email, role, allowed_house_ids, active from app.users order by role`).map((u) => (
                  <tr key={u.email} className="border-b">
                    <td className="py-1.5">{u.name}</td>
                    <td>{u.email}</td>
                    <td>{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</td>
                    <td>{u.allowed_house_ids ? (u.allowed_house_ids as string[]).map((id) => code.get(id)).join(", ") : "todos"}</td>
                    <td>{u.active ? "ativo" : "inativo"}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </Section>
      )}
      {active === "notificacoes" && (
        <Section title="Notificações" description="Na beta, as notificações aparecem no sino da plataforma.">
          <div className="grid gap-2 md:grid-cols-3">
            {["WhatsApp", "SMS", "E-mail"].map((c) => (
              <div key={c} className="flex items-center justify-between rounded-lg border bg-slate-50 p-3 text-sm text-slate-500">
                <span className="flex items-center gap-2">
                  <BellOff className="size-4" /> {c}
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded bg-slate-200 px-1.5 text-[11px] font-medium text-slate-700">fora da beta</span>
                  <input type="checkbox" disabled aria-label={`${c} (fora da beta)`} />
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
