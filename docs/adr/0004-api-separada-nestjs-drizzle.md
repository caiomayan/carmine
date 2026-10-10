# API em processo separado do Next.js, com NestJS e Drizzle

A API não vive dentro do Next.js (route handlers ou server actions): os plugins precisam de um contrato estável e de WebSocket para presença ao vivo, e o web é só mais um cliente. Usamos NestJS (adaptador Fastify) pelos módulos e convenções firmes, que mantêm vários agentes de IA coerentes, e Drizzle por ser próximo do SQL e ter migrações explícitas. O OpenAPI gerado pela API é a fonte do cliente C# dos plugins.
