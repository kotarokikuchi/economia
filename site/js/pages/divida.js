import { combine, realRate, simulateDebt, stabilizingPrimary } from '../calc.js';
import { bindPeriod, mount, update } from '../chart.js';
import { loadIndex, loadSeries, REGIMES } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { renderTiles, run, showCollected, sourceText } from './common.js';

const BCB = 'Banco Central do Brasil, SGS';
const INDEXERS = ['divida_selic', 'divida_prefixado', 'divida_ipca', 'divida_cambio'];

run(async () => {
  const [index, data] = await Promise.all([
    loadIndex(), loadSeries(['dbgg_pib', 'dlsp_pib', ...INDEXERS, 'divida_prazo_medio',
      'focus_pib', 'focus_ipca', 'focus_selic', 'focus_primario', 'focus_dbgg']),
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

  // ----- simulador de dinâmica da dívida -----
  const [startDate, startDebt] = data.dbgg_pib.at(-1);
  const startYear = Number(startDate.slice(0, 4));
  const YEARS = 10;
  // Cenário do mercado: média das expectativas do Focus para os 4 anos seguintes ao atual.
  const focusMean = (id) => {
    const values = data[id].filter(([date]) => {
      const year = Number(date.slice(0, 4));
      return year > startYear && year <= startYear + 4;
    }).map(([, value]) => value);
    return values.reduce((a, b) => a + b, 0) / values.length;
  };
  const market = {
    rate: realRate(focusMean('focus_selic'), focusMean('focus_ipca')),
    growth: focusMean('focus_pib'),
    primary: focusMean('focus_primario'),
  };
  const inputs = Object.fromEntries(Object.keys(market).map((key) => [key, document.getElementById(`sim-${key}`)]));
  const signed = (value, decimals = 1) => fmtNumber(value, decimals).replace('-', '−');
  const simChart = document.getElementById('chart-sim');
  // Expectativa do mercado para a dívida no fim de cada ano, posta em dezembro.
  const focusDebt = [[startDate, startDebt], ...data.focus_dbgg
    .filter(([date]) => Number(date.slice(0, 4)) >= startYear)
    .map(([date, value]) => [`${date.slice(0, 4)}-12-01`, value])
    .filter(([date]) => date > startDate)];
  const simSpec = () => {
    const values = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, Number(input.value)]));
    for (const [key, value] of Object.entries(values)) {
      document.getElementById(`sim-${key}-out`).textContent =
        `${signed(value)}% ${key === 'primary' ? 'do PIB' : 'ao ano'}`;
    }
    const path = simulateDebt(startDebt, values.rate, values.growth, values.primary, YEARS);
    const stable = stabilizingPrimary(startDebt, values.rate, values.growth);
    document.getElementById('sim-result').textContent =
      `Com esses valores, a dívida bruta iria de ${fmtNumber(startDebt, 1)}% para ${fmtNumber(path.at(-1), 1)}% do PIB em ${YEARS} anos. `
      + `Para mantê-la onde está, o resultado primário teria de ser de ${signed(stable)}% do PIB`
      + `${stable > 0 ? ' (superávit)' : stable < 0 ? ' (déficit)' : ''}.`;
    return {
      type: 'line', title: 'Trajetória simulada da dívida bruta em % do PIB', freq: 'M', unit: '%', decimals: 1,
      series: [
        { name: 'Dívida bruta (realizado)', color: 'var(--series-1)', data: data.dbgg_pib },
        { name: 'Simulação', color: 'var(--series-2)', dashed: true, sparse: true,
          data: path.map((debt, t) => [`${startYear + t}${startDate.slice(4)}`, debt]) },
        { name: 'Expectativa do mercado (Focus)', color: 'var(--neutral)', dashed: true, sparse: true, data: focusDebt },
      ],
    };
  };
  const reset = () => {
    for (const [key, input] of Object.entries(inputs)) input.value = market[key].toFixed(1);
  };
  reset();
  mount(simChart, simSpec());
  for (const input of Object.values(inputs)) input.addEventListener('input', () => update(simChart, simSpec()));
  document.getElementById('sim-reset').addEventListener('click', () => { reset(); update(simChart, simSpec()); });
  document.getElementById('source-sim').textContent =
    `${sourceText(`${BCB} 13762, e Boletim Focus`, startDate, 'M', index.dbgg_pib)} Simulação: cálculo próprio.`;

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
