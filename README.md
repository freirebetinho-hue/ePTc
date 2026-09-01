# BPC Busca de Áreas — Inteligência Imobiliária

Versão técnica **0.2** do agente de prospecção imobiliária, formação de áreas, potencial construtivo e renda/aluguel.

## Modos
- **A** — Terreno/área para incorporação, inclusive composição de lotes.
- **B** — Compra para renda, com NOI e cap rate líquido.
- **C** — Busca de aluguel.

## Implementado na v0.2
- Briefing obrigatório e persistido no navegador.
- Agente server-side com Vercel AI SDK `ToolLoopAgent` e busca web para pesquisa multiportal.
- Estratégia 6 grandes + descoberta de 6 regionais por localização.
- Registro explícito de fonte pesquisada, sem resultado, bloqueada ou com erro.
- Base canônica de imóveis com origem, URL, data de consulta e `geo_precisao`.
- Deduplicação por endereço, coordenadas (<20 m), área, testada, preço, código, foto-hash e similaridade textual.
- Histórico de origens e preços preservado nos merges fortes.
- Geocodificação aproximada via OpenStreetMap/Nominatim, sem substituir dado oficial.
- Formação manual de grupos de lotes com contiguidade inicialmente `NAO_CONFIRMADO`.
- Cálculo de potencial construtivo (AC, APV, VGV, OODC e custo/VGV).
- Cálculo de yield bruto separado de cap rate líquido (NOI / preço).
- Exportação `.xlsx` profissional via ExcelJS com filtros, congelamento de painéis, hyperlinks e formatos monetários.
- CHECK FINAL alimentado pelo estado real do estudo.
- Export/import JSON do estudo e persistência local.
- CI de validação de build em `.github/workflows/ci.yml`.

## Compliance
A aplicação não deve inventar imóvel, endereço, área, preço, coordenada, proprietário ou disponibilidade. Não contorna autenticação, CAPTCHA, paywall ou bloqueios. Dados de anúncio são declaratórios; no Modo A, zoneamento/CA e área do terreno dependem de confirmação em fonte oficial/documental antes de conclusão.

## Limitações ainda abertas
- Persistência multiusuário em banco Vercel ainda não foi provisionada; a v0.2 usa persistência local + export/import de estudo.
- Fontes oficiais que exigem SQL/IPTU/matrícula específica continuam dependendo de consulta/documento por imóvel.
- Alguns portais podem bloquear ou limitar a indexação; o agente registra a limitação e não simula pesquisa.

## Rodar localmente
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Produção
Projeto preparado para Next.js/Vercel. O código-fonte canônico está na branch `main`.
