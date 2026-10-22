import unittest
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError

from scripts.refresh_market import ProviderError, build_snapshot, fetch_json


class RefreshMarketTests(unittest.TestCase):
    def test_unconfigured_snapshot_has_no_claim_of_live_prices(self):
        result = build_snapshot([], "")
        self.assertEqual(result["status"], "unconfigured")
        self.assertEqual(result["banks"], {})

    def test_only_single_quotes_are_requested_and_seven_seconds_apart(self):
        banks = [{"symbol": "1120"}, {"symbol": "1180"}]
        paths = []
        pauses = []

        def fake_fetch(path, key):
            self.assertEqual(key, "test-key")
            paths.append(path)
            return {"symbol": path.split("/")[2], "price": 88.4,
                    "updated_at": "2026-10-22T10:00:00+03:00", "is_delayed": True}

        result = build_snapshot(banks, "test-key", fake_fetch, pause=pauses.append)
        self.assertEqual(paths, ["/quote/1120/", "/quote/1180/"])
        self.assertEqual(pauses, [7])
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["banks"]["1120"]["price"], 88.4)
        self.assertEqual(set(result["banks"]["1120"]),
                         {"price", "quoteUpdatedAt", "isDelayed", "source"})

    def test_missing_quote_does_not_invent_a_price(self):
        result = build_snapshot([{"symbol": "1120"}], "test-key",
                                lambda path, key: {"symbol": "1120", "price": None})
        self.assertEqual(result["status"], "partial")
        self.assertIsNone(result["banks"]["1120"]["price"])

    def test_http_error_exposes_only_safe_provider_code(self):
        error = HTTPError("https://api.sahmk.sa/api/v1/quote/1120/", 403,
                          "Forbidden", {}, BytesIO(b'{"error":{"code":"PLAN_LIMIT"}}'))
        with patch("scripts.refresh_market.urlopen", side_effect=error):
            with self.assertRaises(ProviderError) as caught:
                fetch_json("/quote/1120/", "test-key")
        self.assertEqual(caught.exception.api_code, "PLAN_LIMIT")


if __name__ == "__main__":
    unittest.main()
