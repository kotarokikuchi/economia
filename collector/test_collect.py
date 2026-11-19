"""Testes sem rede. Rodar: python3 -m unittest discover collector"""
import io
import json
import tempfile
import unittest
import zipfile
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


class ValidationTest(unittest.TestCase):
    def test_accepts_iso_dates_with_numbers_or_gaps(self):
        collect.check_rows([("2026-01-01", 1.5), ("2026-02-01", None), ("2026-03-01", 3)])

    def test_rejects_anything_that_is_not_a_date_and_a_finite_number(self):
        for rows in (
            [("01/02/2026", 1.0)],
            [("2026-01-01<script>", 1.0)],
            [(20260101, 1.0)],
            [("2026-01-01", "1.0")],
            [("2026-01-01", float("nan"))],
            [("2026-01-01", float("inf"))],
            [("2026-01-01", True)],
        ):
            with self.assertRaises(ValueError, msg=rows):
                collect.check_rows(rows)

    def test_text_that_parses_as_nan_does_not_reach_the_site(self):
        rows = collect.parse_sgs([{"data": "01/06/2026", "valor": "nan"}], date(2026, 11, 18))
        with self.assertRaises(ValueError):
            collect.check_rows(rows)


class FocusTest(unittest.TestCase):
    def test_parse_focus_annual_keeps_only_latest_survey(self):
        payload = {"value": [
            {"Data": "2026-11-13", "DataReferencia": "2027", "Mediana": 5.0},
            {"Data": "2026-11-13", "DataReferencia": "2026", "Mediana": 5.11},
            {"Data": "2026-11-06", "DataReferencia": "2026", "Mediana": 5.2},
        ]}
        self.assertEqual(collect.parse_focus_annual(payload), [("2026-01-01", 5.11), ("2027-01-01", 5.0)])
        self.assertEqual(collect.parse_focus_annual({"value": []}), [])

    def test_focus_url_encodes_filter(self):
        url = collect.focus_url("ExpectativasMercadoAnuais", filter="Indicador eq 'PIB Total'", top=5)
        self.assertEqual(
            url,
            collect.FOCUS + "ExpectativasMercadoAnuais?$filter=Indicador%20eq%20'PIB%20Total'&$top=5&$format=json",
        )


def make_xlsx(sheet_name, strings, sheet_rows):
    """Monta em memória um XLSX mínimo. Células: ("s", índice do texto) ou ("n", número)."""
    main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    cells = "".join(
        f'<row r="{r}">' + "".join(
            f'<c r="{col}{r}"' + (' t="s"' if kind == "s" else "") + f"><v>{value}</v></c>"
            for col, (kind, value) in row.items()
        ) + "</row>"
        for r, row in enumerate(sheet_rows, start=1)
    )
    files = {
        "xl/workbook.xml": f'<workbook xmlns="{main}" xmlns:r="{rel}"><sheets>'
                           f'<sheet name="{sheet_name}" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                                      '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/sharedStrings.xml": f'<sst xmlns="{main}">' + "".join(f"<si><t>{t}</t></si>" for t in strings) + "</sst>",
        "xl/worksheets/sheet1.xml": f'<worksheet xmlns="{main}"><sheetData>{cells}</sheetData></worksheet>',
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


class TreasurySheetTest(unittest.TestCase):
    def setUp(self):
        strings = ["Tabela 1.1", "Discriminação", "3. RECEITA LÍQUIDA  (1-2)", "4.1  Benefícios Previdenciários ", "4.1.01 Urbano"]
        self.blob = make_xlsx("1.1", strings, [
            {"A": ("s", 0)},
            {"A": ("s", 1), "B": ("n", 35431), "C": ("n", 35462)},  # jan/1997 e fev/1997 como datas do Excel
            {"A": ("s", 2), "B": ("n", "9789.2"), "C": ("n", "9664.4")},
            {"A": ("s", 3), "B": ("n", "3402.2")},
            {"A": ("s", 4), "B": ("n", "1.0"), "C": ("n", "2.0")},
        ])

    def test_reads_sheet_and_maps_rows_to_months(self):
        by_label = collect.parse_rtn(collect.read_xlsx_sheet(self.blob, "1.1"))
        self.assertEqual(
            collect.pick_row(by_label, "3. RECEITA LÍQUIDA"),
            [("1997-01-01", 9789.2), ("1997-02-01", 9664.4)],
        )
        # espaços variáveis entre código e nome não atrapalham; "4.1.01" não se confunde com "4.1 "
        self.assertEqual(collect.pick_row(by_label, "4.1 Benefícios"), [("1997-01-01", 3402.2)])

    def test_fails_loudly_when_layout_changes(self):
        by_label = collect.parse_rtn(collect.read_xlsx_sheet(self.blob, "1.1"))
        with self.assertRaises(ValueError):
            collect.pick_row(by_label, "9. RUBRICA QUE NÃO EXISTE")
        with self.assertRaises(ValueError):
            collect.pick_row(by_label, "4.1")  # ambíguo: casa com 4.1 e 4.1.01
        with self.assertRaises(ValueError):
            collect.read_xlsx_sheet(self.blob, "9.9")
        with self.assertRaises(ValueError):
            collect.parse_rtn([{"A": "sem cabeçalho"}])


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
            collect.export(self.conn, Path(tmp), [M1])
            series = json.loads((Path(tmp) / "m1.json").read_text(encoding="utf-8"))
            index = json.loads((Path(tmp) / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(
            series,
            {"id": "m1", "collected_at": "t1", "data": [["2026-01-01", 1.0], ["2026-02-01", 2.0]]},
        )
        self.assertEqual(index[0]["id"], "m1")
        self.assertEqual(index[0]["unit"], "R$ mil")
        self.assertEqual(index[0]["ref"], "Banco Central, SGS 27791")
        self.assertIsNone(index[0]["error"])

    def test_export_hides_error_details(self):
        collect.store(self.conn, "m1", [("2026-01-01", 1.0)], "t1")
        collect.store_error(self.conn, "m1", OSError("/data/economia.db: disco cheio"), "t2")
        with tempfile.TemporaryDirectory() as tmp:
            collect.export(self.conn, Path(tmp), [M1])
            exported = (Path(tmp) / "index.json").read_text(encoding="utf-8")
        self.assertIn("falha na última coleta", exported)
        self.assertNotIn("economia.db", exported)
        # o detalhe continua no banco, para quem opera o servidor
        self.assertIn("disco cheio", self.conn.execute("SELECT error FROM series").fetchone()[0])


if __name__ == "__main__":
    unittest.main()
