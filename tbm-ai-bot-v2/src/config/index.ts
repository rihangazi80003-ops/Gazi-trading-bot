import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(configDirectory, "../..");

/**
 * Load environment files without depending on the directory used to start
 * the process. Explicit process environment variables always win.
 *
 * The package-local file is checked first, followed by the workspace-root
 * file. dotenv does not override values already loaded, so this gives the
 * package-local file precedence over the workspace-root file while retaining
 * normal shell/environment precedence.
 */
function loadEnvironment(): void {
  const environmentFiles = [
    resolve(packageDirectory, ".env"),
    resolve(packageDirectory, "..", ".env"),
  ];

  for (const environmentFile of environmentFiles) {
    if (existsSync(environmentFile)) {
      loadDotenv({ path: environmentFile });
    }
  }
}

loadEnvironment();

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