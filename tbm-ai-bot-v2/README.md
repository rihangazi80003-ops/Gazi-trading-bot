# TBM AI BOT V2

Production-ready TypeScript architecture for a modular Telegram trading bot.

## Status

This is the initial architecture only. Trading logic, market-data integrations,
signal calculations, and order execution are intentionally not implemented.

## Requirements

- Node.js 20+
- pnpm
- A Telegram bot token for runtime startup

## Setup

1. Copy `.env.example` to `.env`.
2. Set `TELEGRAM_BOT_TOKEN` from a secure environment variable.
3. Install workspace dependencies with `pnpm install`.
4. Run `pnpm --filter tbm-ai-bot-v2 run dev`.

## Commands

```bash
pnpm --filter tbm-ai-bot-v2 run dev
pnpm --filter tbm-ai-bot-v2 run typecheck
pnpm --filter tbm-ai-bot-v2 run build
pnpm --filter tbm-ai-bot-v2 run start
```

## Source layout

```text
src/
├── config/          Environment loading and validation
├── filters/         Signal filtering extension points
├── indicators/      Technical indicator extension points
├── logger/          Structured logging
├── martingale/      Position-sizing policy extension point
├── reports/         Report generation extension points
├── scheduler/       Scheduled task registration and lifecycle
├── signal-engine/   Signal orchestration extension point
├── telegram/        Telegram Bot API boundary
├── types/           Shared domain contracts
└── utils/           Shared utilities
```