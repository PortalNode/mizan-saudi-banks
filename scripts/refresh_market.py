"""Build the GitHub Pages market snapshot from Yahoo Finance Saudi quotes."""

from __future__ import annotations

import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
BANKS_PATH = ROOT / "site/data/banks.json"
TECHNOLOGY_PATH = ROOT / "site/data/technology.json"
TELECOM_PATH = ROOT / "site/data/telecom.json"
HEALTHCARE_PATH = ROOT / "site/data/healthcare.json"
OUTPUT_PATH = ROOT / "site/data/market.json"
API_ROOT = "https://query1.finance.yahoo.com/v8/finance/chart"


class ProviderError(RuntimeError):
    def __init__(self, status: int, symbol: str):
        self.status = status
        super().__init__(f"Yahoo Finance HTTP {status} for {symbol}")


def positive(value: object) -> bool:
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and value > 0)


def fetch_json(symbol: str) -> dict:
    yahoo_symbol = f"{symbol}.SR"
    request = Request(
        f"{API_ROOT}/{yahoo_symbol}?interval=1d&range=5d",
        headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(1 + attempt * 2)
                continue
            raise ProviderError(error.code, symbol) from error
        except (URLError, TimeoutError) as error:
            if attempt < 2:
                time.sleep(1 + attempt * 2)
                continue
            raise RuntimeError(f"Yahoo Finance network error for {symbol}: {error}") from error
    raise AssertionError("unreachable")


def parse_quote(payload: dict, symbol: str) -> dict:
    try:
        chart = payload["chart"]
        if chart.get("error"):
            raise ValueError("chart returned an error")
        meta = chart["result"][0]["meta"]
        if meta.get("symbol") != f"{symbol}.SR" or meta.get("currency") != "SAR":
            raise ValueError("symbol or currency mismatch")
        price = meta["regularMarketPrice"]
        timestamp = meta["regularMarketTime"]
        if not positive(price) or not positive(timestamp):
            raise ValueError("price or quote time unavailable")
        updated_at = datetime.fromtimestamp(timestamp, timezone.utc).isoformat()
    except (KeyError, IndexError, TypeError, OverflowError, OSError) as error:
        raise ValueError("malformed quote") from error
    return {
        "price": price,
        "quoteUpdatedAt": updated_at,
        # Yahoo labels Saudi quotes as delayed; its chart response does not
        # consistently provide the delay in minutes.
        "isDelayed": True,
        "source": "Yahoo Finance",
    }


def build_snapshot(banks: list[dict], fetch=fetch_json, pause=time.sleep) -> dict:
    records: dict[str, dict] = {}
    errors: list[str] = []
    for index, bank in enumerate(banks):
        symbol = bank["symbol"]
        if index:
            pause(1)
        try:
            records[symbol] = parse_quote(fetch(symbol), symbol)
        except (RuntimeError, ValueError) as error:
            errors.append(f"{symbol}: {error}")
            records[symbol] = {
                "price": None,
                "quoteUpdatedAt": None,
                "isDelayed": None,
                "source": "Yahoo Finance",
            }
    return {
        "schemaVersion": 1,
        "status": "partial" if errors else "ready",
        "provider": "Yahoo Finance",
        "providerUrl": "https://finance.yahoo.com/quote/1120.SR/",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "banks": records,
        "errors": errors,
    }


def load_stocks() -> list[dict]:
    banks = json.loads(BANKS_PATH.read_text(encoding="utf-8"))["banks"]
    technology = json.loads(TECHNOLOGY_PATH.read_text(encoding="utf-8"))["stocks"]
    telecom = json.loads(TELECOM_PATH.read_text(encoding="utf-8"))["stocks"]
    healthcare = json.loads(HEALTHCARE_PATH.read_text(encoding="utf-8"))["stocks"]
    stocks = banks + technology + telecom + healthcare
    if len({stock["symbol"] for stock in stocks}) != len(stocks):
        raise ValueError("duplicate stock symbol across sectors")
    return stocks


def main() -> int:
    snapshot = build_snapshot(load_stocks())
    available = sum(positive(record["price"]) for record in snapshot["banks"].values())
    print(f"Market snapshot: {snapshot['status']}; {available}/{len(snapshot['banks'])} prices")
    for notice in snapshot["errors"]:
        print(f"- {notice}")
    if not available:
        print("No Yahoo Finance prices fetched; keeping the last published site.")
        return 1
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
