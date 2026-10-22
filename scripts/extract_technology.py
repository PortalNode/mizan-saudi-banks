"""Extract historical EPS and P/E for the four companies in the supplied HTML.

The source dashboard has one complete annual EPS row in its market valuation
section. This script reads that data as JSON; it does not execute source HTML.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


SYMBOLS = {"سلوشنز": "7202", "علم": "7203", "المعمر": "7200", "توبي": "7204"}
DATA_LINE = re.compile(r"^const DATA=(\{.*\});$", re.MULTILINE)
EPS_LABEL = "ربحية السهم (EPS)"
PE_LABEL = "مكرر الربحية (P/E)"


def positive_or_none(value: object, suffix: str) -> float | None:
    if isinstance(value, str):
        if not value.endswith(suffix):
            raise ValueError(f"unexpected value: {value!r}")
        value = value[: -len(suffix)]
    if not isinstance(value, (int, float, str)):
        raise ValueError(f"unexpected value: {value!r}")
    number = float(value)
    return number if number > 0 else None


def extract(source_path: Path) -> dict:
    source_bytes = source_path.read_bytes()
    text = source_bytes.decode("utf-8")
    match = DATA_LINE.search(text)
    if not match:
        raise ValueError("source DATA object not found")
    source_data = json.loads(match.group(1))
    if set(source_data) != set(SYMBOLS):
        raise ValueError("source company set changed; review ticker mapping")
    companies = []
    for name, source in source_data.items():
        years = [int(year) for year in source["years"]]
        rows = source["sections"]["المؤشرات المالية"]
        eps_rows = [row for row in rows if row["label"] == EPS_LABEL]
        pe_rows = [row for row in rows if row["label"] == PE_LABEL]
        if len(eps_rows) != 2 or len(pe_rows) != 1:
            raise ValueError(f"unexpected EPS/P-E rows for {name}")
        # The first EPS row repeats a shorter set of years. The second row in
        # market valuation contains the complete available annual series.
        eps_values = eps_rows[-1]["values"]
        pe_values = pe_rows[0]["values"]
        if len(eps_values) != len(years) or len(pe_values) != len(years):
            raise ValueError(f"year/value count mismatch for {name}")
        annual = [{
            "year": year,
            "reportedEps": positive_or_none(eps, "SAR"),
            "historicalPe": positive_or_none(pe, "x"),
        } for year, eps, pe in zip(years, eps_values, pe_values)]
        annual.sort(key=lambda row: row["year"])
        quality_flags = []
        if name == "المعمر":
            quality_flags.append("مكرر المعمر لعام 2023 هو 292 كما ورد في الملف، ويرفع المتوسط التاريخي.")
        companies.append({
            "symbol": SYMBOLS[name],
            "name": name,
            "sector": "technology",
            "historicalEpsBasis": "unspecified",
            "annual": annual,
            "qualityFlags": quality_flags,
        })
    return {
        "schemaVersion": 1,
        "source": {
            "fileName": source_path.name,
            "sha256": hashlib.sha256(source_bytes).hexdigest(),
            "section": "المؤشرات المالية / مؤشرات التقييم السوقي",
            "epsLabel": EPS_LABEL,
            "peLabel": PE_LABEL,
            "notes": [
                "Source EPS does not specify basic or diluted basis.",
                "Zero source P/E values are treated as unavailable, not as zero multiples.",
                "Historical prices in the source file are not used as current prices.",
            ],
        },
        "stocks": companies,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    payload = extract(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {len(payload['stocks'])} technology companies")


if __name__ == "__main__":
    main()
