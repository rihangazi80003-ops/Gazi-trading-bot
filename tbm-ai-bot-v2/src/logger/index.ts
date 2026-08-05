import pino, { type Logger } from "pino";

export function createLogger(level: string): Logger {
  return pino({
    level,
    ...(process.env.NODE_ENV !== "production"
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true },
          },
        }
      : {}),
  });
}

export type AppLogger = Logger;