# Plataforma Contador de Ovos — beta

## Leia primeiro
- Especificação completa e fonte da verdade: docs/SPEC_BETA.md (não alterar).
- Situação atual: docs/PROGRESSO.md. Decisões fora da especificação: docs/DECISOES.md.
- O usuário (Gabriel) não é programador e usa o aplicativo do Claude Code, não o terminal: execute você mesmo todos os comandos e fale em português simples. Chaves coladas no chat vão só para o .env.local.
- Trabalhe um marco por vez (M0 a M13); ao terminar, rode lint, typecheck e testes, faça commit,
  atualize o PROGRESSO, mande relatório curto e espere "pode seguir".

## Stack
Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui + ECharts + Drizzle + Postgres (Supabase, schema app)
+ Vercel AI SDK (Anthropic) + Vitest. Publicação: Vercel (gru1) + Supabase (São Paulo).

## Regras invioláveis
- Dados 100% simulados e fictícios; faixa "Dados simulados" em todas as telas.
- Segredos só em .env.local; nunca no git.
- Indicadores só no src/engine (funções puras, sem banco). Telas não calculam indicador.
- Percentual agregado = soma dos numeradores / soma dos denominadores. Nunca média de percentuais.
- Assistente só cita números vindos de ferramentas; nunca prescreve medicamento; escrita só com confirmação.
- Interface em pt-BR; código, tabelas e commits em inglês.
- Determinismo: mesma SIM_SEED + mesma D_end = mesmos dados.
- Não mudar limites de regras para passar teste: ajustar o simulador e registrar em DECISOES.

## Domínio
- Fuso America/Fortaleza. Dia produtivo começa às 06:00. Semana da granja: domingo a sábado.
- Idade: semana = floor(dias de vida / 7). Fases: 17–25 início (fora de rankings), Pico 26–57, Postura 1 58–73, Postura 2 ≥ 74.
- Galpões P001–P008, lotes L101–L108 (atuais). Caixa = 360 ovos.

## Comandos
- npm run dev | lint | typecheck | test
- npm run db:migrate | db:studio | db:ping
- npm run demo:reset (pipeline completo, roda só localmente) | demo:advance-day | eval:assistant

@AGENTS.md
