import cron, { type ScheduledTask } from "node-cron";
import type { AppLogger } from "../logger/index.js";

export interface ScheduledJob {
  readonly name: string;
  readonly expression: string;
  readonly handler: () => void | Promise<void>;
}

export class Scheduler {
  private readonly jobs = new Map<string, ScheduledTask>();

  public constructor(
    private readonly logger: AppLogger,
    private readonly timezone: string,
  ) {}

  public register(job: ScheduledJob): void {
    if (this.jobs.has(job.name)) {
      throw new Error(`A scheduled job named "${job.name}" is already registered`);
    }

    const task = cron.schedule(job.expression, () => {
      void Promise.resolve(job.handler()).catch((error: unknown) => {
        this.logger.error({ err: error, job: job.name }, "Scheduled job failed");
      });
    }, { timezone: this.timezone });

    task.stop();
    this.jobs.set(job.name, task);
    this.logger.debug({ job: job.name }, "Scheduled job registered");
  }

  public start(): void {
    for (const [name, task] of this.jobs) {
      task.start();
      this.logger.info({ job: name }, "Scheduled job started");
    }
  }

  public stop(): void {
    for (const [name, task] of this.jobs) {
      task.stop();
      this.logger.info({ job: name }, "Scheduled job stopped");
    }
  }
}