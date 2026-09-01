# BPC Busca de Áreas — Inteligência Imobiliária

MVP operacional baseado no PROMPT MESTRE do agente de prospecção imobiliária, formação de áreas, potencial construtivo e renda/aluguel.

## Modos
- **A** — Terreno/área para incorporação, inclusive composição de lotes.
- **B** — Compra para renda, com NOI e cap rate líquido.
- **C** — Busca de aluguel.

## Regras centrais implementadas
- Briefing obrigatório antes da análise.
- Base canônica de imóveis com origem, URL, data de consulta e `geo_precisao`.
- Extração de HTML público via `/api/extract`, priorizando JSON-LD, `__NEXT_DATA__` e OpenGraph.
- Não contorna autenticação, CAPTCHA ou bloqueios; fontes inacessíveis devem ser tratadas manualmente e registradas como limitação.
- Cálculo de potencial construtivo (AC, APV, VGV e custo por m² potencial).
- Cálculo de yield bruto separado de cap rate líquido (NOI / preço).
- Exportação `.xlsx` real via `/api/export`, com abas Resumo, Portais/Fonte, Base de Imóveis, Áreas/Comparativo, Potencial/Análise de Renda e Verificação.
- CHECK FINAL visível para impedir que uma análise incompleta seja tratada como concluída.

## Limitações do MVP
A pesquisa automática em 12+ portais depende do que cada portal permite por HTML público/robots/ToS. O sistema não deve simular consulta. Portais bloqueados precisam ser registrados e substituídos por fonte pública permitida ou entrada manual. Consultas oficiais como GeoSampa, matrícula/IPTU, CETESB e DECEA exigem integração ou validação documental específica por estudo.

## Rodar localmente
```bash
npm install
npm run dev
```
Acesse `http://localhost:3000`.

## Produção
Projeto preparado para Next.js/Vercel. Conecte este repositório ao Vercel e faça o deploy da branch `main`.

## Compliance
Dados de anúncio são declaratórios. Não inventar endereço, área, preço, coordenada, proprietário ou disponibilidade. Separar fatos confirmados, inferências e itens não confirmados. Não redistribuir imagens protegidas; quando necessário use somente URL/hash permitido.
