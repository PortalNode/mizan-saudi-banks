import json
import unittest
from pathlib import Path

from scripts.refresh_market import load_stocks


ROOT = Path(__file__).resolve().parents[1]


class TelecomDataTests(unittest.TestCase):
    def test_sources_and_estimates_are_complete_without_inventing_diluted_eps(self):
        data = json.loads((ROOT / "site/data/telecom.json").read_text(encoding="utf-8"))
        stocks = {stock["symbol"]: stock for stock in data["stocks"]}
        self.assertEqual(set(stocks), {"7010", "7020", "7030", "7040"})
        self.assertEqual(set(stocks), {stock["symbol"] for stock in load_stocks() if stock.get("sector") == "telecom"})
        self.assertEqual(data["collectionDate"], "2026-10-28")
        for stock in stocks.values():
            current = stock["current"]
            self.assertGreater(current["ttmBasicEpsApprox"], 0)
            self.assertGreater(current["bookValue"], 0)
            self.assertIn(current["periodEnd"], {"2026-06-30", "2026-09-30"})
            self.assertTrue(all(source in data["sources"] for source in current["sourceIds"]))
            values = [float(value) for value in current["ttmCalculation"]["basicFormula"].split()[::2]]
            self.assertAlmostEqual(values[0] - values[1] + values[2], current["ttmBasicEpsApprox"])
        self.assertEqual(stocks["7010"]["current"]["ttmDilutedEpsApprox"], 2.94)
        for symbol in ("7020", "7030", "7040"):
            self.assertIsNone(stocks[symbol]["current"]["ttmDilutedEpsApprox"])

    def test_conflicting_history_is_excluded_from_automatic_methods(self):
        stocks = {stock["symbol"]: stock for stock in json.loads(
            (ROOT / "site/data/telecom.json").read_text(encoding="utf-8"))["stocks"]}
        self.assertIsNone(stocks["7010"]["annual"][4]["historicalPe"])
        self.assertEqual(stocks["7040"]["unavailableMethods"], ["growth", "historical"])
        self.assertTrue(stocks["7040"]["historyReferenceOnly"])
        self.assertTrue(all(row["reportedEps"] is None and row["historicalPe"] is None
                            for row in stocks["7040"]["annual"]))


if __name__ == "__main__":
    unittest.main()
