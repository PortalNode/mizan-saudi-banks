import json
import unittest
from pathlib import Path

from scripts.refresh_market import load_stocks


ROOT = Path(__file__).resolve().parents[1]


class TechnologyDataTests(unittest.TestCase):
    def test_four_source_companies_and_complete_historical_rows(self):
        payload = json.loads((ROOT / "site/data/technology.json").read_text(encoding="utf-8"))
        stocks = {stock["symbol"]: stock for stock in payload["stocks"]}
        self.assertEqual(set(stocks), {"7200", "7202", "7203", "7204"})
        self.assertEqual(len(load_stocks()), 14)
        self.assertEqual(stocks["7202"]["annual"][-1], {
            "year": 2024, "reportedEps": 13.4, "historicalPe": 20.2,
        })
        self.assertEqual(stocks["7204"]["annual"][0]["year"], 2019)
        self.assertIsNone(stocks["7204"]["annual"][0]["historicalPe"])
        self.assertEqual(stocks["7200"]["annual"][-2]["historicalPe"], 292)
        self.assertTrue(all(stock["historicalEpsBasis"] == "unspecified" for stock in stocks.values()))


if __name__ == "__main__":
    unittest.main()
