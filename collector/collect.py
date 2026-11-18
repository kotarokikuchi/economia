#!/usr/bin/env python3
"""Coleta as séries do catálogo, grava no SQLite e exporta um JSON por série para o site.

Uso: python3 collector/collect.py [id ...]   (sem ids, coleta o catálogo inteiro)
"""
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
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

def http_get_json(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "Mozilla/5.0 (compatible; data-collector)"}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code == 404 or attempt == 2:
                raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if attempt == 2:
                raise
        time.sleep(2 * (attempt + 1))


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


def export(conn, export_dir):
    """Um JSON por série com dados, mais index.json com os metadados e o estado de cada série."""
    export_dir.mkdir(parents=True, exist_ok=True)
    conn.row_factory = sqlite3.Row
    index = [dict(row) for row in conn.execute("SELECT * FROM series ORDER BY block, id")]
    conn.row_factory = None
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
    sidra_groups = {}
    for entry in entries:
        if entry["source"] == "sidra":
            sidra_groups.setdefault((entry["table"], entry["variable"]), []).append(entry)
            continue
        try:
            start = daily_start(conn, entry["id"]) if entry["freq"] == "D" else START
            results[entry["id"]] = fetch_sgs(entry["code"], entry["freq"], start, today)
        except Exception as e:  # falha de uma série não interrompe as outras
            results[entry["id"]] = e

    for (table, variable), group in sidra_groups.items():
        try:
            by_category = fetch_sidra(table, variable, [e["category"] for e in group])
            for entry in group:
                results[entry["id"]] = by_category.get(str(entry["category"]), [])
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
    export(conn, EXPORT_DIR)
    conn.close()
    print(f"{len(entries) - failures} de {len(entries)} séries coletadas; banco em {DB_PATH}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
