# TBM AI BOT V2

TBM AI BOT V2 is a production-ready TypeScript foundation for a modular Telegram trading bot. Trading behavior is intentionally not implemented yet.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter tbm-ai-bot-v2 run dev` — run the Telegram bot in watch mode
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Bot: Telegraf, Pino, node-cron, dotenv

## Where things live

- `tbm-ai-bot-v2/src/config` — validated environment configuration
- `tbm-ai-bot-v2/src/logger` — structured application logging
- `tbm-ai-bot-v2/src/scheduler` — generic scheduled task infrastructure
- `tbm-ai-bot-v2/src/signal-engine` — future signal orchestration boundary
- `tbm-ai-bot-v2/src/indicators` — future technical indicators
- `tbm-ai-bot-v2/src/filters` — future signal filters
- `tbm-ai-bot-v2/src/reports` — future report generation
- `tbm-ai-bot-v2/src/martingale` — future position-sizing policy boundary
- `tbm-ai-bot-v2/src/telegram` — Telegram client boundary
- `tbm-ai-bot-v2/src/utils` — shared utilities
- `tbm-ai-bot-v2/src/types` — shared domain contracts

## Architecture decisions

- The bot is isolated in its own workspace package and does not depend on the existing web/API artifacts.
- Environment values are loaded and validated at startup instead of being accessed throughout the application.
- Telegram, scheduling, and logging are infrastructure boundaries so future trading modules remain independently testable.
- Trading logic is intentionally absent; the domain folders contain extension-point contracts only.

## Product

The first version provides the foundation for a Telegram-based trading assistant. Future work can add market data, signal generation, filtering, reporting, and risk policies without changing the application bootstrap.

## User preferences

- Do not implement trading logic until explicitly requested.

## Gotchas

- Set `TELEGRAM_BOT_TOKEN` from a secure environment variable before starting the bot.
- `SCHEDULER_ENABLED` defaults to `false`; scheduled jobs should be enabled deliberately when they are added.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
