import unittest
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError

from scripts.refresh_market import ProviderError, build_snapshot, fetch_json


class RefreshMarketTests(unittest.TestCase):
    @staticmethod
    def chart(symbol="1120.SR", price=88.4, currency="SAR"):
        return {"chart": {"error": None, "result": [{"meta": {
            "symbol": symbol, "currency": currency,
            "regularMarketPrice": price, "regularMarketTime": 1792663200,
        }}]}}

    def test_saudi_quotes_are_parsed_with_source_and_time(self):
        banks = [{"symbol": "1120"}, {"symbol": "1180"}]
        symbols = []
        pauses = []

        def fake_fetch(symbol):
            symbols.append(symbol)
            return self.chart(f"{symbol}.SR")

        result = build_snapshot(banks, fake_fetch, pause=pauses.append)
        self.assertEqual(symbols, ["1120", "1180"])
        self.assertEqual(pauses, [1])
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["provider"], "Yahoo Finance")
        self.assertEqual(result["banks"]["1120"]["price"], 88.4)
        self.assertEqual(result["banks"]["1120"]["quoteUpdatedAt"], "2026-10-22T10:00:00+00:00")
        self.assertTrue(result["banks"]["1120"]["isDelayed"])

    def test_bad_quote_does_not_invent_a_price(self):
        for payload in (self.chart(price=None), self.chart(currency="USD"), self.chart(symbol="1180.SR")):
            with self.subTest(payload=payload):
                result = build_snapshot([{"symbol": "1120"}], lambda symbol: payload)
                self.assertEqual(result["status"], "partial")
                self.assertIsNone(result["banks"]["1120"]["price"])

    def test_http_error_exposes_status_only(self):
        error = HTTPError("https://query1.finance.yahoo.com/v8/finance/chart/1120.SR", 403,
                          "Forbidden", {}, BytesIO(b"private detail"))
        with patch("scripts.refresh_market.urlopen", side_effect=error):
            with self.assertRaises(ProviderError) as caught:
                fetch_json("1120")
        self.assertEqual(caught.exception.status, 403)
        self.assertNotIn("private detail", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
