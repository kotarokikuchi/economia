import { combine, monthEnd, realRate, rolling12, spreadYearly } from '../calc.js';
import { bindPeriod, mount } from '../chart.js';
import { loadIndex, loadSeries, REGIMES } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { renderTiles, run, showCollected, sourceText } from './common.js';

run(async () => {
  const [index, data] = await Promise.all([
    loadIndex(), loadSeries(['ipca_mensal', 'meta_inflacao', 'meta_selic', 'focus_ipca_12m']),
  ]);
  showCollected(index);
  bindPeriod(document.getElementById('period'));
  const source = (id, origin, seriesId, freq = 'M') => {
    document.getElementById(`source-${id}`).textContent =
      sourceText(origin, data[seriesId].at(-1)[0], freq, index[seriesId]);
  };

  const ipca12 = rolling12(data.ipca_mensal);
  const target = spreadYearly(data.meta_inflacao, ipca12.map(([date]) => date));
  const selic = monthEnd(data.meta_selic);
  const expected = monthEnd(data.focus_ipca_12m);
  const realPast = combine([selic, ipca12], realRate);
  const realExpected = combine([selic, expected], realRate);

  const tile = (label, [date, value], freq, format) => [label, format(value), fmtPeriod(date, freq)];
  const pct = (decimals, suffix = '%') => (v) => `${fmtNumber(v, decimals)}${suffix}`;
  renderTiles(document.getElementById('tiles'), [
    tile('Inflação (IPCA) em 12 meses', ipca12.at(-1), 'M', pct(2)),
    tile('Meta de inflação', data.meta_inflacao.at(-1), 'A', pct(2)),
    tile('Meta Selic', data.meta_selic.at(-1), 'D', pct(2, '% a.a.')),
    tile('Juro real esperado', realExpected.at(-1), 'M', pct(1, '% a.a.')),
  ]);

  mount(document.getElementById('chart-inflation'), {
    type: 'line', title: 'IPCA em 12 meses, meta de inflação e expectativa de mercado', freq: 'M', unit: '%', decimals: 2,
    series: [
      { name: 'IPCA em 12 meses', color: 'var(--series-1)', data: ipca12 },
      { name: 'Meta de inflação', color: 'var(--series-2)', data: target },
      { name: 'Expectativa para os 12 meses seguintes', color: 'var(--neutral)', data: expected, dashed: true },
    ],
  });
  source('inflation', 'IBGE (IPCA, via Banco Central, SGS 433 e 13521) e Boletim Focus', 'ipca_mensal');

  mount(document.getElementById('chart-selic'), {
    type: 'line', title: 'Meta da taxa Selic', freq: 'D', unit: '%', decimals: 2,
    series: [{ name: 'Meta Selic', color: 'var(--series-1)', data: data.meta_selic }],
    events: REGIMES,
  });
  source('selic', 'Banco Central do Brasil, SGS 432', 'meta_selic', 'D');

  mount(document.getElementById('chart-real'), {
    type: 'line', title: 'Juro real passado e esperado', freq: 'M', unit: '%', decimals: 1,
    series: [
      { name: 'Juro real passado', color: 'var(--series-1)', data: realPast },
      { name: 'Juro real esperado', color: 'var(--series-2)', data: realExpected },
    ],
  });
  source('real', 'cálculo próprio com dados do Banco Central (SGS 432 e 433) e do Boletim Focus', 'ipca_mensal');
});
