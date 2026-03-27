import puppeteer, { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import type { ScraperConfig, ScraperStatus, Hospital, Doctor, ScraperResults, DeduplicatedDoctor, ExtendedResults } from "@shared/schema";

type LogLevel = "info" | "warn" | "error" | "success";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

interface ErrorEntry {
  timestamp: string;
  message: string;
  context?: string;
}

interface FailedHospitalEntry {
  name: string;
  url: string;
  address: string;
  attempts: number;
  lastError?: string;
  lastAttemptAt?: string;
}

const BASE_URL = "https://www.marham.pk";
// Use process.cwd() instead of __dirname because this file is executed in ESM/tsx context
const STATE_FILE_PATH = path.join(process.cwd(), "scraper-state.json");
const MAX_RETRY_ATTEMPTS_PER_HOSPITAL = 3;

// Helper functions for data cleaning
function normalizeFeesToNumeric(fees: string): { formatted: string; numeric: number | null } {
  const cleaned = fees.replace(/[^\d,]/g, '').replace(/,/g, '');
  const numeric = cleaned ? parseInt(cleaned) : null;
  const formatted = numeric ? `Rs. ${numeric.toLocaleString()}` : fees;
  return { formatted, numeric };
}

function parseExperienceYears(experience: string): { formatted: string; years: number | null } {
  const match = experience.match(/(\d+)/);
  const years = match ? parseInt(match[1]) : null;
  const formatted = years ? `${years} Years` : experience;
  return { formatted, years };
}

function normalizeSpecialty(specialty: string): string {
  return specialty
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function generateDoctorKey(doctor: Doctor): string {
  const normalizedName = doctor.name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const normalizedSpecialty = doctor.specialty.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  return `${normalizedName}|${normalizedSpecialty}`;
}

interface ScraperState {
  config: ScraperConfig;
  hospitalsProcessed: number;
  hospitalLinks: { name: string; url: string; address: string }[];
  hospitals: Hospital[];
  doctorsScraped: number;
  startedAt?: string;
  failedHospitals?: FailedHospitalEntry[];
}

class MarhamScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private status: ScraperStatus;
  private config: ScraperConfig;
  private hospitals: Hospital[] = [];
  private isPaused: boolean = false;
  private isStopped: boolean = false;
  private isRunning: boolean = false;
  private savedState: ScraperState | null = null;
  private pendingHospitalLinks: { name: string; url: string; address: string }[] = [];

  constructor() {
    this.config = this.getDefaultConfig();
    this.status = this.getInitialStatus();
    this.loadStateFromFile();
  }

  private getDefaultConfig(): ScraperConfig {
    return {
      startUrl: "https://www.marham.pk/hospitals/karachi",
      delayBetweenRequests: 2000,
      selectors: {
        hospitalCard: "div.row.shadow-card",
        hospitalName: "a.hosp_list_selected_hosp_name",
        hospitalAddress: "p.text-sm",
        doctorCard: "div.row.shadow-card",
        doctorName: "h3.mb-0",
        doctorSpecialty: "p.mb-0.text-sm",
        doctorQualification: "p.text-sm",
        doctorExperience: "p.text-bold.text-sm",
        doctorReviews: "p.text-bold.text-sm.text-golden, a.text-golden",
        doctorFees: "p.mb-0.price.text-sm.text-bold",
        otherHospitals: "div.product-card.card-hospital",
        pagination: "a.pagination-link, .pagination a",
      },
    };
  }

  private mergeConfig(partial: Partial<ScraperConfig>): ScraperConfig {
    const defaults = this.getDefaultConfig();
    return {
      startUrl: partial.startUrl || defaults.startUrl,
      maxHospitals: partial.maxHospitals,
      maxDoctorsPerHospital: partial.maxDoctorsPerHospital,
      delayBetweenRequests: partial.delayBetweenRequests || defaults.delayBetweenRequests,
      selectors: {
        ...defaults.selectors,
        ...(partial.selectors || {}),
      },
    };
  }

  private getInitialStatus(): ScraperStatus {
    return {
      status: "idle",
      hospitalsProcessed: 0,
      totalHospitals: 0,
      doctorsScraped: 0,
      errors: [],
      logs: [],
    };
  }

  private log(level: LogLevel, message: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    this.status.logs.push(entry);
    if (this.status.logs.length > 500) {
      this.status.logs = this.status.logs.slice(-500);
    }
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  private addError(message: string, context?: string) {
    const entry: ErrorEntry = {
      timestamp: new Date().toISOString(),
      message,
      context,
    };
    this.status.errors.push(entry);
    this.log("error", message);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async waitForPauseOrStop(): Promise<boolean> {
    while (this.isPaused && !this.isStopped) {
      await this.delay(500);
    }
    return this.isStopped;
  }

  private makeAbsoluteUrl(url: string): string {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    if (url.startsWith("/")) return BASE_URL + url;
    return BASE_URL + "/" + url;
  }

  private loadStateFromFile(): void {
    try {
      if (fs.existsSync(STATE_FILE_PATH)) {
        const raw = fs.readFileSync(STATE_FILE_PATH, "utf-8");
        const parsed: ScraperState = JSON.parse(raw);
        this.savedState = parsed;
        if (!Array.isArray(this.savedState.failedHospitals)) {
          this.savedState.failedHospitals = [];
        }
        this.log("info", `Loaded saved state from disk: ${parsed.hospitalsProcessed} hospitals processed, ${parsed.doctorsScraped} doctors scraped`);
      }
    } catch (error) {
      console.error("Failed to load scraper state from file", error);
    }
  }

  private persistStateToFile(): void {
    if (!this.savedState) return;
    try {
      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(this.savedState, null, 2), "utf-8");
    } catch (error) {
      console.error("Failed to persist scraper state to file", error);
    }
  }

  async start(config?: Partial<ScraperConfig>, resume: boolean = false): Promise<void> {
    if (this.isRunning) {
      throw new Error("Scraper is already running");
    }

    if (resume && this.savedState) {
      this.log("info", "Resuming from saved state...");
      this.config = this.savedState.config;
      this.hospitals = [...this.savedState.hospitals];
      this.pendingHospitalLinks = [...this.savedState.hospitalLinks];
      if (!Array.isArray(this.savedState.failedHospitals)) {
        this.savedState.failedHospitals = [];
      }
      this.status = {
        ...this.getInitialStatus(),
        status: "running",
        startedAt: this.savedState.startedAt || new Date().toISOString(),
        hospitalsProcessed: this.savedState.hospitalsProcessed,
        totalHospitals: this.savedState.hospitalLinks.length,
        doctorsScraped: this.savedState.doctorsScraped,
      };
      this.log("info", `Resuming from hospital ${this.savedState.hospitalsProcessed + 1}`);
    } else {
      this.config = this.mergeConfig(config || {});
      this.status = {
        ...this.getInitialStatus(),
        status: "running",
        startedAt: new Date().toISOString(),
      };
      this.hospitals = [];
      this.pendingHospitalLinks = [];
      this.log("info", "Starting Marham.pk scraper...");
      this.log("info", `Target URL: ${this.config.startUrl}`);
    }
    
    this.isPaused = false;
    this.isStopped = false;
    this.isRunning = true;

    try {
      await this.initBrowser();
      await this.scrapeHospitals(resume);
      
      if (!this.isStopped) {
        this.status.status = "completed";
        this.status.completedAt = new Date().toISOString();
        this.savedState = null;
        this.log("success", `Scraping completed! ${this.hospitals.length} hospitals, ${this.status.doctorsScraped} doctors`);
      } else {
        this.status.status = "idle";
        this.log("info", "Scraping was stopped by user");
      }
    } catch (error) {
      this.status.status = "error";
      // Save current state so user can resume after unexpected errors
      this.saveState();
      this.addError(error instanceof Error ? error.message : "Unknown error occurred");
    } finally {
      this.isRunning = false;
      await this.closeBrowser();
    }
  }

  pause(): void {
    if (this.status.status === "running") {
      this.isPaused = true;
      this.status.status = "paused";
      this.log("info", "Scraper paused");
    }
  }

  resume(): void {
    if (this.status.status === "paused") {
      this.isPaused = false;
      this.status.status = "running";
      this.log("info", "Scraper resumed");
    }
  }

  stop(): void {
    this.isStopped = true;
    this.isPaused = false;
    this.saveState();
    this.log("info", "Stop signal received, finishing current task...");
  }

  private saveState(): void {
    if (this.pendingHospitalLinks.length > 0 || this.hospitals.length > 0) {
      this.savedState = {
        config: this.config,
        hospitalsProcessed: this.status.hospitalsProcessed,
        hospitalLinks: this.pendingHospitalLinks,
        hospitals: [...this.hospitals],
        doctorsScraped: this.status.doctorsScraped,
        startedAt: this.status.startedAt,
        failedHospitals: this.savedState?.failedHospitals || [],
      };
      this.log("info", `State saved: ${this.status.hospitalsProcessed} hospitals processed, ${this.hospitals.length} ready for resume`);
      this.persistStateToFile();
    }
  }

  private recordFailedHospital(hospitalInfo: { name: string; url: string; address: string }, errorMessage: string): void {
    // Ensure we have a state container to persist failures even if the run crashes later.
    if (!this.savedState) {
      this.savedState = {
        config: this.config,
        hospitalsProcessed: this.status.hospitalsProcessed,
        hospitalLinks: this.pendingHospitalLinks,
        hospitals: [...this.hospitals],
        doctorsScraped: this.status.doctorsScraped,
        startedAt: this.status.startedAt,
        failedHospitals: [],
      };
    }
    if (!Array.isArray(this.savedState.failedHospitals)) {
      this.savedState.failedHospitals = [];
    }

    const absoluteUrl = this.makeAbsoluteUrl(hospitalInfo.url);
    const existingIdx = this.savedState.failedHospitals.findIndex((h) => this.makeAbsoluteUrl(h.url) === absoluteUrl);
    const existing = existingIdx >= 0 ? this.savedState.failedHospitals[existingIdx] : undefined;

    const updated: FailedHospitalEntry = {
      name: hospitalInfo.name,
      url: absoluteUrl,
      address: hospitalInfo.address,
      attempts: (existing?.attempts || 0) + 1,
      lastError: errorMessage,
      lastAttemptAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      this.savedState.failedHospitals[existingIdx] = updated;
    } else {
      this.savedState.failedHospitals.push(updated);
    }
  }

  private async retryFailedHospitalsOnResume(): Promise<void> {
    if (!this.savedState || !Array.isArray(this.savedState.failedHospitals) || this.savedState.failedHospitals.length === 0) {
      return;
    }

    const retryable = this.savedState.failedHospitals.filter((h) => (h.attempts || 0) < MAX_RETRY_ATTEMPTS_PER_HOSPITAL);
    if (retryable.length === 0) {
      this.log("warn", `Saved state has ${this.savedState.failedHospitals.length} failed hospitals but all exceeded retry limit`);
      return;
    }

    this.log("info", `Retrying ${retryable.length} previously failed hospitals before continuing...`);

    // Iterate over a snapshot so we can mutate the underlying list on success/failure.
    for (const failed of [...retryable]) {
      if (await this.waitForPauseOrStop()) break;

      this.status.currentHospital = failed.name;
      this.status.currentDoctor = undefined;
      this.log("info", `Retrying failed hospital (${failed.attempts + 1}/${MAX_RETRY_ATTEMPTS_PER_HOSPITAL}): ${failed.name}`);

      try {
        const hospital = await this.scrapeHospitalDetails({
          name: failed.name,
          url: failed.url,
          address: failed.address,
        });
        this.hospitals.push(hospital);
        this.log("success", `Recovered failed hospital: ${hospital.hospitalName} (${hospital.doctors.length} doctors)`);

        // Remove from failed list on success
        const idx = this.savedState.failedHospitals.findIndex((h) => this.makeAbsoluteUrl(h.url) === this.makeAbsoluteUrl(failed.url));
        if (idx >= 0) this.savedState.failedHospitals.splice(idx, 1);
        this.saveState();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        this.addError(`Retry failed for hospital: ${failed.name}`, errMsg);
        this.recordFailedHospital({ name: failed.name, url: failed.url, address: failed.address }, errMsg);
        this.saveState();
      }

      await this.delay(this.config.delayBetweenRequests);
    }
  }

  getSavedState(): { hasState: boolean; hospitalsProcessed: number; totalHospitals: number; doctorsScraped: number } {
    if (!this.savedState) {
      return { hasState: false, hospitalsProcessed: 0, totalHospitals: 0, doctorsScraped: 0 };
    }
    return {
      hasState: true,
      hospitalsProcessed: this.savedState.hospitalsProcessed,
      totalHospitals: this.savedState.hospitalLinks.length,
      doctorsScraped: this.savedState.doctorsScraped,
    };
  }

  clearSavedState(): void {
    this.savedState = null;
    this.log("info", "Saved state cleared");
    try {
      if (fs.existsSync(STATE_FILE_PATH)) {
        fs.unlinkSync(STATE_FILE_PATH);
      }
    } catch (error) {
      console.error("Failed to delete scraper state file", error);
    }
  }

  getStatus(): ScraperStatus {
    return { ...this.status };
  }

  getResults(): ScraperResults {
    return {
      hospitals: this.hospitals,
      metadata: {
        scrapedAt: new Date().toISOString(),
        totalHospitals: this.hospitals.length,
        totalDoctors: this.status.doctorsScraped,
        duration: this.calculateDuration(),
      },
    };
  }

  getExtendedResults(): ExtendedResults {
    const uniqueDoctors = this.deduplicateDoctors();
    return {
      hospitals: this.hospitals,
      uniqueDoctors,
      metadata: {
        scrapedAt: new Date().toISOString(),
        totalHospitals: this.hospitals.length,
        totalDoctors: this.status.doctorsScraped,
        uniqueDoctorCount: uniqueDoctors.length,
        duration: this.calculateDuration(),
      },
    };
  }

  private deduplicateDoctors(): DeduplicatedDoctor[] {
    const doctorMap = new Map<string, DeduplicatedDoctor>();

    for (const hospital of this.hospitals) {
      for (const doctor of hospital.doctors) {
        const key = generateDoctorKey(doctor);
        
        if (doctorMap.has(key)) {
          const existing = doctorMap.get(key)!;
          const hospitalExists = existing.hospitals.some(
            h => h.name.toLowerCase() === hospital.hospitalName.toLowerCase()
          );
          if (!hospitalExists) {
            existing.hospitals.push({
              name: hospital.hospitalName,
              address: hospital.hospitalAddress,
              fee: doctor.fees,
              url: hospital.hospitalUrl,
            });
          }
          if (!existing.profileUrl && doctor.profileUrl) {
            existing.profileUrl = doctor.profileUrl;
          }
          if (!existing.reviews && doctor.reviews) {
            existing.reviews = doctor.reviews;
          }
        } else {
          doctorMap.set(key, {
            name: doctor.name,
            specialty: normalizeSpecialty(doctor.specialty),
            qualification: doctor.qualification,
            experience: parseExperienceYears(doctor.experience).formatted,
            reviews: doctor.reviews,
            satisfaction: doctor.satisfaction,
            profileUrl: doctor.profileUrl,
            hospitals: [{
              name: hospital.hospitalName,
              address: hospital.hospitalAddress,
              fee: doctor.fees,
              url: hospital.hospitalUrl,
            }],
          });
        }

        for (const otherHospital of doctor.otherHospitals) {
          const existing = doctorMap.get(key);
          if (existing) {
            const hospitalExists = existing.hospitals.some(
              h => h.name.toLowerCase() === otherHospital.name.toLowerCase()
            );
            if (!hospitalExists) {
              existing.hospitals.push({
                name: otherHospital.name,
                address: otherHospital.address,
                fee: otherHospital.fee,
              });
            }
          }
        }
      }
    }

    return Array.from(doctorMap.values());
  }

  private calculateDuration(): string {
    if (!this.status.startedAt) return "";
    const start = new Date(this.status.startedAt).getTime();
    const end = this.status.completedAt 
      ? new Date(this.status.completedAt).getTime() 
      : Date.now();
    const duration = Math.round((end - start) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  }

  private async initBrowser(): Promise<void> {
    this.log("info", "Launching browser...");
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await this.page.setViewport({ width: 1920, height: 1080 });
    this.log("success", "Browser launched successfully");
  }

  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.log("info", "Browser closed");
    }
  }

  private async loadAllCards(cardSelector: string, loadMoreSelector: string): Promise<void> {
    if (!this.page) return;

    try {
      let previousCount = await this.page.$$eval(cardSelector, (els) => els.length);
      let safetyCounter = 0;
      let loadMoreClicked = false;

      while (safetyCounter < 1000) { // Prevent infinite loops
        // Check if load more button exists and is visible
        const loadMoreButton = await this.page.$(loadMoreSelector);
        if (!loadMoreButton) {
          this.log("info", "No more 'Load More' button found");
          break;
        }

        // Scroll to the load more button
        await this.page.evaluate((el) => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, loadMoreButton);

        // Wait a bit for any lazy loading
        await this.delay(1000);

        // Click the button and wait for network to be idle
        await Promise.all([
          this.page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {}),
          loadMoreButton.click().catch(() => {})
        ]);

        // Wait for content to load
        await this.delay(2000);

        // Check if new content was loaded
        const currentCount = await this.page.$$eval(cardSelector, (els) => els.length);
        if (currentCount <= previousCount) {
          if (loadMoreClicked) {
            // If we already clicked once and no new content, we're probably at the end
            this.log("info", "No new content loaded after clicking 'Load More'");
            break;
          }
          // Sometimes the first click doesn't work, try one more time
          loadMoreClicked = true;
          continue;
        }

        previousCount = currentCount;
        safetyCounter++;
        loadMoreClicked = false;
        this.log("info", `Loaded ${currentCount} items so far...`);
      }

      if (safetyCounter >= 1000) {
        this.log("warn", "Reached safety limit while loading more content");
      }
    } catch (error) {
      this.log("warn", `Error while loading more content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async scrapeHospitals(resume: boolean = false): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    let hospitalsToProcess: { name: string; url: string; address: string }[];
    let startIndex = 0;
    
    if (resume && this.pendingHospitalLinks.length > 0) {
      await this.retryFailedHospitalsOnResume();
      hospitalsToProcess = this.pendingHospitalLinks;
      startIndex = this.status.hospitalsProcessed;
      this.log("info", `Resuming with ${hospitalsToProcess.length - startIndex} hospitals remaining`);
    } else {
      const startUrl = this.makeAbsoluteUrl(this.config.startUrl);
      this.log("info", `Navigating to ${startUrl}`);
      await this.page.goto(startUrl, { waitUntil: "networkidle2", timeout: 60000 });
      await this.delay(2000);

      await this.loadAllCards(this.config.selectors.hospitalCard, ".loadMore, #loadMore");

      const hospitalLinks = await this.extractHospitalLinks();
      this.status.totalHospitals = this.config.maxHospitals 
        ? Math.min(hospitalLinks.length, this.config.maxHospitals) 
        : hospitalLinks.length;

      this.log("info", `Found ${hospitalLinks.length} hospitals to scrape`);

      hospitalsToProcess = this.config.maxHospitals 
        ? hospitalLinks.slice(0, this.config.maxHospitals) 
        : hospitalLinks;
      
      this.pendingHospitalLinks = hospitalsToProcess;
    }

    for (let i = startIndex; i < hospitalsToProcess.length; i++) {
      if (await this.waitForPauseOrStop()) break;

      const hospitalInfo = hospitalsToProcess[i];
      this.status.currentHospital = hospitalInfo.name;
      this.status.currentDoctor = undefined;
      this.log("info", `Processing hospital ${i + 1}/${hospitalsToProcess.length}: ${hospitalInfo.name}`);

      try {
        const hospital = await this.scrapeHospitalDetails(hospitalInfo);
        this.hospitals.push(hospital);
        this.status.hospitalsProcessed++;
        this.log("success", `Completed: ${hospital.hospitalName} (${hospital.doctors.length} doctors)`);
        // Persist progress after each hospital so it can be resumed later
        this.saveState();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        this.addError(
          `Failed to scrape hospital: ${hospitalInfo.name}`,
          errMsg
        );
        // Persist this failure so a restart can retry it first.
        this.recordFailedHospital(hospitalInfo, errMsg);
        this.saveState();
      }

      await this.delay(this.config.delayBetweenRequests);
    }

    this.status.currentHospital = undefined;
    this.status.currentDoctor = undefined;
  }

  private async extractHospitalLinks(): Promise<{ name: string; url: string; address: string }[]> {
    if (!this.page) return [];

    const content = await this.page.content();
    const $ = cheerio.load(content);
    const hospitals: { name: string; url: string; address: string }[] = [];

    $(this.config.selectors.hospitalCard).each((_, card) => {
      const $card = $(card);
      const nameLink = $card.find(this.config.selectors.hospitalName);
      const name = nameLink.text().trim();
      const rawUrl = nameLink.attr("href");
      const url = this.makeAbsoluteUrl(rawUrl || "");
      
      const addressTexts = $card.find(this.config.selectors.hospitalAddress);
      let address = "";
      addressTexts.each((_, el) => {
        const text = $(el).text().trim();
        if (text && !text.includes("View All") && text.length > 10) {
          address = text;
          return false;
        }
      });

      if (name && url) {
        hospitals.push({ name, url, address });
      }
    });

    return hospitals;
  }

  private async scrapeHospitalDetails(hospitalInfo: { name: string; url: string; address: string }): Promise<Hospital> {
    if (!this.page) throw new Error("Browser not initialized");

    const absoluteUrl = this.makeAbsoluteUrl(hospitalInfo.url);
    this.log("info", `Navigating to hospital page: ${absoluteUrl}`);
    await this.page.goto(absoluteUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await this.delay(2000);

    await this.loadAllCards(this.config.selectors.doctorCard, ".loadMore, #loadMore");

    const allDoctors = await this.extractDoctorsFromPage();
    const limitedDoctors = this.config.maxDoctorsPerHospital
      ? allDoctors.slice(0, this.config.maxDoctorsPerHospital)
      : allDoctors;

    this.status.doctorsScraped += limitedDoctors.length;

    return {
      hospitalName: hospitalInfo.name,
      hospitalAddress: hospitalInfo.address,
      hospitalUrl: absoluteUrl,
      doctors: limitedDoctors,
    };
  }

  private async extractDoctorsFromPage(): Promise<Doctor[]> {
    if (!this.page) return [];

    const content = await this.page.content();
    const $ = cheerio.load(content);
    const doctors: Doctor[] = [];

    $(this.config.selectors.doctorCard).each((_, card) => {
      const $card = $(card);
      
      const doctorLink = $card.find("a.dr_profile_opened_from_hospital_profile, a[href*='/doctors/']").first();
      const nameEl = $card.find(this.config.selectors.doctorName).first();
      const name = nameEl.text().trim();
      
      if (!name || name.length < 3) return;

      const specialtyEl = $card.find(this.config.selectors.doctorSpecialty).first();
      const specialtyText = specialtyEl.text().trim();
      
      const qualificationText = $card.find("p.text-sm").filter((_, el) => {
        const text = $(el).text().trim();
        return text.includes("MBBS") || text.includes("MD") || text.includes("MS") || text.includes("FCPS") || text.includes("BDS");
      }).first().text().trim();

      let experience = "";
      let reviews = "";
      let satisfaction = "";
      let fees = "";

      $card.find("div.col-4, div.col-3").each((_, col) => {
        const $col = $(col);
        const labelText = $col.text().toLowerCase();
        const valueEl = $col.find("p.text-bold, .text-bold");
        const value = valueEl.text().trim();

        if (labelText.includes("experience")) {
          experience = value;
        } else if (labelText.includes("review")) {
          const reviewMatch = $col.text().match(/(\d+)/);
          reviews = reviewMatch ? reviewMatch[1] : "";
        } else if (labelText.includes("satisfaction")) {
          satisfaction = value;
        }
      });

      const feesEl = $card.find(this.config.selectors.doctorFees + ", p.price, .price").first();
      fees = feesEl.text().trim();

      const otherHospitals: { name: string; address: string; fee?: string }[] = [];
      $card.find(this.config.selectors.otherHospitals + ", div.card-hospital").each((_, hospCard) => {
        const $hospCard = $(hospCard);
        const hospName = $hospCard.find("p.text-blue, .text-blue").first().text().trim();
        const hospFee = $hospCard.find("p.price, .price").text().trim();
        
        if (hospName) {
          const parts = hospName.split(",");
          otherHospitals.push({
            name: parts[0]?.trim() || hospName,
            address: parts.slice(1).join(",").trim(),
            fee: hospFee,
          });
        }
      });

      const doctor: Doctor = {
        name: name.replace(/PMDC Verified/gi, "").trim(),
        specialty: specialtyText,
        qualification: qualificationText,
        experience,
        fees,
        reviews,
        satisfaction,
        profileUrl: this.makeAbsoluteUrl(doctorLink.attr("href") || ""),
        otherHospitals,
      };

      this.status.currentDoctor = doctor.name;
      doctors.push(doctor);
    });

    return doctors;
  }

  private async goToNextPage(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const nextPageSelector = "a.pagination-link.next, .pagination a:contains('Next'), a[rel='next']";
      const nextButton = await this.page.$(nextPageSelector);
      
      if (nextButton) {
        await nextButton.click();
        await this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
        return true;
      }

      const content = await this.page.content();
      const $ = cheerio.load(content);
      const activePageNum = parseInt($(".pagination .active").text().trim()) || 1;
      const nextPageLink = $(`.pagination a`).filter((_, el) => {
        return $(el).text().trim() === String(activePageNum + 1);
      });
      
      if (nextPageLink.length > 0) {
        const nextUrl = nextPageLink.attr("href");
        if (nextUrl) {
          const absoluteUrl = this.makeAbsoluteUrl(nextUrl);
          await this.page.goto(absoluteUrl, { waitUntil: "networkidle2", timeout: 30000 });
          return true;
        }
      }
    } catch (error) {
      this.log("warn", "No more pages or pagination error");
    }

    return false;
  }
}

export const scraper = new MarhamScraper();
