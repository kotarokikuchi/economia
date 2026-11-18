// Leitura dos arquivos exportados pela coleta (site/data/).

async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

/** Metadados e estado da última coleta de cada série, indexados por id. */
export async function loadIndex() {
  const list = await getJson('data/index.json');
  return Object.fromEntries(list.map((s) => [s.id, s]));
}

/** Carrega várias séries de uma vez: { id: [[data, valor], ...] }. */
export async function loadSeries(ids) {
  const files = await Promise.all(ids.map((id) => getJson(`data/${id}.json`)));
  return Object.fromEntries(files.map((f) => [f.id, f.data]));
}

/** Mudanças de regime marcadas nos gráficos de linha. */
export const REGIMES = [
  { date: '1999-01-15', label: 'Câmbio flutuante' },
  { date: '2000-05-04', label: 'Lei de Resp. Fiscal' },
  { date: '2016-12-15', label: 'Teto de gastos' },
  { date: '2023-08-30', label: 'Arcabouço fiscal' },
];
