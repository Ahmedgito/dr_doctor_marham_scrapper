import type { Express } from "express";
import { createServer, type Server } from "http";
import { scraper } from "./scraper";
import { scheduler } from "./scheduler";
import { startScraperRequestSchema, schedulerConfigSchema } from "@shared/schema";

// Helper function to escape CSV fields
function escapeCsvField(field: string): string {
  if (!field) return '""';
  const escaped = field.replace(/"/g, '""');
  if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
    return `"${escaped}"`;
  }
  return escaped;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Get scraper status
  app.get("/api/scraper/status", (req, res) => {
    try {
      const status = scraper.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get status" 
      });
    }
  });

  // Get scraper results
  app.get("/api/scraper/results", (req, res) => {
    try {
      const results = scraper.getResults();
      res.json(results);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get results" 
      });
    }
  });

  // Get extended results with deduplication
  app.get("/api/scraper/results/extended", (req, res) => {
    try {
      const results = scraper.getExtendedResults();
      res.json(results);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get extended results" 
      });
    }
  });

  // Start scraper
  app.post("/api/scraper/start", async (req, res) => {
    try {
      const config = startScraperRequestSchema.parse(req.body);
      
      // Start scraper in background
      scraper.start(config, false).catch((error) => {
        console.error("Scraper error:", error);
      });
      
      res.json({ message: "Scraper started", config });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Failed to start scraper" 
      });
    }
  });

  // Resume scraper from saved state
  app.post("/api/scraper/resume-from-save", async (req, res) => {
    try {
      const savedState = scraper.getSavedState();
      if (!savedState.hasState) {
        return res.status(400).json({ error: "No saved state to resume from" });
      }
      
      // Resume scraper in background
      scraper.start(undefined, true).catch((error) => {
        console.error("Scraper resume error:", error);
      });
      
      res.json({ message: "Scraper resumed from saved state", savedState });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Failed to resume scraper" 
      });
    }
  });

  // Get saved state info
  app.get("/api/scraper/saved-state", (req, res) => {
    try {
      const savedState = scraper.getSavedState();
      res.json(savedState);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get saved state" 
      });
    }
  });

  // Clear saved state
  app.post("/api/scraper/clear-state", (req, res) => {
    try {
      scraper.clearSavedState();
      res.json({ message: "Saved state cleared" });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to clear saved state" 
      });
    }
  });

  // Pause scraper
  app.post("/api/scraper/pause", (req, res) => {
    try {
      scraper.pause();
      res.json({ message: "Scraper paused" });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to pause scraper" 
      });
    }
  });

  // Resume scraper
  app.post("/api/scraper/resume", (req, res) => {
    try {
      scraper.resume();
      res.json({ message: "Scraper resumed" });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to resume scraper" 
      });
    }
  });

  // Stop scraper
  app.post("/api/scraper/stop", (req, res) => {
    try {
      scraper.stop();
      res.json({ message: "Scraper stopped" });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to stop scraper" 
      });
    }
  });

  // Export results as JSON file
  app.get("/api/scraper/export", (req, res) => {
    try {
      const results = scraper.getResults();
      
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition", 
        `attachment; filename=marham-data-${new Date().toISOString().split("T")[0]}.json`
      );
      
      res.json(results);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to export data" 
      });
    }
  });

  // Export results as CSV file
  app.get("/api/scraper/export/csv", (req, res) => {
    try {
      const results = scraper.getExtendedResults();
      
      // CSV header
      const headers = [
        "Doctor Name",
        "Specialty", 
        "Qualification",
        "Experience",
        "Reviews",
        "Satisfaction",
        "Profile URL",
        "Hospital Names",
        "Hospital Addresses",
        "Hospital Fees"
      ];
      
      const rows = results.uniqueDoctors.map(doctor => {
        const hospitalNames = doctor.hospitals.map(h => h.name).join("; ");
        const hospitalAddresses = doctor.hospitals.map(h => h.address).join("; ");
        const hospitalFees = doctor.hospitals.map(h => h.fee || "N/A").join("; ");
        
        return [
          escapeCsvField(doctor.name),
          escapeCsvField(doctor.specialty),
          escapeCsvField(doctor.qualification),
          escapeCsvField(doctor.experience),
          escapeCsvField(doctor.reviews),
          escapeCsvField(doctor.satisfaction || ""),
          escapeCsvField(doctor.profileUrl || ""),
          escapeCsvField(hospitalNames),
          escapeCsvField(hospitalAddresses),
          escapeCsvField(hospitalFees)
        ].join(",");
      });
      
      const csv = [headers.join(","), ...rows].join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition", 
        `attachment; filename=marham-doctors-${new Date().toISOString().split("T")[0]}.csv`
      );
      
      res.send(csv);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to export CSV" 
      });
    }
  });

  // Export hospitals as CSV file
  app.get("/api/scraper/export/hospitals-csv", (req, res) => {
    try {
      const results = scraper.getResults();
      
      // CSV header for hospitals with their doctors
      const headers = [
        "Hospital Name",
        "Hospital Address",
        "Hospital URL",
        "Doctor Name",
        "Specialty",
        "Qualification",
        "Experience",
        "Fees",
        "Reviews",
        "Other Hospitals"
      ];
      
      const rows: string[] = [];
      
      for (const hospital of results.hospitals) {
        for (const doctor of hospital.doctors) {
          const otherHospitals = doctor.otherHospitals.map(h => h.name).join("; ");
          rows.push([
            escapeCsvField(hospital.hospitalName),
            escapeCsvField(hospital.hospitalAddress),
            escapeCsvField(hospital.hospitalUrl),
            escapeCsvField(doctor.name),
            escapeCsvField(doctor.specialty),
            escapeCsvField(doctor.qualification),
            escapeCsvField(doctor.experience),
            escapeCsvField(doctor.fees),
            escapeCsvField(doctor.reviews),
            escapeCsvField(otherHospitals)
          ].join(","));
        }
      }
      
      const csv = [headers.join(","), ...rows].join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition", 
        `attachment; filename=marham-hospitals-${new Date().toISOString().split("T")[0]}.csv`
      );
      
      res.send(csv);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to export hospitals CSV" 
      });
    }
  });

  // Get scheduler status
  app.get("/api/scheduler/status", (req, res) => {
    try {
      const status = scheduler.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get scheduler status" 
      });
    }
  });

  // Configure scheduler
  app.post("/api/scheduler/configure", (req, res) => {
    try {
      const config = schedulerConfigSchema.partial().parse(req.body);
      scheduler.configure(config);
      res.json({ message: "Scheduler configured", status: scheduler.getStatus() });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Failed to configure scheduler" 
      });
    }
  });

  // Start scheduler
  app.post("/api/scheduler/start", (req, res) => {
    try {
      const config = schedulerConfigSchema.partial().parse(req.body);
      scheduler.configure({ ...config, enabled: true });
      res.json({ message: "Scheduler started", status: scheduler.getStatus() });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to start scheduler" 
      });
    }
  });

  // Stop scheduler
  app.post("/api/scheduler/stop", (req, res) => {
    try {
      scheduler.configure({ enabled: false });
      res.json({ message: "Scheduler stopped", status: scheduler.getStatus() });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to stop scheduler" 
      });
    }
  });

  // Run scheduler immediately
  app.post("/api/scheduler/run-now", (req, res) => {
    try {
      scheduler.runNow();
      res.json({ message: "Scheduled run triggered", status: scheduler.getStatus() });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to trigger run" 
      });
    }
  });

  // Reset scheduler
  app.post("/api/scheduler/reset", (req, res) => {
    try {
      scheduler.reset();
      res.json({ message: "Scheduler reset", status: scheduler.getStatus() });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to reset scheduler" 
      });
    }
  });

  return httpServer;
}
