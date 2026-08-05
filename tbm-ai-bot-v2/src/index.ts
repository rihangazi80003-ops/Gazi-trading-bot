import { createApp } from "./app.js";
import { loadConfig } from "./config/index.js";
import { createLogger } from "./logger/index.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const app = createApp(config, logger);

const shutdown = (signal: string): void => {
  logger.info({ signal }, "Shutdown requested");
  app.stop(signal);
  process.exit(0);
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

await app.start();