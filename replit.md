# Marham.pk Web Scraper

A comprehensive web scraper that extracts detailed hospital and doctor information from Marham.pk with a real-time monitoring dashboard.

## Overview

This application scrapes hospital and doctor data from Marham.pk starting from the Karachi hospitals page. It includes a beautiful dashboard for controlling the scraper, viewing progress, and exporting data.

## Project Structure

```
├── client/                    # Frontend React application
│   └── src/
│       ├── pages/
│       │   └── dashboard.tsx  # Main scraper dashboard
│       ├── components/ui/     # Shadcn UI components
│       └── App.tsx            # Main app component
├── server/                    # Backend Express server
│   ├── scraper.ts            # Puppeteer-based scraper logic
│   ├── routes.ts             # API endpoints
│   └── index.ts              # Server entry point
└── shared/
    └── schema.ts             # Shared TypeScript types/schemas
```

## Features

- **Scraper Controls**: Start, pause, resume, and stop scraping
- **Real-time Progress**: Live progress tracking with hospital/doctor counts
- **Live Logs**: Real-time activity feed showing scraping status
- **Data Preview**: View scraped hospitals and doctors in expandable cards
- **JSON Export**: Download scraped data as structured JSON file
- **Configurable Settings**: Adjust URLs, limits, and delays

## Data Fields Scraped

For each doctor:
- Hospital name & address
- Doctor name
- Doctor fee
- Doctor reviews
- Doctor experience
- Doctor specialty
- Doctor qualification
- Other hospitals where doctor provides services

## API Endpoints

- `GET /api/scraper/status` - Get current scraper status
- `GET /api/scraper/results` - Get scraped data
- `POST /api/scraper/start` - Start scraping with optional config
- `POST /api/scraper/pause` - Pause scraping
- `POST /api/scraper/resume` - Resume scraping
- `POST /api/scraper/stop` - Stop scraping
- `GET /api/scraper/export` - Download data as JSON file

## Technologies

- **Frontend**: React, TanStack Query, Tailwind CSS, Shadcn UI
- **Backend**: Express, Puppeteer, Cheerio
- **Language**: TypeScript
- **Validation**: Zod

## Running the Application

The application runs on port 5000. Access the dashboard at the root URL (/).

## Output Format

```json
{
  "hospitals": [
    {
      "hospitalName": "Hospital Name",
      "hospitalAddress": "Address",
      "hospitalUrl": "https://...",
      "doctors": [
        {
          "name": "Dr. Name",
          "specialty": "Specialty",
          "qualification": "MBBS, MS",
          "experience": "20 Yrs",
          "fees": "Rs. 1,500",
          "reviews": "158",
          "otherHospitals": [
            {
              "name": "Other Hospital",
              "address": "Address",
              "fee": "Rs. 2,000"
            }
          ]
        }
      ]
    }
  ],
  "metadata": {
    "scrapedAt": "2025-12-05T...",
    "totalHospitals": 10,
    "totalDoctors": 150,
    "duration": "5m 30s"
  }
}
```
