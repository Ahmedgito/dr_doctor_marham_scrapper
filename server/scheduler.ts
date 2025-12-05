import type { SchedulerConfig, SchedulerStatus, ScraperConfig } from "@shared/schema";
import { scraper } from "./scraper";

class ScraperScheduler {
  private enabled: boolean = false;
  private intervalMinutes: number = 60;
  private maxRuns?: number;
  private runsCompleted: number = 0;
  private lastRunAt?: string;
  private nextRunAt?: string;
  private scraperConfig?: Partial<ScraperConfig>;
  private timer: NodeJS.Timeout | null = null;

  configure(config: Partial<SchedulerConfig>): void {
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
    }
    if (config.intervalMinutes !== undefined) {
      this.intervalMinutes = Math.max(5, config.intervalMinutes);
    }
    if (config.maxRuns !== undefined) {
      this.maxRuns = config.maxRuns;
    }
    if (config.scraperConfig !== undefined) {
      this.scraperConfig = config.scraperConfig;
    }

    if (this.enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  start(): void {
    this.stop();
    
    if (!this.enabled) {
      console.log("[Scheduler] Cannot start - scheduler is disabled");
      return;
    }

    if (this.maxRuns && this.runsCompleted >= this.maxRuns) {
      console.log("[Scheduler] Max runs reached, not starting");
      this.enabled = false;
      return;
    }

    const intervalMs = this.intervalMinutes * 60 * 1000;
    this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    
    console.log(`[Scheduler] Started - next run at ${this.nextRunAt}`);
    
    this.timer = setInterval(() => {
      this.runScraper();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.nextRunAt = undefined;
    console.log("[Scheduler] Stopped");
  }

  private async runScraper(): Promise<void> {
    const scraperStatus = scraper.getStatus();
    
    if (scraperStatus.status === "running" || scraperStatus.status === "paused") {
      console.log("[Scheduler] Scraper is already running, skipping scheduled run");
      return;
    }

    console.log(`[Scheduler] Starting scheduled run ${this.runsCompleted + 1}`);
    this.lastRunAt = new Date().toISOString();
    
    try {
      await scraper.start(this.scraperConfig, false);
      this.runsCompleted++;
      
      if (this.maxRuns && this.runsCompleted >= this.maxRuns) {
        console.log("[Scheduler] Max runs reached, stopping scheduler");
        this.enabled = false;
        this.stop();
      } else {
        const intervalMs = this.intervalMinutes * 60 * 1000;
        this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
      }
    } catch (error) {
      console.error("[Scheduler] Error during scheduled run:", error);
    }
  }

  runNow(): void {
    if (!this.enabled) {
      console.log("[Scheduler] Cannot run - scheduler is disabled");
      return;
    }
    
    this.runScraper();
  }

  getStatus(): SchedulerStatus {
    return {
      enabled: this.enabled,
      intervalMinutes: this.intervalMinutes,
      runsCompleted: this.runsCompleted,
      maxRuns: this.maxRuns,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.enabled ? this.nextRunAt : undefined,
      scraperConfig: this.scraperConfig,
    };
  }

  reset(): void {
    this.stop();
    this.enabled = false;
    this.runsCompleted = 0;
    this.lastRunAt = undefined;
    this.nextRunAt = undefined;
    console.log("[Scheduler] Reset");
  }
}

export const scheduler = new ScraperScheduler();
