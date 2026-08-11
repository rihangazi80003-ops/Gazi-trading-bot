---
name: Bot environment loading
description: Environment-file location and precedence rules for the Telegram bot package.
---

The bot loads `.env` relative to its project files so it works when launched from
either the workspace root or the bot package directory. A package-local `.env`
takes precedence over the workspace-root `.env`, while explicitly exported shell
variables take precedence over both.

**Why:** Node's default dotenv lookup is based on the current working directory,
which made a workspace-root `.env` unreliable when the bot was started from its
own package directory.

**How to apply:** Keep each variable on its own `KEY=value` line, do not place a
startup command inside `.env`, and never commit or share bot tokens.