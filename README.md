# Marham.pk Scraper Dashboard

A focused internal tool for scraping structured hospital and doctor data from **[Marham.pk](https://www.marham.pk)** and exploring it through a polished web dashboard.

---

## Overview

This project combines a **headless browser scraper** with a **modern React dashboard** to give you a clean control panel for collecting and inspecting medical provider data.

The application is designed for:

- **Operational data collection**
  - Scrape hospitals and their associated doctors from Marham.pk.
  - Capture key doctor details such as specialty, qualification, experience, fees, reviews, and additional hospital affiliations.
- **Quick analysis & sanity checks**
  - Visual progress indicators while scraping.
  - Live log stream so you can see what the scraper is doing in real time.
  - Lightweight preview of scraped hospitals and doctors.
- **Data export**
  - Export complete results as **JSON**.
  - Export **deduplicated doctors** as CSV.
  - Export **hospital + doctor rows** as CSV.

> This project is meant as a private/internal dashboard, not a public-facing consumer app.

---

## High-Level Architecture

- **Express API server**
  - Hosts REST endpoints for controlling the scraper (start, pause, resume, stop).
  - Serves status, results, and export endpoints (JSON and CSV).
  - Mounts the React client in development via Vite and serves the built client in production.

- **Puppeteer + Cheerio scraper**
  - Uses **Puppeteer** to drive a headless Chromium instance.
  - Uses **Cheerio** to parse HTML and extract structured data from each page.
  - Supports configurable:
    - Start URL (e.g. hospital listing page for a specific city).
    - Maximum number of hospitals.
    - Maximum number of doctors per hospital.
    - Delay between requests to be gentle on the remote site.
  - Handles pagination, multiple doctors per hospital, and cross-hospital doctor relationships.

- **React dashboard (Vite + Tailwind)**
  - Single-page interface built with **React**, **Wouter**, **TailwindCSS**, and **shadcn-style UI components**.
  - Sections for:
    - Scraper controls
    - Configuration
    - Scheduler
    - Live logs
    - Data preview
  - Auth gate with a lightweight login screen to keep the dashboard private.

- **Scheduler**
  - Optional scheduler to trigger scraping at a fixed interval.
  - Exposed via API and surfaced in the dashboard UI.

---

## Core Features

- **Marham.pk hospital & doctor scraping**
  - Extracts hospitals with their address and profile URL.
  - Extracts doctors with name, specialty, qualifications, years of experience, fee, reviews, and satisfaction.
  - Collects other hospitals where a doctor practices.

- **Progress & monitoring**
  - Real-time status (idle / running / paused / completed / error).
  - Current hospital and doctor being processed.
  - Counts of hospitals processed and doctors scraped.
  - Time-based metadata (start time, duration, etc.).

- **Data views**
  - Raw hospital-level view: hospitals and their full doctor lists.
  - Deduplicated doctor view: one row per doctor with all affiliated hospitals.

- **Exports**
  - → JSON file with full structure.
  - → CSV of deduplicated doctors.
  - → CSV of hospitals with doctors.

---

## Tech Stack

- **Backend**
  - Node.js
  - Express
  - Puppeteer
  - Cheerio

- **Frontend**
  - React 18
  - Vite
  - Wouter (routing)
  - TailwindCSS + custom UI components
  - React Query (@tanstack/react-query)

- **Shared**
  - Type-safe schemas with **Zod** in `shared/schema.ts`.
  - Shared types/models for scraper config, status, results, and scheduler.

---

## Running the Application

Once dependencies are installed, the entire application (API + frontend dashboard) is served by a single command from the project root:

```bash
npx tsx server/index.ts
```

- The Express server starts and attaches Vite in development mode.
- The dashboard and APIs are available on the configured port (by default **http://localhost:5000**).

---

## Intended Use

This project is intended as a **controlled internal dashboard** for:

- Research teams
- Data engineers
- Founders and operators exploring healthcare provider data

It is not designed as a public-facing consumer product, but as a focused tool to:

- Run targeted scrapes against Marham.pk.
- Monitor and tune scraping behavior.
- Inspect and export high-quality structured data for downstream analysis.
