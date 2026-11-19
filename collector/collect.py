#!/usr/bin/env python3
"""Coleta as séries do catálogo, grava no SQLite e exporta um JSON por série para o site.

Uso: python3 collector/collect.py [id ...]   (sem ids, coleta o catálogo inteiro)
"""
import io
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("DB_PATH", ROOT.parent / "data" / "economia.db"))
EXPORT_DIR = Path(os.environ.get("EXPORT_DIR", ROOT.parent / "site" / "data"))
START = date(1994, 7, 1)  # início do Real
# ponytail: offset fixo -03:00 (Brasil sem horário de verão desde 2019); usar zoneinfo se voltar
BRT = timezone(timedelta(hours=-3))
SGS_WINDOW_DAYS = 3650  # o SGS aceita no máximo 10 anos por consulta em séries diárias
DAILY_REFRESH_DAYS = 30
TESOURO = "https://www.tesourotransparente.gov.br/"
RTN_PACKAGE = TESOURO + "ckan/api/3/action/package_show?id=resultado-do-tesouro-nacional"
FOCUS = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/"
XLSX_MAX_BYTES = 200 * 1024 * 1024  # limite do conteúdo descompactado de uma planilha baixada

SCHEMA = """
CREATE TABLE IF NOT EXISTS series (
  id        TEXT PRIMARY KEY,
  source    TEXT NOT NULL,
  name      TEXT NOT NULL,
  unit      TEXT NOT NULL,
  freq      TEXT NOT NULL,
  block     TEXT NOT NULL,
  ok_at     TEXT,
  error     TEXT,
  error_at  TEXT
);
CREATE TABLE IF NOT EXISTS observations (
  series_id    TEXT NOT NULL REFERENCES series(id),
  date         TEXT NOT NULL,
  value        REAL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (series_id, date)
) WITHOUT ROWID;
"""


# ---------- rede ----------

def http_get(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "Mozilla/5.0 (compatible; data-collector)"}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 or attempt == 2:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(2 * (attempt + 1))


def http_get_json(url):
    return json.loads(http_get(url))


def windows(start, end, max_days):
    """Divide [start, end] em intervalos fechados de até max_days dias."""
    while start <= end:
        stop = min(start + timedelta(days=max_days - 1), end)
        yield start, stop
        start = stop + timedelta(days=1)


def to_float(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def parse_sgs(payload, today):
    """[{"data": "dd/mm/aaaa", "valor": "1.23"}] -> [("aaaa-mm-dd", 1.23)], sem datas futuras."""
    rows = []
    for item in payload:
        day, month, year = item["data"].split("/")
        iso = f"{year}-{month}-{day}"
        if iso <= today.isoformat():
            rows.append((iso, to_float(item["valor"])))
    return rows


def fetch_sgs(code, freq, start, today):
    spans = windows(start, today, SGS_WINDOW_DAYS) if freq == "D" else [(start, today)]
    rows = []
    for a, b in spans:
        url = (
            f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados?formato=json"
            f"&dataInicial={a:%d/%m/%Y}&dataFinal={b:%d/%m/%Y}"
        )
        try:
            rows += parse_sgs(http_get_json(url), today)
        except urllib.error.HTTPError as e:
            if e.code != 404:  # 404 = janela sem dados (ex.: antes do início da série)
                raise
        time.sleep(0.3)
    return rows


def parse_sidra(payload):
    """Resposta do SIDRA (1ª linha é cabeçalho) -> {categoria: [("aaaa-mm-01", valor)]}."""
    by_category = {}
    for row in payload[1:]:
        year, quarter = int(row["D3C"][:4]), int(row["D3C"][4:])
        iso = f"{year}-{(quarter - 1) * 3 + 1:02d}-01"
        by_category.setdefault(row["D4C"], []).append((iso, to_float(row["V"])))
    return by_category


def fetch_sidra(table, variable, categories):
    url = (
        f"https://apisidra.ibge.gov.br/values/t/{table}/n1/all/v/{variable}"
        f"/p/all/c11255/{','.join(str(c) for c in categories)}"
    )
    return parse_sidra(http_get_json(url))


# ---------- expectativas de mercado (Boletim Focus, API Olinda do Banco Central) ----------

def focus_url(resource, **params):
    query = urllib.parse.urlencode(
        {f"${key}": value for key, value in params.items()} | {"$format": "json"},
        quote_via=urllib.parse.quote, safe="$',",
    )
    return f"{FOCUS}{resource}?{query}"


def parse_focus_annual(payload):
    """Pesquisa mais recente -> [("aaaa-01-01", mediana)], uma linha por ano de referência."""
    rows = payload["value"]
    latest = max((row["Data"] for row in rows), default=None)
    return sorted(
        (f"{row['DataReferencia']}-01-01", row["Mediana"]) for row in rows if row["Data"] == latest
    )


def fetch_focus_annual(indicator, today):
    """Mediana das expectativas para cada ano-calendário, na pesquisa mais recente."""
    since = today - timedelta(days=21)
    return parse_focus_annual(http_get_json(focus_url(
        "ExpectativasMercadoAnuais",
        filter=f"Indicador eq '{indicator}' and Data ge '{since.isoformat()}' and baseCalculo eq 0",
        select="Data,DataReferencia,Mediana", orderby="Data desc", top=200,
    )))


def fetch_focus_12m(indicator, start):
    """Série diária da mediana da inflação esperada para os 12 meses seguintes (suavizada)."""
    payload = http_get_json(focus_url(
        "ExpectativasMercadoInflacao12Meses",
        filter=f"Indicador eq '{indicator}' and Suavizada eq 'S' and baseCalculo eq 0 and Data ge '{start.isoformat()}'",
        select="Data,Mediana", orderby="Data asc",
    ))
    return [(row["Data"], row["Mediana"]) for row in payload["value"]]


# ---------- planilha do Tesouro (XLSX lido à mão: é um ZIP com XML dentro) ----------

XLSX_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
XLSX_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def read_xlsx_sheet(blob, sheet_name):
    """Linhas de uma aba como dicts {coluna: texto}, com os textos compartilhados já resolvidos."""
    archive = zipfile.ZipFile(io.BytesIO(blob))
    if sum(info.file_size for info in archive.infolist()) > XLSX_MAX_BYTES:
        raise ValueError("planilha maior que o limite aceito")
    strings = [
        "".join(t.text or "" for t in item.iter(XLSX_MAIN + "t"))
        for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall(XLSX_MAIN + "si")
    ]
    targets = {r.get("Id"): r.get("Target") for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
    sheets = {
        sheet.get("name"): "xl/" + targets[sheet.get(XLSX_REL + "id")].removeprefix("/xl/")
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).find(XLSX_MAIN + "sheets")
    }
    if sheet_name not in sheets:
        raise ValueError(f"aba {sheet_name!r} não encontrada na planilha")
    rows = []
    for row in ET.fromstring(archive.read(sheets[sheet_name])).find(XLSX_MAIN + "sheetData"):
        cells = {}
        for cell in row:
            value = cell.find(XLSX_MAIN + "v")
            if value is not None:
                column = re.match(r"[A-Z]+", cell.get("r")).group()
                cells[column] = strings[int(value.text)] if cell.get("t") == "s" else value.text
        rows.append(cells)
    return rows


def excel_date(serial):
    return (date(1899, 12, 30) + timedelta(days=int(float(serial)))).isoformat()


def parse_rtn(rows):
    """Aba do RTN (linhas = rubricas, colunas = meses) -> {rubrica: [("aaaa-mm-01", valor)]}."""
    header = next((r for r in rows if r.get("A") == "Discriminação"), None)
    if header is None:
        raise ValueError("cabeçalho 'Discriminação' não encontrado")
    months = {column: excel_date(serial) for column, serial in header.items() if column != "A"}
    by_label = {}
    for row in rows:
        label = " ".join(str(row.get("A", "")).split())  # o Tesouro varia os espaços entre código e nome
        if label and row is not header:
            by_label[label] = [(months[c], to_float(v)) for c, v in row.items() if c in months]
    return by_label


def pick_row(by_label, prefix):
    """Rubrica cujo rótulo começa com `prefix`; falha se a planilha mudar e houver zero ou várias."""
    matches = [rows for label, rows in by_label.items() if label.startswith(prefix)]
    if len(matches) != 1:
        raise ValueError(f"{len(matches)} linhas começam com {prefix!r} na planilha do Tesouro")
    return matches[0]


def fetch_rtn(sheet):
    # O nome do arquivo muda todo mês; o endereço atual vem do catálogo do Tesouro.
    resources = http_get_json(RTN_PACKAGE)["result"]["resources"]
    url = next(
        (r["url"] for r in resources if r.get("format") == "XLSX" and "Série Histórica" in r.get("name", "")),
        None,
    )
    if not url or not url.startswith(TESOURO):
        raise ValueError(f"endereço inesperado para a planilha do RTN: {url!r}")
    return parse_rtn(read_xlsx_sheet(http_get(url), sheet))


# ---------- banco ----------

def open_db(path):
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def sync_catalog(conn, catalog):
    """Copia o catálogo para a tabela series, preservando o estado da última coleta."""
    with conn:
        conn.executemany(
            """INSERT INTO series (id, source, name, unit, freq, block)
               VALUES (:id, :source, :name, :unit, :freq, :block)
               ON CONFLICT (id) DO UPDATE SET source = excluded.source, name = excluded.name,
                 unit = excluded.unit, freq = excluded.freq, block = excluded.block""",
            catalog,
        )


def daily_start(conn, series_id):
    """Séries diárias: histórico completo na 1ª vez; depois, só a cauda recente."""
    (last,) = conn.execute(
        "SELECT MAX(date) FROM observations WHERE series_id = ?", (series_id,)
    ).fetchone()
    if last is None:
        return START
    return date.fromisoformat(last) - timedelta(days=DAILY_REFRESH_DAYS)


def store(conn, series_id, rows, now):
    """Insere observações novas e atualiza as revisadas; collected_at só muda se o valor mudar."""
    # ponytail: observação removida na fonte permanece no banco; apagar a série e recoletar se ocorrer
    with conn:
        conn.executemany(
            """INSERT INTO observations (series_id, date, value, collected_at) VALUES (?, ?, ?, ?)
               ON CONFLICT (series_id, date) DO UPDATE
                 SET value = excluded.value, collected_at = excluded.collected_at
                 WHERE observations.value IS NOT excluded.value""",
            [(series_id, d, v, now) for d, v in rows],
        )
        conn.execute(
            "UPDATE series SET ok_at = ?, error = NULL, error_at = NULL WHERE id = ?",
            (now, series_id),
        )


def store_error(conn, series_id, error, now):
    with conn:
        conn.execute(
            "UPDATE series SET error = ?, error_at = ? WHERE id = ?",
            (f"{type(error).__name__}: {error}", now, series_id),
        )


# ---------- exportação para o site ----------

def write_json(path, obj):
    """Grava em arquivo temporário e renomeia: o site nunca lê um arquivo pela metade."""
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)


def source_ref(entry):
    """Onde achar a série na fonte, em texto para o leitor do site."""
    if entry["source"] == "sgs":
        return f"Banco Central, SGS {entry['code']}"
    if entry["source"] == "sidra":
        return f"IBGE, SIDRA, tabela {entry['table']}"
    if entry["source"] == "rtn":
        return f"Tesouro Nacional, RTN, tabela {entry['sheet']}"
    return f"Banco Central, Boletim Focus, {entry['indicator']}"


def export(conn, export_dir, catalog=()):
    """Um JSON por série com dados, mais index.json com os metadados e o estado de cada série."""
    export_dir.mkdir(parents=True, exist_ok=True)
    refs = {entry["id"]: source_ref(entry) for entry in catalog}
    conn.row_factory = sqlite3.Row
    index = [dict(row) for row in conn.execute("SELECT * FROM series ORDER BY block, id")]
    conn.row_factory = None
    for series in index:
        series["ref"] = refs.get(series["id"])
    for series in index:
        data = conn.execute(
            "SELECT date, value FROM observations WHERE series_id = ? ORDER BY date",
            (series["id"],),
        ).fetchall()
        if data:
            write_json(
                export_dir / f"{series['id']}.json",
                {"id": series["id"], "collected_at": series["ok_at"], "data": data},
            )
    write_json(export_dir / "index.json", index)


# ---------- orquestração ----------

def fetch_all(conn, entries, today):
    """Devolve {id: linhas} em caso de sucesso ou {id: Exception} em caso de falha."""
    results = {}
    groups = {}  # séries que saem de uma mesma chamada: uma tabela do SIDRA ou uma aba do RTN
    for entry in entries:
        if entry["source"] == "sidra":
            groups.setdefault(("sidra", entry["table"], entry["variable"]), []).append(entry)
        elif entry["source"] == "rtn":
            groups.setdefault(("rtn", entry["sheet"]), []).append(entry)
        else:
            try:
                start = daily_start(conn, entry["id"]) if entry["freq"] == "D" else START
                if entry["source"] == "focus":
                    results[entry["id"]] = fetch_focus_annual(entry["indicator"], today)
                elif entry["source"] == "focus12":
                    results[entry["id"]] = fetch_focus_12m(entry["indicator"], start)
                else:
                    results[entry["id"]] = fetch_sgs(entry["code"], entry["freq"], start, today)
            except Exception as e:  # falha de uma série não interrompe as outras
                results[entry["id"]] = e

    for (source, *key), group in groups.items():
        try:
            if source == "sidra":
                by_category = fetch_sidra(*key, [e["category"] for e in group])
                rows = {e["id"]: by_category.get(str(e["category"]), []) for e in group}
            else:
                by_label = fetch_rtn(*key)
                rows = {}
                for e in group:
                    try:
                        rows[e["id"]] = pick_row(by_label, e["row"])
                    except ValueError as error:
                        rows[e["id"]] = error
            results.update(rows)
        except Exception as e:
            for entry in group:
                results[entry["id"]] = e
        time.sleep(0.3)

    for key, value in results.items():
        if value == []:
            results[key] = ValueError("a fonte não devolveu dados")
    return results


def main(argv):
    catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
    wanted = set(argv)
    unknown = wanted - {e["id"] for e in catalog}
    if unknown:
        sys.exit(f"ids fora do catálogo: {', '.join(sorted(unknown))}")
    entries = [e for e in catalog if not wanted or e["id"] in wanted]

    now = datetime.now(BRT).replace(microsecond=0)
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = open_db(DB_PATH)
    sync_catalog(conn, catalog)

    failures = 0
    for series_id, result in fetch_all(conn, entries, now.date()).items():
        if isinstance(result, Exception):
            failures += 1
            store_error(conn, series_id, result, now.isoformat())
            print(f"ERRO {series_id}: {type(result).__name__}: {result}")
        else:
            store(conn, series_id, result, now.isoformat())
            dates = [d for d, _ in result]
            print(f"ok   {series_id}: {len(result)} pontos, {min(dates)} a {max(dates)}")
    export(conn, EXPORT_DIR, catalog)
    conn.close()
    print(f"{len(entries) - failures} de {len(entries)} séries coletadas; banco em {DB_PATH}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
