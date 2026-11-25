# Progresso da beta

| Marco | Situação | Data | Observações |
| --- | --- | --- | --- |
| M0 — Preparação | concluído | 25/11/2026 | Next.js 16, Tailwind, componentes shadcn, ESLint, Prettier, Vitest; datas e formatação pt-BR com 17 testes; faixa "dados simulados"; `db:ping` conectando no PostgreSQL local (Supabase pendente das strings de conexão). |
| M1 — Banco | concluído | 25/11/2026 | Schema completo da Parte 5 (56 tabelas no schema `app`, RLS em todas), migrações Drizzle, semeadura da base: 3 usuários, 8 galpões, 3 linhagens com curvas das semanas 17 a 100, catálogo de 68 métricas, 15 regras, 16 tipos de evento, metas, custos e 16 dispositivos. |
| M2 — Simulador | concluído | 25/11/2026 | Parte 7 completa em memória (3 anos em < 1 s) e gravação no banco (reset dos passos 1 a 5 em ~3 s local): 24 lotes, 8.448 apontamentos diários, 133 mil contagens do contador, 47 mil leituras horárias, laboratório, shelf life, cargas de ração, preços e 114 eventos. Cenários S1–S9 e H1–H6 plantados e testados (19 testes do simulador, incluindo determinismo). A tela `/demo/validacao` foi construída no M5, junto com os componentes de gráfico. |
| M3 — Indicadores e padrões | pendente | | |
| M4 — Acesso e telas gerais | pendente | | |
| M5 — Ficha do galpão e telas temáticas | pendente | | |
| M6 — Eventos e retratos | pendente | | |
| M7 — Alertas | pendente | | |
| M8 — Causas | pendente | | |
| M9 — Financeiro, previsão, rankings | pendente | | |
| M10 — Assistente | pendente | | |
| M11 — Relatórios, reunião, comparativos, laboratório | pendente | | |
| M12 — Campo, demonstração, dispositivos, configurações | pendente | | |
| M13 — Publicação e acabamento | pendente | | |
