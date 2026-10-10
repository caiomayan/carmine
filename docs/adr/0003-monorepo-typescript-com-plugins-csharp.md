# Monorepo TypeScript, plugins em C#, Go só na Fase 2

Um único repositório (pnpm + Turborepo) contém o web (Next.js), a API, os contratos compartilhados e os plugins. Web e API em TypeScript compartilham tipos e validação (Zod), que é a maior superfície de integração. Os plugins são C# porque o CounterStrikeSharp é o padrão de fato do CS2 (WeaponPaints, cs2-retakes, MatchZy). Go fica reservado para o orquestrador da Fase 2.

## Considered Options

- .NET no backend: compartilharia C# com os plugins, mas a superfície web↔API é muito maior que a plugin↔API.
- Java Spring: dominado pelo autor, mas mais pesado no host ARM e sem tipos compartilhados com o front.
