#!/usr/bin/env python3
"""
Batch-geocode places in data/places.json using Nominatim (OpenStreetMap).
Usage policy: https://operations.osmfoundation.org/policies/nominatim/
Run sparingly; 1s delay between requests. Append "San Diego CA USA" to queries.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from geopy.exc import GeocoderTimedOut, GeocoderUnavailable
from geopy.geocoders import Nominatim

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "places.json"
SUFFIX = "San Diego California USA"


def main() -> int:
    if not DATA.is_file():
        print(f"Missing {DATA}. Copy data/places.example.json to data/places.json first.")
        return 1

    with DATA.open(encoding="utf-8") as f:
        payload = json.load(f)

    places = payload.get("places")
    if not isinstance(places, list):
        print("Invalid JSON: expected top-level 'places' array.")
        return 1

    geolocator = Nominatim(
        user_agent="wheretoeat_tool/1.0 (personal map; contact: local)",
        timeout=15,
    )

    updated = 0
    for i, p in enumerate(places):
        if not isinstance(p, dict):
            continue
        lat, lng = p.get("lat"), p.get("lng")
        if lat is not None and lng is not None:
            try:
                float(lat)
                float(lng)
                continue
            except (TypeError, ValueError):
                pass

        q = (p.get("query") or p.get("address") or p.get("name") or "").strip()
        if not q:
            print(f"[{i}] skip: no query/address/name")
            continue

        full = f"{q}, {SUFFIX}"
        print(f"[{i}] geocoding: {full[:80]}...")

        location = None
        for attempt in range(3):
            try:
                location = geolocator.geocode(full)
                break
            except (GeocoderTimedOut, GeocoderUnavailable) as e:
                print(f"    retry {attempt + 1}: {e}")
                time.sleep(2 * (attempt + 1))

        time.sleep(1.1)

        if location is None:
            print(f"    -> not found")
            continue

        p["lat"] = round(location.latitude, 6)
        p["lng"] = round(location.longitude, 6)
        updated += 1
        print(f"    -> {p['lat']}, {p['lng']}")

    with DATA.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Done. Updated coordinates for {updated} place(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
