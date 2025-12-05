import { z } from "zod";

// Doctor data schema
export const doctorSchema = z.object({
  name: z.string(),
  specialty: z.string(),
  qualification: z.string(),
  experience: z.string(),
  fees: z.string(),
  reviews: z.string(),
  satisfaction: z.string().optional(),
  profileUrl: z.string().optional(),
  otherHospitals: z.array(z.object({
    name: z.string(),
    address: z.string(),
    fee: z.string().optional(),
  })),
});

export type Doctor = z.infer<typeof doctorSchema>;

// Hospital data schema
export const hospitalSchema = z.object({
  hospitalName: z.string(),
  hospitalAddress: z.string(),
  hospitalUrl: z.string(),
  doctors: z.array(doctorSchema),
});

export type Hospital = z.infer<typeof hospitalSchema>;

// Scraper configuration schema
export const scraperConfigSchema = z.object({
  startUrl: z.string().default("https://www.marham.pk/hospitals/karachi"),
  maxHospitals: z.number().optional(),
  maxDoctorsPerHospital: z.number().optional(),
  delayBetweenRequests: z.number().default(2000),
  selectors: z.object({
    hospitalCard: z.string().default("div.row.shadow-card"),
    hospitalName: z.string().default("a.hosp_list_selected_hosp_name"),
    hospitalAddress: z.string().default("p.text-sm"),
    doctorCard: z.string().default("div.row.shadow-card"),
    doctorName: z.string().default("h3.mb-0"),
    doctorSpecialty: z.string().default("p.text-sm:contains('Urologist'), p.mb-0.text-sm"),
    doctorQualification: z.string().default("p.text-sm"),
    doctorExperience: z.string().default("p.text-bold.text-sm"),
    doctorReviews: z.string().default("p.text-bold.text-sm.text-golden"),
    doctorFees: z.string().default("p.mb-0.price.text-sm.text-bold"),
    otherHospitals: z.string().default("div.product-card.card-hospital"),
    pagination: z.string().default("a.pagination-link"),
  }),
});

export type ScraperConfig = z.infer<typeof scraperConfigSchema>;

// Scraper status schema
export const scraperStatusSchema = z.object({
  status: z.enum(["idle", "running", "paused", "completed", "error"]),
  currentHospital: z.string().optional(),
  currentDoctor: z.string().optional(),
  hospitalsProcessed: z.number().default(0),
  totalHospitals: z.number().default(0),
  doctorsScraped: z.number().default(0),
  errors: z.array(z.object({
    timestamp: z.string(),
    message: z.string(),
    context: z.string().optional(),
  })).default([]),
  logs: z.array(z.object({
    timestamp: z.string(),
    level: z.enum(["info", "warn", "error", "success"]),
    message: z.string(),
  })).default([]),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export type ScraperStatus = z.infer<typeof scraperStatusSchema>;

// Scraper results schema
export const scraperResultsSchema = z.object({
  hospitals: z.array(hospitalSchema),
  metadata: z.object({
    scrapedAt: z.string(),
    totalHospitals: z.number(),
    totalDoctors: z.number(),
    duration: z.string().optional(),
  }),
});

export type ScraperResults = z.infer<typeof scraperResultsSchema>;

// API request/response types
export const startScraperRequestSchema = scraperConfigSchema.partial();
export type StartScraperRequest = z.infer<typeof startScraperRequestSchema>;

// Legacy user schema (keeping for compatibility)
export const users = {
  id: "",
  username: "",
  password: "",
};

export const insertUserSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = { id: string; username: string; password: string };
