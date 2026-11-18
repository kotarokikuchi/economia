"""Testes sem rede. Rodar: python3 -m unittest discover collector"""
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

import collect

M1 = {"id": "m1", "source": "sgs", "code": 27791, "name": "M1", "unit": "R$ mil",
      "freq": "M", "block": "moeda"}


class ParsingTest(unittest.TestCase):
    def test_parse_sgs_converts_dates_and_drops_future(self):
        payload = [
            {"data": "01/06/2026", "valor": "431100998"},
            {"data": "02/06/2026", "valor": ""},
            {"data": "09/12/2026", "valor": "13.75"},  # meta Selic já vem com datas futuras
        ]
        self.assertEqual(
            collect.parse_sgs(payload, date(2026, 11, 18)),
            [("2026-06-01", 431100998.0), ("2026-06-02", None)],
        )

    def test_parse_sidra_groups_by_category_and_maps_quarters(self):
        header = {"D3C": "Trimestre (Código)", "D4C": "Setores (Código)", "V": "Valor"}
        payload = [
            header,
            {"D3C": "199604", "D4C": "90707", "V": "230000"},
            {"D3C": "199601", "D4C": "90707", "V": "189323"},
            {"D3C": "199601", "D4C": "102880", "V": "..."},
        ]
        self.assertEqual(
            collect.parse_sidra(payload),
            {
                "90707": [("1996-10-01", 230000.0), ("1996-01-01", 189323.0)],
                "102880": [("1996-01-01", None)],
            },
        )

    def test_windows_cover_range_without_gaps_or_overlap(self):
        spans = list(collect.windows(date(1994, 7, 1), date(2026, 11, 18), collect.SGS_WINDOW_DAYS))
        self.assertEqual(spans[0][0], date(1994, 7, 1))
        self.assertEqual(spans[-1][1], date(2026, 11, 18))
        for (_, end), (start, _) in zip(spans, spans[1:]):
            self.assertEqual((start - end).days, 1)
        self.assertTrue(all((b - a).days < 3653 for a, b in spans))  # menos de 10 anos


class DatabaseTest(unittest.TestCase):
    def setUp(self):
        self.conn = collect.open_db(":memory:")
        collect.sync_catalog(self.conn, [M1])

    def tearDown(self):
        self.conn.close()

    def rows(self):
        return self.conn.execute(
            "SELECT date, value, collected_at FROM observations ORDER BY date"
        ).fetchall()

    def test_store_updates_collected_at_only_when_value_changes(self):
        collect.store(self.conn, "m1", [("2026-01-01", 1.0), ("2026-02-01", 2.0)], "t1")
        collect.store(self.conn, "m1", [("2026-02-01", 2.5), ("2026-01-01", 1.0), ("2026-03-01", None)], "t2")
        self.assertEqual(
            self.rows(),
            [("2026-01-01", 1.0, "t1"), ("2026-02-01", 2.5, "t2"), ("2026-03-01", None, "t2")],
        )

    def test_error_keeps_data_and_success_clears_error(self):
        collect.store(self.conn, "m1", [("2026-01-01", 1.0)], "t1")
        collect.store_error(self.conn, "m1", ValueError("fora do ar"), "t2")
        status = "SELECT ok_at, error, error_at FROM series WHERE id = 'm1'"
        self.assertEqual(self.conn.execute(status).fetchone(), ("t1", "ValueError: fora do ar", "t2"))
        self.assertEqual(len(self.rows()), 1)
        collect.store(self.conn, "m1", [("2026-01-01", 1.0)], "t3")
        self.assertEqual(self.conn.execute(status).fetchone(), ("t3", None, None))

    def test_sync_catalog_preserves_status(self):
        collect.store(self.conn, "m1", [("2026-01-01", 1.0)], "t1")
        collect.sync_catalog(self.conn, [{**M1, "name": "Meios de pagamento M1"}])
        self.assertEqual(
            self.conn.execute("SELECT name, ok_at FROM series").fetchone(),
            ("Meios de pagamento M1", "t1"),
        )

    def test_daily_start_is_full_history_then_recent_tail(self):
        self.assertEqual(collect.daily_start(self.conn, "m1"), collect.START)
        collect.store(self.conn, "m1", [("2026-11-17", 5.4)], "t1")
        self.assertEqual(collect.daily_start(self.conn, "m1"), date(2026, 10, 18))

    def test_export_writes_series_and_index(self):
        collect.store(self.conn, "m1", [("2026-02-01", 2.0), ("2026-01-01", 1.0)], "t1")
        with tempfile.TemporaryDirectory() as tmp:
            collect.export(self.conn, Path(tmp))
            series = json.loads((Path(tmp) / "m1.json").read_text(encoding="utf-8"))
            index = json.loads((Path(tmp) / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(
            series,
            {"id": "m1", "collected_at": "t1", "data": [["2026-01-01", 1.0], ["2026-02-01", 2.0]]},
        )
        self.assertEqual(index[0]["id"], "m1")
        self.assertEqual(index[0]["unit"], "R$ mil")
        self.assertIsNone(index[0]["error"])


if __name__ == "__main__":
    unittest.main()
