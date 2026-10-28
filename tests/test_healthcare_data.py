import json
import unittest
from pathlib import Path

from scripts.refresh_market import load_stocks


ROOT = Path(__file__).resolve().parents[1]


class HealthcareDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "site/data/healthcare.json").read_text(encoding="utf-8"))
        cls.stocks = {stock["symbol"]: stock for stock in cls.data["stocks"]}

    def test_all_nine_companies_have_traceable_current_data(self):
        self.assertEqual(set(self.stocks), {"4009", "4007", "4013", "4017", "4019", "4018", "4005", "4002", "4004"})
        self.assertEqual(set(self.stocks), {stock["symbol"] for stock in load_stocks() if stock.get("sector") == "healthcare"})
        self.assertEqual(self.data["collectionDate"], "2026-10-28")
        for stock in self.stocks.values():
            current = stock["current"]
            self.assertGreater(current["bookValue"], 0)
            self.assertIn(current["periodEnd"], {"2026-06-30", "2026-09-30"})
            self.assertTrue(all(source in self.data["sources"] for source in current["sourceIds"]))
            self.assertIn(stock["annualSourceId"], self.data["sources"])
            self.assertIn("sector", stock["defaultExcludedMethods"])

    def test_unverified_provider_eps_is_not_loaded_as_basic_or_diluted(self):
        for symbol, stock in self.stocks.items():
            current = stock["current"]
            if symbol == "4017":
                self.assertEqual(current["ttmBasicEpsApprox"], 1.01)
                self.assertEqual(current["ttmDilutedEpsApprox"], 1.01)
            else:
                self.assertIsNone(current["ttmBasicEpsApprox"])
                self.assertIsNone(current["ttmDilutedEpsApprox"])

    def test_censored_and_conflicting_history_is_excluded(self):
        german = self.stocks["4009"]
        self.assertIn("historical", german["unavailableMethods"])
        self.assertEqual(sum(row["historicalPeStatus"] == "censored_above_100"
                             for row in german["annual"]), 2)
        self.assertIn("historical", self.stocks["4017"]["unavailableMethods"])
        for symbol in ("4018", "4004"):
            self.assertIn("growth", self.stocks[symbol]["unavailableMethods"])
        for symbol in ("4018", "4019"):
            self.assertEqual(sum(row["historicalPe"] is not None
                                 for row in self.stocks[symbol]["annual"]), 1)


if __name__ == "__main__":
    unittest.main()
