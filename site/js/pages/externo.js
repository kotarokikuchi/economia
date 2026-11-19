import { rollingSum } from '../calc.js';
import { bindPeriod, mount } from '../chart.js';
import { loadIndex, loadSeries, REGIMES } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { renderTiles, run, showCollected, sourceText } from './common.js';

const BCB = 'Banco Central do Brasil, SGS';

run(async () => {
  const [index, data] = await Promise.all([loadIndex(), loadSeries([
    'transacoes_correntes_pib', 'transacoes_correntes', 'balanca_comercial', 'idp', 'reservas', 'cambio_dolar',
  ])]);
  showCollected(index);
  bindPeriod(document.getElementById('period'));
  const source = (id, codes, seriesId, freq = 'M') => {
    document.getElementById(`source-${id}`).textContent =
      sourceText(`${BCB} ${codes}`, data[seriesId].at(-1)[0], freq, index[seriesId]);
  };

  // Fluxos mensais em US$ milhões -> acumulado em 12 meses em US$ bilhões.
  const sum12 = (id, sign = 1) => rollingSum(data[id], 12).map(([date, v]) => [date, v == null ? null : (sign * v) / 1000]);
  const billions = (series) => series.map(([date, v]) => [date, v == null ? null : v / 1000]);
  const idp12 = sum12('idp');
  const reserves = billions(data.reservas);
  // A fonte preenche com zero os 11 primeiros meses, antes de haver 12 meses para acumular.
  const currentPib = data.transacoes_correntes_pib.filter(([date]) => date >= '1995-12-01');

  const tile = (label, [date, value], freq, format) => [label, format(value), fmtPeriod(date, freq)];
  renderTiles(document.getElementById('tiles'), [
    tile('Transações correntes em 12 meses, % do PIB', currentPib.at(-1), 'M', (v) => `${fmtNumber(v, 2).replace('-', '−')}%`),
    tile('Investimento direto em 12 meses', idp12.at(-1), 'M', (v) => `US$ ${fmtNumber(v, 1)} bi`),
    tile('Reservas internacionais', reserves.at(-1), 'M', (v) => `US$ ${fmtNumber(v, 0)} bi`),
    tile('Dólar', data.cambio_dolar.at(-1), 'D', (v) => `R$ ${fmtNumber(v, 2)}`),
  ]);

  mount(document.getElementById('chart-current'), {
    type: 'line', title: 'Saldo em transações correntes em % do PIB', freq: 'M', unit: '%', decimals: 2,
    series: [{ name: 'Transações correntes', color: 'var(--series-1)', data: currentPib }],
    events: REGIMES,
  });
  source('current', '23079', 'transacoes_correntes_pib');

  mount(document.getElementById('chart-funding'), {
    type: 'line', title: 'Déficit em transações correntes e investimento direto no país', freq: 'M', unit: 'US$ bi', decimals: 1,
    series: [
      { name: 'Investimento direto no país', color: 'var(--series-1)', data: idp12 },
      { name: 'Déficit em transações correntes', color: 'var(--series-2)', data: sum12('transacoes_correntes', -1) },
    ],
  });
  source('funding', '22885 e 22701', 'idp');

  mount(document.getElementById('chart-trade'), {
    type: 'line', title: 'Saldo da balança comercial em 12 meses', freq: 'M', unit: 'US$ bi', decimals: 1,
    series: [{ name: 'Balança comercial', color: 'var(--series-1)', data: sum12('balanca_comercial') }],
  });
  source('trade', '22707', 'balanca_comercial');

  mount(document.getElementById('chart-reserves'), {
    type: 'line', title: 'Reservas internacionais', freq: 'M', unit: 'US$ bi', decimals: 0,
    series: [{ name: 'Reservas internacionais', color: 'var(--series-1)', data: reserves }],
  });
  source('reserves', '3546', 'reservas');

  mount(document.getElementById('chart-fx'), {
    type: 'line', title: 'Cotação do dólar em reais', freq: 'D', unit: 'R$', decimals: 2, zero: false,
    series: [{ name: 'Dólar', color: 'var(--series-1)', data: data.cambio_dolar }],
    events: REGIMES,
  });
  source('fx', '1', 'cambio_dolar', 'D');
});
