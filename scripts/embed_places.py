#!/usr/bin/env python3
"""Write embedded-places.js from data/places.json for offline / iPhone file 访问回退。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "places.json"
OUT = ROOT / "embedded-places.js"


def main() -> int:
    if not SRC.is_file():
        print(f"Missing {SRC}")
        return 1
    with SRC.open(encoding="utf-8") as f:
        data = json.load(f)
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    text = (
        "/** Generated from data/places.json — run: python3 scripts/embed_places.py */\n"
        f"window.__PLACES_EMBED__ = {body};\n"
    )
    OUT.write_text(text, encoding="utf-8")
    n = len(data.get("places", [])) if isinstance(data, dict) else 0
    print(f"Wrote {OUT} ({n} places)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
