import unittest

from scripts.refresh_market import build_snapshot, historical_multiples


class RefreshMarketTests(unittest.TestCase):
    def test_six_year_historical_multiple_uses_year_end_adjusted_close(self):
        annual = [
            {"year": year, "basicEps": 2, "dilutedEps": 1}
            for year in range(2020, 2026)
        ]
        candles = [
            {"date": f"{year}-{suffix}", "adjusted_close": close}
            for year in range(2020, 2026)
            for suffix, close in (("11-30", 18), ("12-31", 20))
        ]
        result = historical_multiples(candles, annual)
        self.assertTrue(result["complete"])
        self.assertEqual(result["basicAverage"], 10)
        self.assertEqual(result["dilutedAverage"], 20)
        self.assertEqual(len(result["observations"]), 6)
        self.assertNotIn("adjustedClose", result["observations"][0])

    def test_missing_year_prevents_six_year_average(self):
        annual = [{"year": year, "basicEps": 2, "dilutedEps": 1} for year in range(2020, 2026)]
        candles = [{"date": f"{year}-12-31", "adjusted_close": 20} for year in range(2021, 2026)]
        result = historical_multiples(candles, annual)
        self.assertFalse(result["complete"])
        self.assertIsNone(result["basicAverage"])

    def test_unconfigured_snapshot_has_no_claim_of_live_prices(self):
        result = build_snapshot([], "")
        self.assertEqual(result["status"], "unconfigured")
        self.assertEqual(result["banks"], {})

    def test_provider_payload_maps_to_market_snapshot(self):
        bank = {
            "symbol": "1120",
            "annual": [
                {"year": year, "basicEps": 2, "dilutedEps": 1.8}
                for year in range(2020, 2026)
            ],
        }

        def fake_fetch(path, key):
            self.assertEqual(key, "test-key")
            if path.startswith("/quotes/"):
                return {"quotes": [{"symbol": "1120", "price": 88.4, "updated_at": "2026-10-22T10:00:00+03:00", "is_delayed": True}]}
            if path == "/company/1120/":
                return {"symbol": "1120", "fundamentals": {"basic_eps": 6.2, "diluted_eps": 5.85, "book_value": 28.71, "pe_ratio": 14.25}}
            if path.startswith("/historical/1120/"):
                self.assertIn("interval=1m", path)
                return {"symbol": "1120", "data": [{"date": f"{year}-12-31", "adjusted_close": 20} for year in range(2020, 2026)]}
            raise AssertionError(path)

        result = build_snapshot([bank], "test-key", fake_fetch)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["banks"]["1120"]["price"], 88.4)
        self.assertEqual(result["banks"]["1120"]["basicEps"], 6.2)
        self.assertEqual(result["banks"]["1120"]["historicalPe"]["basicAverage"], 10)


if __name__ == "__main__":
    unittest.main()
