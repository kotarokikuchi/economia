import { pctChange, rolling12 } from '../calc.js';
import { loadIndex, loadSeries } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { renderTiles, run, showCollected } from './common.js';

// Linhas da tabela de expectativas: [série, rótulo, casas decimais, prefixo, sufixo].
const FOCUS = [
  ['focus_pib', 'Crescimento do PIB (%)', 2, '', ''],
  ['focus_ipca', 'Inflação, IPCA (%)', 2, '', ''],
  ['focus_selic', 'Meta Selic no fim do ano (% a.a.)', 2, '', ''],
  ['focus_cambio', 'Dólar no fim do ano', 2, 'R$ ', ''],
  ['focus_primario', 'Resultado primário (% do PIB)', 2, '', ''],
  ['focus_dbgg', 'Dívida bruta (% do PIB)', 1, '', ''],
];

run(async () => {
  const [index, data] = await Promise.all([
    loadIndex(),
    loadSeries(['pib_taxa_4tri', 'ipca_mensal', 'meta_selic', 'cambio_dolar', 'primario_gc_pib', 'dbgg_pib',
      'transacoes_correntes_pib', 'm1', ...FOCUS.map(([id]) => id)]),
  ]);
  showCollected(index);

  const minus = (text) => text.replace('-', '−');
  const lastOf = (series) => series.findLast(([, value]) => value != null);
  const tile = (label, [date, value], freq, format) => [label, minus(format(value)), fmtPeriod(date, freq)];
  const [primaryDate, primaryNeed] = lastOf(data.primario_gc_pib); // o Banco Central publica déficit como positivo
  renderTiles(document.getElementById('tiles'), [
    tile('PIB, acumulado em 4 trimestres', lastOf(data.pib_taxa_4tri), 'Q', (v) => `${fmtNumber(v, 1)}%`),
    tile('Inflação (IPCA) em 12 meses', lastOf(rolling12(data.ipca_mensal)), 'M', (v) => `${fmtNumber(v, 2)}%`),
    tile('Juros básicos (meta Selic)', lastOf(data.meta_selic), 'D', (v) => `${fmtNumber(v, 2)}% a.a.`),
    tile('Dólar', lastOf(data.cambio_dolar), 'D', (v) => `R$ ${fmtNumber(v, 2)}`),
    tile('Resultado primário em 12 meses, % do PIB', [primaryDate, -primaryNeed], 'M', (v) => `${fmtNumber(v, 2)}%`),
    tile('Dívida bruta, % do PIB', lastOf(data.dbgg_pib), 'M', (v) => `${fmtNumber(v, 1)}%`),
    tile('Transações correntes em 12 meses, % do PIB', lastOf(data.transacoes_correntes_pib), 'M', (v) => `${fmtNumber(v, 2)}%`),
    tile('M1, crescimento em 12 meses', lastOf(pctChange(data.m1, 12)), 'M', (v) => `${fmtNumber(v, 1)}%`),
  ]);

  // ----- expectativas do Focus para o ano corrente e o seguinte -----
  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear + 1];
  const table = document.getElementById('focus');
  const cell = (row, tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    row.append(node);
  };
  const head = table.createTHead().insertRow();
  cell(head, 'th', 'Indicador');
  years.forEach((year) => cell(head, 'th', String(year)));
  const body = table.createTBody();
  for (const [id, label, decimals, prefix, suffix] of FOCUS) {
    const byYear = new Map(data[id].map(([date, value]) => [Number(date.slice(0, 4)), value]));
    const row = body.insertRow();
    cell(row, 'th', label);
    years.forEach((year) => {
      const value = byYear.get(year);
      cell(row, 'td', value == null ? '–' : minus(`${prefix}${fmtNumber(value, decimals)}${suffix}`));
    });
  }
  document.getElementById('focus-subtitle').append(
    ` Pesquisa coletada em ${fmtPeriod(index.focus_ipca.ok_at, 'D')}.`,
  );
});
