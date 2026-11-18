import { bindPeriod, mount } from '../chart.js';
import { loadIndex, loadSeries, REGIMES } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { run, showCollected, sourceText } from './common.js';

const COMPONENTS = ['pib', 'consumo_familias', 'fbcf', 'estoques', 'consumo_governo', 'exportacoes', 'importacoes'];

run(async () => {
  const [index, data] = await Promise.all([
    loadIndex(),
    loadSeries(['pib_taxa_4tri', ...COMPONENTS.map((c) => `${c}_corrente`)]),
  ]);
  showCollected(index);
  bindPeriod(document.getElementById('period'));

  // Tabela por trimestre com os componentes em valores correntes (R$ milhões).
  const quarters = data.pib_corrente.map(([date], i) => {
    const v = Object.fromEntries(COMPONENTS.map((c) => [c, data[`${c}_corrente`][i][1]]));
    return { date, y: v.pib, c: v.consumo_familias, i: v.fbcf + v.estoques, g: v.consumo_governo, x: v.exportacoes, m: v.importacoes };
  });

  // ----- identidade com os valores do último trimestre -----
  const last = quarters.at(-1);
  document.getElementById('identity-subtitle').textContent =
    `${fmtPeriod(last.date, 'Q')}, valores correntes, em R$ bilhões.`;
  const identity = document.getElementById('identity');
  const terms = [
    [last.y, 'Y', 'PIB'], '=', [last.c, 'C', 'consumo das famílias'], '+', [last.i, 'I', 'investimento'],
    '+', [last.g, 'G', 'consumo do governo'], '+', '(', [last.x, 'X', 'exportações'], '−', [last.m, 'M', 'importações'], ')',
  ];
  for (const term of terms) {
    const node = document.createElement('div');
    if (typeof term === 'string') {
      node.className = 'op';
      node.textContent = term;
    } else {
      node.className = 'term';
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = fmtNumber(term[0] / 1000, 1);
      const symbol = document.createElement('span');
      symbol.className = 'symbol';
      symbol.textContent = `${term[1]} · ${term[2]}`;
      node.append(value, symbol);
    }
    identity.append(node);
  }

  // ----- crescimento -----
  mount(document.getElementById('chart-growth'), {
    type: 'line', title: 'Crescimento do PIB acumulado em 4 trimestres', freq: 'Q', unit: '%', decimals: 1,
    series: [{ name: 'PIB', color: 'var(--series-1)', data: data.pib_taxa_4tri }],
    events: REGIMES,
  });
  document.getElementById('source-growth').textContent =
    sourceText('IBGE, Contas Nacionais Trimestrais, tabela 5932', data.pib_taxa_4tri.at(-1)[0], 'Q', index.pib_taxa_4tri);

  // ----- participação no PIB -----
  const share = (key) => quarters.map((q) => [q.date, (q[key] / q.y) * 100]);
  mount(document.getElementById('chart-shares'), {
    type: 'bars', title: 'Participação dos componentes da despesa no PIB', freq: 'Q', unit: '%', decimals: 1,
    series: [
      { name: 'Consumo das famílias (C)', color: 'var(--series-1)', data: share('c') },
      { name: 'Investimento (I)', color: 'var(--series-2)', data: share('i') },
      { name: 'Consumo do governo (G)', color: 'var(--series-3)', data: share('g') },
      { name: 'Exportações líquidas (X − M)', color: 'var(--series-4)', data: quarters.map((q) => [q.date, ((q.x - q.m) / q.y) * 100]) },
    ],
  });
  document.getElementById('source-shares').textContent =
    `${sourceText('IBGE, Contas Nacionais Trimestrais, tabela 1846', last.date, 'Q', index.pib_corrente)} Investimento = formação bruta de capital fixo + variação de estoques.`;
});
