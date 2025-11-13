# Clinic Day Planner (Self-Hosted, No External Libraries)

A clean, print-friendly day planner for medical clinics. Up to 15 patient columns (adaptive), 30-minute slots from 08:00–18:00 (configurable), drag-and-drop & resize events, and assign professionals by dragging tags onto events. Plan up to 7 days ahead. Designed to be hosted on your own server (Plesk, PHP).

## Features
- Drag to move events across time and between patient columns
- Resize from top/bottom to change duration (15-minute snap if you change slotMinutes)
- Create/edit/delete events (double-click empty slot or use “+ New Event”)
- Assign professionals: drag a staff tag onto an event; labels appear on the event
- 30-min slots from 08:00–18:00 (change in `index.html > PLANNER_CONFIG`)
- Up to 15 patients (sidebar), add/remove/rename
- 7-day planning horizon (can adjust in config)
- Print A4-friendly view per day (use “Print Day” button or browser print)
- Minimal PHP backend writes JSON files to `/data`

## Files
- `index.html` – app shell + config
- `planner.css` – styles and print rules
- `planner.js` – planner logic (drag, resize, staff assign, CRUD)
- `backend/api.php` – minimal PHP backend for persistence
- `data/` – JSON storage (created automatically)
- `README.md` – this guide

## Quick Start (Plesk)
1. In Plesk, create a domain/subdomain or use an existing one.
2. Set **Document root** to a folder (e.g., `httpdocs/clinic-planner`).
3. Upload all files/folders from this package to that directory, preserving structure:
   ```
   clinic-planner/
     index.html
     planner.css
     planner.js
     backend/api.php
     data/ (empty or keep existing JSON files)
   ```
4. Ensure PHP is enabled (PHP 8.0+ recommended). No database needed.
5. Make sure the `data/` directory is writable by the web server user. In Plesk:
   - Go to **Files** > select `data/` > **Change Permissions** > allow write for the site user.
6. Visit your site (e.g., `https://yourdomain/clinic-planner/`). The planner should load.
7. Click **+ Patient** to add up to 15 patients.
8. Click **+ Staff** to add professionals (drag their tags onto events to assign).
9. Double-click on an empty time cell to create an event. Drag to move/resize.

## Configuration
In `index.html`, you can change the configuration block:
```html
<script>
window.PLANNER_CONFIG = {
  startHour: 8,       // 8:00
  endHour: 18,        // 18:00
  slotMinutes: 30,    // slot size
  maxPatients: 15,
  horizonDays: 7,
  defaultDuration: 30,
  backendUrl: "backend/api.php"
};
</script>
```
- To extend working hours, change `startHour`/`endHour`.
- To use 15-minute slots, set `slotMinutes: 15` (drag snap adjusts automatically).

## Printing (A4)
- Click **Print Day** (or press `Ctrl/Cmd + P`).
- The stylesheet includes `@page { size: A4 }` for clean printing.
- Each print is for the current day’s view. Change the date with the arrows/date picker.

## Two-Layer Drag-and-Drop
1. **Events**: drag & drop to change time/column; resize from edges.
2. **Professionals**: drag a staff tag from the sidebar and drop it on an event to assign. Assigned names appear as chips on the event.

## Minimal Data Model
- Patients: `{ id, name }`
- Staff: `{ id, name }`
- Events: `{ id, title, color, patientId, date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM", staff: [staffId, ...] }`

Data is stored in `data/patients.json`, `data/staff.json`, `data/events.json` (events keyed by date).

## Notes
- This build uses **no paid libraries** and is fully self-hosted.
- For multi-user access or audit history, consider adding authentication and using a database later.
- Tested in latest Chrome/Edge. Safari/Firefox should work; adjust CSS if needed.

## Demo Video (How to record)
Use any screen recorder (e.g., Windows Game Bar, macOS QuickTime) and capture:
1. Add patients and staff.
2. Create an event via double-click; edit color and duration.
3. Drag event to another patient column; resize duration.
4. Drag a staff tag onto the event.
5. Change the date to tomorrow (within 7-day horizon).
6. Click **Print Day** and show the print preview (A4).

That’s it!