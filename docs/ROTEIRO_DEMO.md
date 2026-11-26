# Roteiro da demonstração (20 minutos)

Números e datas abaixo são da base publicada em **26/11/2026** (data final D = **25/11/2026**, semente 20261125) em <https://plataforma-contador-de-ovos.vercel.app>. Depois de um novo reset ou de dias de avanço automático, as datas andam junto (os cenários ficam sempre nas mesmas posições relativas a D: S1 em D−20, S5 em D−6 etc.) e os números mudam pouco. Antes de apresentar, confira a data em "Dados até …" no topo da tela.

Preparação (2 minutos antes):

- Abra <https://plataforma-contador-de-ovos.vercel.app> em uma janela anônima. Se quiser conferir o banco antes, abra `/api/saude` (deve mostrar `"ok": true`). Tenha em mãos a senha das contas (`DEMO_PASSWORD`).
- Em **Demonstração**, clique em **Limpar** (apaga cenários ao vivo de testes anteriores).
- Se for usar o app de campo no celular, abra `/campo/P004` no celular já logado como encarregado.

---

## 1. Início (diretor) — 2 min

1. Entre com `diretor@demo.local`.
2. Mostre os **cartões de ontem (25/11)**: 612.022 ovos (1.700 caixas), postura da granja 85,0%, avarias 2,82%, sujos 1,61%, cada um com minigráfico e cor da meta.
3. Mostre o **mapa de calor** galpão × indicador: P007 em vermelho em trincados/avarias e margem; P004 em amarelo/vermelho em sujos de fezes; P003 com postura abaixo do padrão interno.
4. Mostre os **alertas abertos**: esteira da pista 2 do P007 (S5), sujos de fezes do P004 (S8), margem negativa do P007 há 3 semanas (A22), queda lenta de postura do P008, e o **aviso preventivo de calor: 37,6 °C previsto para 27/11**.
5. Leia o **briefing do dia** (5 frases geradas a partir dos números).

## 2. Granja — 1 min

1. Menu **Granja**: os 8 galpões lado a lado.
2. Aponte P007 e P004 com alerta e o P005 com o histórico recente da onda de calor (05/11 a 09/11).

## 3. Ficha do P005 → Resumo — 3 min

1. Clique em **P005** (ou `/galpoes/P005`).
2. No painel sincronizado de 60 dias, passe o mouse sobre **05/11 a 10/11** (faixa laranja "Onda de calor"):
   - temperatura interna máxima subindo até **36,2 °C em 07/11**;
   - ração caindo (98,5 contra 109,9 g/ave/dia de base, −10%);
   - água subindo;
   - postura caindo 1 a 2 dias depois (−4,3 p.p. em 2 dias a partir de 07/11).
3. Mostre a curva por idade com a faixa do padrão interno e os lotes anteriores em cinza.

## 4. Alerta do P005 (S1) — 3 min

1. Na aba Resumo da ficha (alertas do galpão) ou em **Alertas → Resolvidos**, abra **"Postura do P005 caiu 4,3 p.p. em 2 dias"** (aberto em 08/11, resolvido em 12/11).
2. Hipóteses: **Estresse térmico (confiança alta)** em 1º e **Resfriamento insuficiente neste galpão** em 2º.
3. Evidências a favor: evento confirmado "Onda de calor" (05/11), 4 dias com 32 °C ou mais, ração −10%, 5 de 7 outros galpões com o mesmo desvio.
4. **Decomposição:** idade explica −0,4 p.p., calor explica −2,5 p.p.; sobram −1,3 p.p. sem explicação.
5. **Casos parecidos:** as ondas de calor históricas **H2 (P003, 11/11/2024)** e **H1 (P004, 06/11/2025)**.
6. Frase final: "é uma hipótese, não um diagnóstico" e o que verificar primeiro (exaustores, nebulização e placas, cortinas).

## 5. Evento da bronquite no P003 (S2) — 2 min

1. Menu **Eventos** → **"Bronquite infecciosa"** (P003, 11/10/2026, confirmado).
2. **Retrato de impacto:** água caindo antes da postura; postura −6,85 p.p. (pior valor no dia 11); trincados +1,02 p.p. e em dobro nas primeiras semanas; recuperação parcial (ainda −4 p.p.); **perda estimada de 293.744 ovos (R$ 123.989,68)**.
3. Mostre o gráfico antes × depois e os **galpões de controle** (Δ × controle).
4. Contraste: abra "Reforço contra bronquite" (P002, 31/10) — **sem impacto relevante** (S7).

## 6. Alerta do P007 (S5) — 1 min

1. **Alertas** → **"Avarias na pista 2 do P007 3,1 × a outra pista"** (desde 19/11).
2. Trincados por pista de 19/11 a 25/11: **pista 1 2,43% · pista 2 7,21%**.
3. Hipótese **Equipamento de coleta (confiança alta)** e o caso parecido **H6: P001 em 28/06/2026** (pista 1; resolvido com alinhamento da transição e troca de roletes, recuperou em 2 dias).

## 7. P004 (S8) no campo, como encarregado — 1 min

1. No celular (ou em outra janela), entre com `encarregado@demo.local` e abra **Campo → P004** (`/campo/P004`).
2. Pergunta pendente: **"Os ovos sujos de fezes aumentaram no P004. O que você observou no galpão?"**
3. Toque em **"Vazamento de bebedouro"**.
4. Volte ao diretor e abra o alerta **"Sujos de fezes do P004 em 2,31%"**: a hipótese **Vazamento de bebedouro** passa de confiança **média para alta** (recálculo em ~1,5 s).

## 8. Assistente ao vivo — 3 min

1. Botão **Assistente** (canto inferior direito) ou **Ctrl+K**.
2. Deixe os sócios fazerem 3 perguntas (com a chave da IA configurada, perguntas livres; sem a chave, use as 12 sugeridas).
3. Pergunte **"Vale manter o L107 por mais 8 semanas?"**: projeção semana a semana da margem de contribuição (de R$ 22.608 caindo para R$ 16.810 na 8ª semana), **semana recomendada 12 (14/02/2027, descarte planejado)**, premissas (ovo a R$ 5,02/dz, ração a R$ 1,98/kg) e a frase de que a amortização da franga e a depreciação não entram na decisão.
4. Abra **"Como calculei"** para mostrar as ferramentas e os períodos usados.

## 9. Relatório Semanal e modo reunião — 1 min

1. **Relatórios** → **Relatório Semanal — semana de 15/11 a 21/11/2026** (gerado sozinho pelo reset/avanço diário).
2. Mostre as 11 páginas e o botão **Imprimir / Baixar PDF** (A4 paisagem).
3. **Modo reunião**: o primeiro slide traz as **decisões da reunião anterior** (revisar exaustores e nebulização do P005; enviar amostra da última carga do grupo A ao laboratório; avaliar antecipação do descarte do L107). Marque uma como concluída e registre uma decisão nova no painel lateral.

## 10. Financeiro — 1 min

1. **Financeiro**: P007 com margem negativa nas 3 últimas semanas completas (−R$ 36, −R$ 2.248, −R$ 6.141), selo "Estimado".
2. Aba **Simulador**: preço do ovo **−10%** → ficam no vermelho **P002, P005 e P007**.

## 11. Demonstração ao vivo e arquitetura — 2 min

1. **Demonstração** → escolha **P004** → **Falha de bebedouro agora**: o alerta **"Água do P004 hoje em ~63% do normal para o horário" (A08h)** aparece em cerca de 1 segundo, com notificação no sino. (A partir das 08h; a regra precisa de 3 horas de dados do dia.)
2. Abra a ficha do P004: cartão **"Hoje (parcial, ao vivo)"** atualizando a cada 5 segundos.
3. **Simulador de contador ao vivo**: escolha P001 e P002, **Iniciar**; mostre as mensagens chegando, os totais do dia e **Enviar mensagem duplicada** (ignorada, mesmo `message_id`). Em **Dispositivos**, os contadores aparecem **online**.
4. Feche com o desenho das camadas (README, seção 4): simulador → banco → repositórios → motor puro → serviços → API → telas e assistente.
5. Ao terminar, clique em **Limpar** no painel de demonstração.

---

### Se algo não aparecer

- Datas diferentes das deste roteiro: é o avanço diário funcionando; os cenários continuam nas mesmas posições relativas a "Dados até …".
- A08h não abre: rode antes das 08h? A regra precisa de 3 horas de dados do dia. Use o "Pico de temperatura agora" (A11), que funciona a qualquer hora.
- Esteira parada (A02) só é avaliada entre 06h e 16h.
- Para voltar ao estado original: `npm run demo:reset` (roda no computador de quem cuida da plataforma).
