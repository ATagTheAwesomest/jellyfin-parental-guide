# jellyfin-parental-guide

Pulls IMDb parental guide data and embeds it into Jellyfin-compatible `.nfo` files, then surfaces it inside the Jellyfin web UI via injected CSS, HTML, and JavaScript.

---

## How it works

### 1. `matrix_parental.py` — NFO generator

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

---

### 2. Web UI injection (CSS + HTML + JS)

Three files work together to render parental guide data inside the Jellyfin web interface:

| File | Purpose | Injection method |
|---|---|---|
| `InjectCSS.css` | All styling — modal, badges, category sections, hover states | Jellyfin **Dashboard → Branding → Custom CSS** |
| `InjectHTML.html` | Static modal markup (hidden by default) | [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) plugin (HTML injection) |
| `InjectJS.js` | Logic — parses guide JSON, populates the modal, builds rating row & badges, wires events | [Jellyfin JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) plugin |

**What it does:**
1. Reads the JSON embedded in the `<studio>` field of the title's metadata
2. Injects an **MPA rating row** and **colour-coded content warning badges** directly into the detail page (Sex & Nudity, Violence, Language, Drugs, Intense Scenes)
3. Opens a **full parental guide modal** on click, showing all detail items per category, a link to the IMDb parental guide page, and expand/collapse controls

Severity colours: `None` = green · `Mild` = light green · `Moderate` = amber · `Severe` = red

---

## Requirements

- Python 3.11+
- [`cinemagoerng`](https://pypi.org/project/cinemagoerng/) (`pip install cinemagoerng`)
- Jellyfin server with a library that uses `.nfo` metadata
- [File Transformation](https://github.com/oddstr13/jellyfin-plugin-file-transformation) plugin (for HTML injection)
- [Jellyfin JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) plugin (for JS injection)

### Installing the web UI components

#### CSS (via Jellyfin Branding)

1. In Jellyfin, go to **Dashboard → General → Branding**
2. Paste the contents of `InjectCSS.css` into the **Custom CSS** field
3. Save

#### HTML (via File Transformation plugin)

1. Install the [File Transformation](https://github.com/oddstr13/jellyfin-plugin-file-transformation) plugin on your Jellyfin server
2. Configure it to inject the contents of `InjectHTML.html` into pages served by the web UI
3. The modal markup will be present in the DOM but hidden (`display: none`) until the JS activates it

#### JS (via JavaScript Injector plugin)

1. Install the [Jellyfin JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) plugin on your Jellyfin server
2. In Jellyfin, go to **Dashboard → JavaScript Injector**
3. Add a new script entry and paste the contents of `InjectJS.js`
4. Save — the script will be active on all detail pages immediately

> **Load order:** The CSS and HTML must be present in the page before the JS runs. The JS looks for `#parentalGuideModal` in the DOM on startup.

---

## Usage

```powershell
# Auto-named output → "The Matrix (1999).nfo"
python matrix_parental.py tt0133093

# Custom output filename → "my_movie.nfo"
python matrix_parental.py tt0133093 --name "my_movie"
```

The script will:
- Fetch the title metadata and full parental guide from IMDb
- Auto-name the file `{Title} ({Year}).nfo` if `--name` is not provided
- Strip any characters illegal in filenames from the title
- Write the `.nfo` to the current directory

---

## Limitations

- **Spoilers are excluded from the `.nfo` file.** The IMDb parental guide includes items flagged as spoilers. These are intentionally stripped during export to avoid accidental reveals. The Jellyfin UI modal displays a notice directing users to the full IMDb parental guide page for the complete list.

---

## Roadmap

- [x] Accept IMDb ID as a CLI argument
- [x] Auto-name output file as `{Title} ({Year}).nfo`
- [ ] Batch processing for an entire library folder
- [ ] Auto-match existing video files to IMDb IDs via filename
- [ ] Jellyfin plugin to run fetching server-side
