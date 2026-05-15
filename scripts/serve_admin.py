#!/usr/bin/env python3
"""Serve the map and provide a local admin API for editing place data."""
from __future__ import annotations

import argparse
import json
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "places.json"
EMBEDDED = ROOT / "embedded-places.js"


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    tmp.replace(path)


def write_embedded_places(payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    text = (
        "/** Generated from data/places.json — run: python3 scripts/embed_places.py */\n"
        f"window.__PLACES_EMBED__ = {body};\n"
    )
    EMBEDDED.write_text(text, encoding="utf-8")


def delete_place_from_files(place_id: str) -> dict[str, Any]:
    with DATA.open(encoding="utf-8") as f:
        payload = json.load(f)

    places = payload.get("places")
    if not isinstance(places, list):
        raise ValueError("Invalid data/places.json: expected top-level 'places' array")

    kept = [
        place
        for place in places
        if not (isinstance(place, dict) and str(place.get("id", "")) == place_id)
    ]
    if len(kept) == len(places):
        raise KeyError(place_id)

    payload["places"] = kept
    write_json_atomic(DATA, payload)
    write_embedded_places(payload)
    return {"deleted": len(places) - len(kept), "remaining": len(kept)}


class AdminHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/api/places/delete":
            self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8") or "{}")
            place_id = str(payload.get("id", "")).strip()
            if not place_id:
                self.send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"ok": False, "error": "Missing place id"},
                )
                return

            result = delete_place_from_files(place_id)
        except json.JSONDecodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Invalid JSON"})
            return
        except KeyError:
            self.send_json(
                HTTPStatus.NOT_FOUND,
                {"ok": False, "error": "Place id not found"},
            )
            return
        except Exception as exc:
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"ok": False, "error": str(exc)},
            )
            return

        self.send_json(HTTPStatus.OK, {"ok": True, **result})


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Serve wheretoeat_tool with local file-editing APIs."
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), AdminHandler)
    print(f"Serving {ROOT} at http://{args.host}:{args.port}")
    print("Delete API enabled: POST /api/places/delete")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
