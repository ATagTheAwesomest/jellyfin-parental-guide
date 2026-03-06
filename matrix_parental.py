import json
from xml.sax.saxutils import escape
from cinemagoerng import web as imdb

IMDB_ID = "tt0133093"  # The Matrix

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

print(xml_output)
