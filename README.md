# jellyfin-parental-guide

Pulls IMDb parental guide data and embeds it into Jellyfin-compatible `.nfo` files, then surfaces it inside the Jellyfin web UI via a userscript.

---

## How it works

### 1. `matrix_parental.py` — NFO generator (example)

Fetches a title's full parental guide from IMDb using the [`cinemagoerng`](https://github.com/cinemagoerng/cinemagoerng) library and writes it as a Jellyfin-compatible XML `.nfo` file.

The parental guide JSON is embedded inside the `<studio>` tag — a writable free-text field that Jellyfin preserves and exposes in its UI.

**Output structure:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<movie>
  <imdbid>tt0133093</imdbid>
  <title>The Matrix</title>
  <year>1999</year>

  <!-- PARENTAL GUIDE DATA STORED IN STUDIO TAG -->
  <studio>{
  "parentalGuide": {
    "mpaRating": { "rating": "R", "reason": "..." },
    "sexAndNudity":            { "status": "Mild",     "votes": {...}, "items": [...] },
    "violenceAndGore":         { "status": "Moderate", "votes": {...}, "items": [...] },
    "profanity":               { "status": "Moderate", "votes": {...}, "items": [...] },
    "alcoholDrugsSmoking":     { "status": "Mild",     "votes": {...}, "items": [...] },
    "frighteningIntenseScenes":{ "status": "Moderate", "votes": {...}, "items": [...] }
  }
}</studio>
</movie>
```

**Planned:** accept any IMDb ID as input argument so it can be run on any title.

---

### 2. `script.js` — Jellyfin userscript

A script injected via the [Jellyfin JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) plugin, which runs on the Jellyfin web UI detail page.

It:
1. Reads the JSON embedded in the `<studio>` field of the title's metadata
2. Injects an **MPA rating row** and **colour-coded content warning badges** directly into the detail page (Sex & Nudity, Violence, Language, Drugs, Intense Scenes)
3. Opens a **full parental guide modal** on click, showing all detail items per category with vote breakdowns, a link to the IMDb parental guide page, and expand/collapse controls

Severity colours: `None` = green · `Mild` = light green · `Moderate` = amber · `Severe` = red

---

## Requirements

- Python 3.11+
- [`cinemagoerng`](https://pypi.org/project/cinemagoerng/) (`pip install cinemagoerng`)
- Jellyfin server with a library that uses `.nfo` metadata
- [Jellyfin JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) plugin installed on your Jellyfin server

### Installing `script.js`

1. Install the [Jellyfin JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) plugin on your Jellyfin server
2. In Jellyfin, go to **Dashboard → JavaScript Injector**
3. Add a new script entry and paste the contents of `script.js`
4. Save — the script will be active on all detail pages immediately

---

## Usage

```powershell
# Run the example (The Matrix)
python matrix_parental.py
```

Pipe stdout into an `.nfo` file next to your video:

```powershell
python matrix_parental.py > "The Matrix (1999).nfo"
```

---

## Roadmap

- [ ] Accept IMDb ID as a CLI argument (`python nfo_gen.py tt0133093`)
- [ ] Batch processing for an entire library folder
- [ ] Auto-match existing video files to IMDb IDs via filename
- [ ] Jellyfin plugin to run fetching server-side
