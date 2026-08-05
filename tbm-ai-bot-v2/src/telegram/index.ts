import { Telegraf, type Context } from "telegraf";
import type { AppLogger } from "../logger/index.js";

export class TelegramModule {
  private readonly bot: Telegraf<Context>;

  public constructor(
    token: string,
    private readonly logger: AppLogger,
  ) {
    this.bot = new Telegraf<Context>(token);
  }

  public registerHandlers(): void {
    // Telegram commands and callbacks will be registered here later.
    this.logger.debug("Telegram handlers are not configured");
  }

  public async start(): Promise<void> {
    await this.bot.launch();
    this.logger.info("Telegram bot started");
  }

  public stop(reason: string): void {
    this.bot.stop(reason);
    this.logger.info({ reason }, "Telegram bot stopped");
  }
}