import type { Express } from "express";
import { createServer, type Server } from "http";
import { scraper } from "./scraper";
import { startScraperRequestSchema } from "@shared/schema";

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

  // Start scraper
  app.post("/api/scraper/start", async (req, res) => {
    try {
      const config = startScraperRequestSchema.parse(req.body);
      
      // Start scraper in background
      scraper.start(config).catch((error) => {
        console.error("Scraper error:", error);
      });
      
      res.json({ message: "Scraper started", config });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Failed to start scraper" 
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

  return httpServer;
}
