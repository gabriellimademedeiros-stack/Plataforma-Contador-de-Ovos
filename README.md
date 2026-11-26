# Plataforma Contador de Ovos — versão beta

> **Dados simulados.** Tudo o que aparece na beta — granja, galpões, lotes, números, preços, custos, alertas — é fictício e gerado por um simulador determinístico. A faixa amarela "Dados simulados" aparece em todas as telas e no rodapé dos relatórios.

## 1. O que é a beta (e o que ela não é)

**É** uma demonstração navegável, de ponta a ponta, do produto que transforma a contagem de ovos por câmera em decisões para a granja:

- painel diário com indicadores, metas e briefing;
- ficha de cada galpão com gráficos sincronizados (temperatura, ração, água, postura), curva por idade e padrão interno;
- eventos com **retrato de impacto** (antes × depois, galpões de controle, perda em ovos e R$);
- **alertas** automáticos com hipóteses de causa, decomposição do desvio e casos parecidos do histórico;
- financeiro estimado (margem por galpão, simulador de preços, decisão de descarte), previsão de produção e rankings;
- **assistente** que responde perguntas usando os números da plataforma (com IA ou em modo de demonstração sem IA);
- Relatório Semanal (11 páginas) e Comparativo (9 páginas) para imprimir em A4, modo reunião com registro de decisões;
- app de campo para celular, painel de demonstração ao vivo e simulador do contador enviando mensagens em tempo real.

**Não é** um sistema em produção: não há integração com contadores reais, não há cadastro de clientes, os parâmetros biológicos e financeiros são de demonstração e a base de hipóteses precisa de revisão veterinária antes de qualquer uso real. Notificações por WhatsApp, SMS e e-mail ficam fora da beta.

## 2. Link e contas de demonstração

- **Link:** <https://plataforma-contador-de-ovos.vercel.app> · diagnóstico do banco: <https://plataforma-contador-de-ovos.vercel.app/api/saude>. Localmente: <http://localhost:3000>.
- **Senha única das três contas:** a variável `DEMO_PASSWORD` (informada em mãos; não fica no repositório).

| Conta | Perfil | O que vê |
| --- | --- | --- |
| `diretor@demo.local` | Diretoria | Tudo, inclusive o painel de demonstração e a lista de usuários |
| `gerente@demo.local` | Gerência | Todos os galpões e o financeiro; configura metas, regras e memória (sem usuários) |
| `encarregado@demo.local` | Encarregado | Só P001 a P004, sem nada financeiro; registra dados de campo, reconhece alertas e responde perguntas |

## 3. Tour de 5 minutos

1. Entre como **diretor**. A tela **Início** mostra os números de ontem, o mapa de calor galpão × indicador, os alertas abertos, o aviso preventivo de calor e o briefing do dia.
2. Clique no **P005** no mapa de calor: o painel sincronizado mostra a onda de calor (faixa laranja) — temperatura subindo, ração caindo, água subindo e postura caindo 1 a 2 dias depois.
3. Em **Alertas**, abra "Avarias na pista 2 do P007": hipótese principal **equipamento de coleta** (confiança alta), com o caso parecido do P001 (pista 1, junho/2026).
4. Abra o **Assistente** (botão no canto inferior direito ou Ctrl+K) e clique em "Vale manter o L107 por mais 8 semanas?".
5. Em **Relatórios**, abra o Relatório Semanal da última semana e clique em **Modo reunião**.
6. Em **Demonstração**, rode "Falha de bebedouro agora": o alerta aparece em cerca de 1 segundo, com notificação no sino.

O roteiro completo de 20 minutos, com cliques e números, está em [docs/ROTEIRO_DEMO.md](docs/ROTEIRO_DEMO.md).

## 4. Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. Telas (src/app/(app))        componentes de servidor + gráficos no cliente │
│ 8. Assistente (src/assistant)   instruções, 11 ferramentas, modo reserva      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 6. API (src/app/api)            rotas finas, validação Zod, auditoria          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. Serviços (src/server/services)   orquestram repositórios + motor           │
│    (ex.: recomputeHouseDay, avanço diário, relatórios, cenários ao vivo)       │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ 3. Repositórios               │ 4. Motor (src/engine) — funções PURAS          │
│    (src/server/repositories)  │    indicadores, padrões, alertas, retratos,    │
│    leem/gravam no banco       │    causas, financeiro, previsão, rankings      │
├───────────────────────────────┴─────────────────────────────────────────────┤
│ 2. Banco (src/db)  Postgres no Supabase, schema `app`, RLS em todas as tabelas│
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Simulador (src/simulator)  3 anos de dados determinísticos (semente fixa)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Regra de ouro:** o motor nunca acessa o banco e as telas nunca calculam indicador. Percentuais agregados são sempre soma dos numeradores ÷ soma dos denominadores (nunca média de percentuais).

Tecnologias: Next.js 16 (App Router) + TypeScript estrito, Tailwind, componentes no estilo shadcn/ui, ECharts (SVG), Drizzle ORM + Postgres (Supabase, São Paulo), Vercel AI SDK com Anthropic, Vitest e Playwright. Publicação na Vercel (região `gru1`).

## 5. Como os dados são gerados

O simulador (`src/simulator`) cria uma granja fictícia — **Granja Demonstração Sertão**, 8 galpões (P001 a P008), 3 linhagens fictícias (Alfa Branca, Beta Vermelha, Gama Branca) e 24 lotes ao longo de 3 anos — com curvas de produção por idade, clima do sertão, efeito do calor, mortalidade, consumo de ração e água, contagens do contador por classe e pista, laboratório de casca, shelf life, cargas de ração e preços. Mesma semente (`SIM_SEED`) + mesma data final = **os mesmos dados**.

Sobre essa base, cenários foram plantados em datas relativas à data final D (ontem, no reset):

| # | Cenário | Galpão | Quando | Alerta esperado |
| --- | --- | --- | --- | --- |
| S1 | Onda de calor | todos (P005 sofre mais) | D−20 a D−16 | A11, A03, A09 |
| S2 | Bronquite infecciosa | P003 | início em D−45 | A08, A03 |
| S3 | Falha de bebedouro | P006 | D−9 | A08 |
| S4 | Carga de ração com cálcio baixo | P001, P002, P004 | D−21 em diante | A14 |
| S5 | Problema de esteira na pista 2 | P007 | D−6 em diante (continua) | A15 |
| S6 | Prolapso em lote jovem | P008 | D−21 a D−7 | A17 |
| S7 | Vacinação de rotina | P002 | D−25 | nenhum (evento sem impacto) |
| S8 | Anomalia sem causa registrada | P004 | D−4 em diante (continua) | A16 + pergunta ao encarregado |
| S9 | Queda de energia à noite | P002 | madrugada de D−11 | A06, A11 |
| H1, H2 | Ondas de calor históricas | todos | D−383 e D−745 | A11 |
| H3 | Bronquite confirmada | P005, lote anterior | aos 38 semanas | A08, A03 |
| H4 | Falha de bebedouro | P002 | D−200 | A08 |
| H5 | Prolapso em lote jovem | P004, lote anterior | aos 24 semanas | A17 |
| H6 | Esteira na pista 1 | P001 | D−150 a D−146 | A15 |

A tela **Demonstração → Conferência do simulador** mostra todas as séries brutas com as faixas de cada cenário e a tabela "cenário → detectado?". Todo dia às 06:05 (Fortaleza) o **avanço diário** gera o dia que fechou com os mesmos modelos — os cenários em andamento continuam (S5 e S8 até alguém resolver; S4 volta ao normal em 10 dias).

## 6. Como rodar localmente (passo a passo)

Pré-requisitos: Node.js 22 e um banco Postgres (o projeto Supabase da beta ou um Postgres local).

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha (o arquivo `.env.local` nunca vai para o Git):
   - `DATABASE_URL` (Transaction pooler, porta 6543) e `DIRECT_URL` (Session pooler, porta 5432) do Supabase;
   - `AUTH_SECRET` (texto aleatório de 32+ caracteres), `DEMO_PASSWORD`, `DEVICE_TOKEN`, `CRON_SECRET`;
   - opcional: `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL` para o assistente com IA (sem eles, funciona o modo de demonstração sem IA).
3. `npm run db:ping` — confere a conexão.
4. `npm run db:migrate` — cria as tabelas (schema `app`, com RLS).
5. `npm run demo:reset` — gera os 3 anos de dados, indicadores, alertas, hipóteses e relatórios (menos de 1 minuto).
6. `npm run dev` e abra <http://localhost:3000>.

## 7. Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run lint` · `npm run typecheck` · `npm test` | Qualidade: ESLint, TypeScript e testes (Vitest) |
| `npm run test:e2e` | Testes de ponta a ponta (Playwright) com a demonstração carregada |
| `npm run db:ping` · `db:migrate` · `db:studio` | Banco: conexão, migrações e visualizador |
| `npm run demo:reset` | Pipeline completo do zero (roda só localmente) |
| `npm run demo:simulate` · `demo:compute` · `demo:backtest` | Partes do pipeline, para inspeção |
| `npm run demo:advance-day` | Avanço diário (o mesmo do cron); `-- --ate=AAAA-MM-DD` simula outra data |
| `npm run eval:assistant` | Avaliação automática do assistente (gera `docs/AVALIACAO_ASSISTENTE.md`) |

## 8. O que é fictício

Curvas das linhagens, padrões de produção e mortalidade, clima, preços do ovo e da ração, custos (mão de obra, energia, sanidade, embalagem, amortização da franga, depreciação), a nota de confiança e a temperatura dos contadores, os resultados de laboratório e shelf life, a base de hipóteses de causa (precisa de revisão veterinária) e os nomes da granja e dos usuários.

## 9. Limitações conhecidas

- **S4 (cálcio baixo):** a hipótese nutricional aparece em 2º lugar (confiança média), atrás do estresse térmico, porque a carga coincide com a onda de calor nas datas da especificação. Há três caminhos registrados em `docs/DECISOES.md` para decidir.
- **Assistente com IA:** pronto e testado com um modelo simulado; a avaliação das 30 perguntas com IA (meta 27 de 30) roda assim que a chave da Anthropic for configurada. O modo sem IA acerta 12 de 12.
- **Tempo real:** a regra A02 (esteira sem fluxo) só é avaliada entre 06h e 16h; a A08h precisa de 3 horas de dados do dia.
- **Recálculo pela ingestão:** limitado a uma vez a cada 30 s por galpão em cada instância do servidor.
- O repositório se chama `plataforma-contador-de-ovos` (a especificação citava `plataforma-ovos-beta`).

## 10. Publicação e custos da beta

- **Supabase** (plano gratuito; o projeto publicado ficou em `us-east-2`, Ohio): banco Postgres. O app usa o Session pooler (`DIRECT_URL`). Projetos gratuitos podem **pausar após dias sem acesso**; o cron diário mantém o banco ativo. Se pausar, entre no painel do Supabase, abra o projeto e clique em **Restore/Resume**; depois rode `npm run demo:advance-day` ou aguarde o cron.
- **Vercel** (plano gratuito/Hobby, funções na região `cle1`, ao lado do banco): hospeda as telas e as APIs; cron diário `5 9 * * *` (06:05 em Fortaleza) chamando `/api/cron/avancar-dia` com `Authorization: Bearer CRON_SECRET`. Cabeçalho `X-Robots-Tag: noindex`, metadados `noindex` e `robots.txt` bloqueando buscadores.
- **Anthropic** (opcional): o assistente consome créditos por uso; o limite diário por usuário (`ASSISTANT_DAILY_LIMIT`, padrão 60) protege o custo. Sem chave, a beta funciona no modo de demonstração sem IA.

Na Vercel, cadastre as mesmas variáveis do `.env.example` e dispare o cron uma vez em **Settings → Cron Jobs → Run** para testar. Para carregar ou recriar os dados no banco publicado, use no GitHub **Actions → Reset da demonstração (Supabase) → Run workflow** (digite RESET).

## 11. Ligação com o produto completo e próximos passos sugeridos

A beta valida a experiência e o motor de análise com dados controlados. Próximos passos sugeridos:

1. Conectar um contador real (a rota `POST /api/ingest/contador` já segue o formato de mensagem planejado) e comparar com a contagem manual.
2. Calibrar curvas, padrões e custos com dados reais de uma granja parceira; revisar a base de hipóteses com médico-veterinário.
3. Multiempresa (vários clientes), cadastro de usuários e permissões por granja.
4. Notificações por WhatsApp/e-mail e app de campo instalável (PWA) com sincronização.
5. Classificação por tamanho de ovo e integração com o comercial e o financeiro reais.

---

Documentação do projeto: [especificação](docs/SPEC_BETA.md) · [progresso](docs/PROGRESSO.md) · [decisões](docs/DECISOES.md) · [roteiro da demonstração](docs/ROTEIRO_DEMO.md) · [avaliação do assistente](docs/AVALIACAO_ASSISTENTE.md)
