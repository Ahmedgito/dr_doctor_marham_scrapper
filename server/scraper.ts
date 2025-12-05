import puppeteer, { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import type { ScraperConfig, ScraperStatus, Hospital, Doctor, ScraperResults } from "@shared/schema";

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

const BASE_URL = "https://www.marham.pk";

class MarhamScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private status: ScraperStatus;
  private config: ScraperConfig;
  private hospitals: Hospital[] = [];
  private isPaused: boolean = false;
  private isStopped: boolean = false;
  private isRunning: boolean = false;

  constructor() {
    this.config = this.getDefaultConfig();
    this.status = this.getInitialStatus();
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

  async start(config?: Partial<ScraperConfig>): Promise<void> {
    if (this.isRunning) {
      throw new Error("Scraper is already running");
    }

    this.config = this.mergeConfig(config || {});
    this.status = {
      ...this.getInitialStatus(),
      status: "running",
      startedAt: new Date().toISOString(),
    };
    this.hospitals = [];
    this.isPaused = false;
    this.isStopped = false;
    this.isRunning = true;

    this.log("info", "Starting Marham.pk scraper...");
    this.log("info", `Target URL: ${this.config.startUrl}`);

    try {
      await this.initBrowser();
      await this.scrapeHospitals();
      
      if (!this.isStopped) {
        this.status.status = "completed";
        this.status.completedAt = new Date().toISOString();
        this.log("success", `Scraping completed! ${this.hospitals.length} hospitals, ${this.status.doctorsScraped} doctors`);
      } else {
        this.status.status = "idle";
        this.log("info", "Scraping was stopped by user");
      }
    } catch (error) {
      this.status.status = "error";
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
    this.log("info", "Stop signal received, finishing current task...");
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

  private async scrapeHospitals(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    const startUrl = this.makeAbsoluteUrl(this.config.startUrl);
    this.log("info", `Navigating to ${startUrl}`);
    await this.page.goto(startUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await this.delay(2000);

    const hospitalLinks = await this.extractHospitalLinks();
    this.status.totalHospitals = this.config.maxHospitals 
      ? Math.min(hospitalLinks.length, this.config.maxHospitals) 
      : hospitalLinks.length;

    this.log("info", `Found ${hospitalLinks.length} hospitals to scrape`);

    const hospitalsToProcess = this.config.maxHospitals 
      ? hospitalLinks.slice(0, this.config.maxHospitals) 
      : hospitalLinks;

    for (let i = 0; i < hospitalsToProcess.length; i++) {
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
      } catch (error) {
        this.addError(
          `Failed to scrape hospital: ${hospitalInfo.name}`,
          error instanceof Error ? error.message : "Unknown error"
        );
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

    const doctors: Doctor[] = [];
    let hasMorePages = true;
    let pageNum = 1;

    while (hasMorePages && !this.isStopped) {
      if (await this.waitForPauseOrStop()) break;

      this.log("info", `Scraping doctors page ${pageNum} for ${hospitalInfo.name}`);
      const pageDoctors = await this.extractDoctorsFromPage();
      
      const limitedDoctors = this.config.maxDoctorsPerHospital
        ? pageDoctors.slice(0, this.config.maxDoctorsPerHospital - doctors.length)
        : pageDoctors;

      doctors.push(...limitedDoctors);
      this.status.doctorsScraped += limitedDoctors.length;

      if (this.config.maxDoctorsPerHospital && doctors.length >= this.config.maxDoctorsPerHospital) {
        break;
      }

      hasMorePages = await this.goToNextPage();
      if (hasMorePages) {
        pageNum++;
        await this.delay(this.config.delayBetweenRequests);
      }
    }

    return {
      hospitalName: hospitalInfo.name,
      hospitalAddress: hospitalInfo.address,
      hospitalUrl: absoluteUrl,
      doctors,
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
