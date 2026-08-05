import type { AppConfig } from "./config/index.js";
import type { AppLogger } from "./logger/index.js";
import { Scheduler } from "./scheduler/index.js";
import { TelegramModule } from "./telegram/index.js";

export interface App {
  readonly scheduler: Scheduler;
  readonly telegram: TelegramModule;
  start(): Promise<void>;
  stop(reason: string): void;
}

export function createApp(config: AppConfig, logger: AppLogger): App {
  const scheduler = new Scheduler(logger, config.timezone);
  const telegram = new TelegramModule(config.telegramBotToken, logger);

  return {
    scheduler,
    telegram,
    async start(): Promise<void> {
      telegram.registerHandlers();

      if (config.schedulerEnabled) {
        scheduler.start();
      } else {
        logger.info("Scheduler is disabled");
      }

      await telegram.start();
    },
    stop(reason: string): void {
      scheduler.stop();
      telegram.stop(reason);
    },
  };
}