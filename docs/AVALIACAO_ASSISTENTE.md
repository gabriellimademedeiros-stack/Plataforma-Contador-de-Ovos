# Avaliação automática do assistente

Gerado por `npm run eval:assistant` em 25/11/2026, 17:49:21 (horário da granja), com os dados simulados até 24/11/2026 (semente 20261125).

Como funciona: para cada pergunta do Anexo B, o script calcula a resposta esperada pelo motor e pelo banco (sem usar o texto do assistente) e confere os números citados — tolerância de ± 1 unidade na casa decimal exibida (± 0,1 para valores com uma casa decimal) — e a presença dos elementos obrigatórios (avisos, hipótese em 1º lugar, semana recomendada, cartão de confirmação etc.).

## Resumo

| Modo | Perguntas | Acertos | Meta | Situação |
| --- | --- | --- | --- | --- |
| Reserva (sem IA) | 12 | 12 | 12 de 12 | ✅ atingida |
| Com IA | — | — | 27 de 30 | não executado: falta configurar ANTHROPIC_API_KEY e ANTHROPIC_MODEL |

## Modo reserva (12 perguntas sugeridas)

| # | Pergunta | Resultado | Observações |
| --- | --- | --- | --- |
| 1 | Qual galpão teve mais trincados na última semana? | ✅ acerto | — |
| 2 | Por que a postura do P005 caiu durante a onda de calor? | ✅ acerto | — |
| 3 | O que pode estar causando os trincados do P007? | ✅ acerto | — |
| 4 | Já tivemos algo parecido com o problema do P007 antes? | ✅ acerto | — |
| 5 | Compare o P001 com o P006 nas últimas 4 semanas. | ✅ acerto | — |
| 6 | Qual linhagem está melhor em ovo por ave alojada? | ✅ acerto | — |
| 7 | Plote temperatura máxima, água e postura do P003 nos últimos 60 dias. | ✅ acerto | — |
| 8 | Quantas caixas vamos produzir nas próximas 4 semanas? | ✅ acerto | — |
| 9 | Vale manter o L107 por mais 8 semanas? | ✅ acerto | — |
| 10 | Se o preço do ovo cair 10%, quais galpões ficam no vermelho? | ✅ acerto | — |
| 11 | Quais alertas estão abertos agora? | ✅ acerto | — |
| 12 | Registra que vacinamos o P002 contra bronquite hoje de manhã. | ✅ acerto | — |

## Modo com IA (30 perguntas)

Não executado nesta rodada: a chave da Anthropic ainda não foi configurada. Assim que a chave estiver no `.env.local` (ou na Vercel), rode `npm run eval:assistant` de novo para preencher esta seção.
