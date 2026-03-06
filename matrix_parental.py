import argparse
import json
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape
from cinemagoerng import web as imdb

parser = argparse.ArgumentParser(description="Generate a Jellyfin .nfo file with IMDb parental guide data.")
parser.add_argument("imdb_id", help="IMDb title ID, e.g. tt0133093")
parser.add_argument("--name", help="Output filename (without extension). Defaults to '{Title} ({Year})'", default=None)
args = parser.parse_args()

IMDB_ID = args.imdb_id
if not re.fullmatch(r"tt\d{7,8}", IMDB_ID):
    print(f"Error: '{IMDB_ID}' doesn't look like a valid IMDb ID (expected format: tt0133093)", file=sys.stderr)
    sys.exit(1)

print(f"Fetching data for {IMDB_ID}...")
title = imdb.get_title(imdb_id=IMDB_ID)
imdb.set_parental_guide(title)

ADVISORY_MAP = [
    ("nudity",      "sexAndNudity"),
    ("violence",    "violenceAndGore"),
    ("profanity",   "profanity"),
    ("alcohol",     "alcoholDrugsSmoking"),
    ("frightening", "frighteningIntenseScenes"),
]

def advisory_to_dict(section):
    votes = vars(section.votes).copy() if section.votes else {}
    items = [d.text for d in section.details] if section.details else []
    return {"status": section.status, "votes": votes, "items": items}

cert = title.certification
guide = {
    "parentalGuide": {
        "mpaRating": {
            "rating": cert.mpa_rating,
            "reason": cert.mpa_rating_reason,
        },
    }
}

for attr, key in ADVISORY_MAP:
    section = getattr(title.advisories, attr, None)
    if section is not None:
        guide["parentalGuide"][key] = advisory_to_dict(section)

studio_json = json.dumps(guide, indent=2, ensure_ascii=False)

xml_output = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    "<movie>\n"
    f"  <imdbid>{IMDB_ID}</imdbid>\n"
    f"  <title>{escape(title.title)}</title>\n"
    f"  <year>{title.year}</year>\n"
    "\n"
    "  <!-- PARENTAL GUIDE DATA STORED IN STUDIO TAG -->\n"
    f"  <studio>{studio_json}</studio>\n"
    "</movie>"
)

# Determine output filename
if args.name:
    filename = args.name
else:
    safe_title = re.sub(r'[\\/*?:"<>|]', "", title.title)
    filename = f"{safe_title} ({title.year})"

output_path = Path(filename).with_suffix(".nfo")
output_path.write_text(xml_output, encoding="utf-8")
print(f"Saved: {output_path}")
