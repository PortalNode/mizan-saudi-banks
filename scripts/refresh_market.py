"""Build a GitHub Pages market snapshot using a server-side SAHMK API key.

Only the site artifact is published. The key is never written to the page.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import time
import argparse
from getpass import getpass
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
BANKS_PATH = ROOT / "site/data/banks.json"
OUTPUT_PATH = ROOT / "site/data/market.json"
API_ROOT = "https://api.sahmk.sa/api/v1"


class ProviderError(RuntimeError):
    def __init__(self, status: int, api_code: str | None, path: str):
        self.status = status
        self.api_code = api_code
        suffix = f" ({api_code})" if api_code else ""
        super().__init__(f"HTTP {status}{suffix} from SAHMK for {path}")


def positive(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def fetch_json(path: str, key: str) -> dict:
    request = Request(f"{API_ROOT}{path}", headers={"X-API-Key": key, "Accept": "application/json"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(1 + attempt * 2)
                continue
            try:
                payload = json.load(error)
                api_code = payload.get("error", {}).get("code")
                if not isinstance(api_code, str) or not re.fullmatch(r"[A-Z_]{1,40}", api_code):
                    api_code = None
            except (ValueError, AttributeError, TypeError):
                api_code = None
            raise ProviderError(error.code, api_code, path) from error
        except URLError as error:
            if attempt < 2:
                time.sleep(1 + attempt * 2)
                continue
            raise RuntimeError(f"Network error from SAHMK for {path}: {error.reason}") from error
    raise AssertionError("unreachable")


def build_snapshot(banks: list[dict], key: str, fetch=fetch_json, pause=time.sleep) -> dict:
    generated_at = datetime.now(timezone.utc).isoformat()
    if not key:
        return {
            "schemaVersion": 1,
            "status": "unconfigured",
            "provider": "SAHMK",
            "generatedAt": generated_at,
            "banks": {},
            "errors": ["SAHMK_API_KEY is not configured; market values have not been fetched."],
        }
    records: dict[str, dict] = {}
    errors: list[str] = []
    for index, bank in enumerate(banks):
        symbol = bank["symbol"]
        if index:
            pause(7)
        try:
            quote = fetch(f"/quote/{symbol}/", key)
            if str(quote.get("symbol")) != symbol:
                raise RuntimeError("quote symbol mismatch")
        except RuntimeError as error:
            quote = {}
            errors.append(f"{symbol} quote: {error}")
        if not positive(quote.get("price")):
            errors.append(f"{symbol} quote: price unavailable")
        records[symbol] = {
            "price": quote.get("price") if positive(quote.get("price")) else None,
            "quoteUpdatedAt": quote.get("updated_at"),
            "isDelayed": quote.get("is_delayed"),
            "source": "SAHMK",
        }
    return {
        "schemaVersion": 1,
        "status": "partial" if errors else "ready",
        "provider": "SAHMK",
        "providerUrl": "https://www.sahmk.sa/en/developers/docs/getting-started",
        "accessTier": "single_quotes",
        "generatedAt": generated_at,
        "banks": records,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh the local SAHMK market snapshot")
    parser.add_argument("--prompt", action="store_true", help="Ask for the API key without echoing it")
    args = parser.parse_args()
    key = os.environ.get("SAHMK_API_KEY", "")
    if args.prompt and not key:
        key = getpass("Sahmk API key (hidden input): ")
    payload = json.loads(BANKS_PATH.read_text(encoding="utf-8"))
    snapshot = build_snapshot(payload["banks"], key)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT_PATH)
    print(f"Market snapshot: {snapshot['status']}; {len(snapshot['banks'])} banks; {len(snapshot['errors'])} notices")
    for notice in snapshot["errors"]:
        print(f"- {notice}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
