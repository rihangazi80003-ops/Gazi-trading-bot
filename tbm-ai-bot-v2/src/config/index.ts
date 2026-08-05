import "dotenv/config";

export type NodeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly telegramBotToken: string;
  readonly logLevel: string;
  readonly schedulerEnabled: boolean;
  readonly timezone: string;
}

function readRequired(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (value === undefined || value === "") {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Environment variable ${name} must be "true" or "false"`);
}

function readNodeEnvironment(): NodeEnvironment {
  const value = process.env.NODE_ENV?.trim().toLowerCase();

  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  return "development";
}

export function loadConfig(): AppConfig {
  return {
    nodeEnv: readNodeEnvironment(),
    telegramBotToken: readRequired("TELEGRAM_BOT_TOKEN"),
    logLevel: process.env.LOG_LEVEL?.trim() || "info",
    schedulerEnabled: readBoolean("SCHEDULER_ENABLED", false),
    timezone: process.env.TIMEZONE?.trim() || "UTC",
  };
}