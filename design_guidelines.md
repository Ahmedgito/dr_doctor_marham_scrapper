# Project Assessment

This project is a **backend web scraper** focused on data extraction from Marham.pk. It does not require visual design guidelines as it has no user interface component.

## Project Type
- **Backend Data Extraction Tool**: Python/Node.js script
- **Output**: Structured JSON data
- **No UI Required**: Command-line execution with console logging

## If UI Monitoring is Desired (Optional Addition)

Should you want to add a monitoring dashboard later, here are minimal guidelines:

### Layout
- Single-page dashboard with real-time scraping status
- Three-column layout (lg:grid-cols-3):
  - Left: Progress metrics (hospitals processed, doctors scraped)
  - Center: Live activity log (scrollable feed)
  - Right: Data preview/export controls

### Typography
- Use system fonts for performance (font-sans)
- Spacing: Consistent use of p-4, p-6, gap-4

### Components
- Progress bars showing scraping completion
- Status badges (Running/Paused/Complete)
- Data table preview with pagination
- Export button (Download JSON)
- Start/Stop/Pause controls

### Colors
None specified - to be determined if UI is implemented

---

**Recommendation**: Proceed with the scraper implementation first. Add monitoring UI only if needed for production use.