# BPC Busca de Áreas — Inteligência Imobiliária

Versão técnica **0.4** do agente de prospecção imobiliária, formação de áreas, potencial construtivo e renda/aluguel.

## Modos
- **A** — Terreno/área para incorporação, inclusive composição de lotes.
- **B** — Compra para renda, com NOI e cap rate líquido.
- **C** — Busca de aluguel.

## Arquitetura v0.4 — sem API
O sistema não exige chave, conta de API ou serviço pago para executar.

A pesquisa funciona em camadas:
1. busca HTML pública (DuckDuckGo HTML; fallback Bing HTML);
2. filtragem por domínio dos portais definidos no estudo;
3. extração direta de páginas públicas;
4. leitura de JSON-LD, `__NEXT_DATA__`, OpenGraph/metadados e texto visível;
5. deduplicação canônica;
6. entrada manual/importação quando uma fonte bloquear coleta automatizada.

A aplicação não contorna login, CAPTCHA, paywall ou `robots.txt`. Uma fonte bloqueada permanece registrada como limitação e deve ser revisada manualmente.

## Implementado
- Briefing obrigatório e persistido no navegador.
- Pesquisa multiportal sem API e sem chave externa.
- Estratégia 6 grandes + descoberta de fontes regionais por localização quando a busca pública permitir.
- Registro explícito de fonte pesquisada, sem resultado ou com erro/bloqueio.
- Base canônica com origem, URL, data de consulta e `geo_precisao`.
- Extração pública por JSON-LD, `__NEXT_DATA__`, metadados e HTML.
- Deduplicação por endereço, coordenadas existentes, área, testada, preço, código, foto-hash e similaridade textual.
- Histórico de origens e preços preservado nos merges fortes.
- Sem API de geocodificação: o sistema não inventa coordenadas; gera link de Google Maps por URL e aceita latitude/longitude comprovadas manualmente.
- Formação manual de grupos de lotes com contiguidade inicialmente `NAO_CONFIRMADO`.
- Cálculo de potencial construtivo (AC, APV, VGV, OODC e custo/VGV).
- Cálculo de yield bruto separado de cap rate líquido (NOI / preço).
- Exportação `.xlsx` via ExcelJS.
- CHECK FINAL alimentado pelo estado real do estudo.
- Export/import JSON e persistência local.
- Endpoint `/api/health` para diagnóstico do modo sem API.
- CI de validação de build em `.github/workflows/ci.yml`.

## Compliance
A aplicação não deve inventar imóvel, endereço, área, preço, coordenada, proprietário ou disponibilidade. Não contorna autenticação, CAPTCHA, paywall ou bloqueios. Dados de anúncio são declaratórios; no Modo A, zoneamento/CA e área do terreno dependem de confirmação em fonte oficial/documental antes de conclusão.

## Limitações inerentes ao modo sem API
- mecanismos de busca públicos podem limitar automação temporariamente;
- alguns portais usam JavaScript pesado ou bloqueiam robôs;
- resultados não indexados pelos buscadores precisam ser inseridos manualmente;
- geocodificação automática foi removida para manter o sistema realmente sem API;
- fontes oficiais que exigem SQL/IPTU/matrícula específica continuam dependendo de consulta/documento por imóvel.

## Rodar localmente
```bash
npm install
npm run local
```

Acesse `http://localhost:3000`.

Diagnóstico: `http://localhost:3000/api/health`.

## Build
```bash
npm run build
```

## Produção
Projeto preparado para Next.js/Vercel. O código-fonte canônico está na branch `main`.
