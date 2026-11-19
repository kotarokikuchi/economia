import { combine } from '../calc.js';
import { bindPeriod, mount } from '../chart.js';
import { loadIndex, loadSeries, REGIMES } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { renderTiles, run, showCollected, sourceText } from './common.js';

const BCB = 'Banco Central do Brasil, SGS';
const INDEXERS = ['divida_selic', 'divida_prefixado', 'divida_ipca', 'divida_cambio'];

run(async () => {
  const [index, data] = await Promise.all([
    loadIndex(), loadSeries(['dbgg_pib', 'dlsp_pib', ...INDEXERS, 'divida_prazo_medio']),
  ]);
  showCollected(index);
  bindPeriod(document.getElementById('period'));
  const source = (id, codes, seriesId) => {
    document.getElementById(`source-${id}`).textContent =
      sourceText(`${BCB} ${codes}`, data[seriesId].at(-1)[0], 'M', index[seriesId]);
  };

  const years = data.divida_prazo_medio.map(([date, months]) => [date, months == null ? null : months / 12]);
  const tile = (label, [date, value], format) => [label, format(value), fmtPeriod(date, 'M')];
  renderTiles(document.getElementById('tiles'), [
    tile('Dívida bruta (DBGG)', data.dbgg_pib.at(-1), (v) => `${fmtNumber(v, 1)}% do PIB`),
    tile('Dívida líquida (DLSP)', data.dlsp_pib.at(-1), (v) => `${fmtNumber(v, 1)}% do PIB`),
    tile('Prazo médio dos títulos', years.at(-1), (v) => `${fmtNumber(v, 1)} anos`),
  ]);

  mount(document.getElementById('chart-debt'), {
    type: 'line', title: 'Dívida bruta do governo geral e dívida líquida do setor público em % do PIB', freq: 'M', unit: '%', decimals: 1,
    series: [
      { name: 'Dívida bruta (DBGG)', color: 'var(--series-1)', data: data.dbgg_pib },
      { name: 'Dívida líquida (DLSP)', color: 'var(--series-2)', data: data.dlsp_pib },
    ],
    events: REGIMES,
  });
  source('debt', '13762 e 4513', 'dbgg_pib');

  // Composição ao fim de cada trimestre: barras mensais ficariam finas demais.
  const quarterEnd = (series) => series.filter(([date]) => Number(date.slice(5, 7)) % 3 === 0);
  const others = combine(INDEXERS.map((id) => data[id]), (...shares) => Math.max(0, 100 - shares.reduce((a, b) => a + b, 0)));
  mount(document.getElementById('chart-index'), {
    type: 'bars', title: 'Composição dos títulos públicos federais por indexador', freq: 'M', unit: '%', decimals: 1,
    series: [
      { name: 'Selic', color: 'var(--series-1)', data: quarterEnd(data.divida_selic) },
      { name: 'Prefixado', color: 'var(--series-2)', data: quarterEnd(data.divida_prefixado) },
      { name: 'Inflação (IPCA)', color: 'var(--series-3)', data: quarterEnd(data.divida_ipca) },
      { name: 'Câmbio', color: 'var(--series-4)', data: quarterEnd(data.divida_cambio) },
      { name: 'Outros', color: 'var(--neutral)', data: quarterEnd(others) },
    ],
  });
  source('index', '4177, 4178, 12001 e 4173 (dívida mobiliária, posição em carteira)', 'divida_selic');

  mount(document.getElementById('chart-maturity'), {
    type: 'line', title: 'Prazo médio dos títulos do Tesouro Nacional em anos', freq: 'M', unit: 'anos', decimals: 1, zero: false,
    series: [{ name: 'Prazo médio', color: 'var(--series-1)', data: years }],
  });
  source('maturity', '10618', 'divida_prazo_medio');
});
