# Decisões técnicas fora da especificação

Cada decisão tem data, o que foi decidido e o motivo. A especificação (`docs/SPEC_BETA.md`) continua sendo a fonte da verdade; aqui ficam só as escolhas que ela não define ou as adaptações necessárias.

| Data | Decisão | Motivo |
| --- | --- | --- |
| 25/11/2026 | Repositório usado: `gabriellimademedeiros-stack/plataforma-contador-de-ovos` (ramo `claude/hopeful-archimedes-lkt3lt`), e não `plataforma-ovos-beta`. | É o repositório indicado pelo Gabriel nesta sessão e o único ao qual o ambiente tem acesso. O nome do pacote no `package.json` segue `plataforma-ovos-beta`. |
| 25/11/2026 | Trabalho contínuo do M0 ao M13 sem pausa entre marcos, com commit, push e atualização do PROGRESSO ao fim de cada um. | Pedido explícito do Gabriel ("construa tudo e me entregue pronto, não me pergunte nada que não precise de mim"), que substitui a pausa "pode seguir" da Parte 0.3. |
| 25/11/2026 | Next.js 16.4 com `cacheComponents: false` (modelo dinâmico clássico) e `proxy.ts` no lugar de `middleware.ts`. | Na versão 16 o `middleware` foi renomeado para `proxy`. Todas as telas dependem do cookie de sessão e de dados vivos; o modelo dinâmico é mais simples e previsível. |
| 25/11/2026 | Componentes shadcn/ui escritos à mão no padrão oficial (Radix + Tailwind + `class-variance-authority`), em `src/components/ui`. | O ambiente de desenvolvimento não alcança `ui.shadcn.com` (bloqueado pela rede); o shadcn é código copiado para o projeto, então o resultado é equivalente. |
| 25/11/2026 | Desenvolvimento e testes usam um PostgreSQL 16 local; o Supabase entra quando as strings de conexão forem fornecidas. | Permite construir e validar todos os marcos sem depender das contas. O código é o mesmo (postgres-js + Drizzle, schema `app`). |
| 25/11/2026 | `@types/node` fixado na versão 22. | O Vitest 5 exige `@types/node` 22 ou ≥ 24; o Node do ambiente é o 22. |
| 25/11/2026 | Datas de negócio representadas como texto `AAAA-MM-DD` em todo o motor e simulador. | Evita erros de fuso; a ordenação alfabética coincide com a cronológica e o motor fica puro e determinístico. |
