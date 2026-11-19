import { combine, pctChange, rolling12, rollingSum } from '../calc.js';
import { bindPeriod, mount } from '../chart.js';
import { loadIndex, loadSeries, REGIMES } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { renderIdentity, run, showCollected, sourceText } from './common.js';

const BCB = 'Banco Central do Brasil, SGS';

run(async () => {
  const ids = ['base_monetaria', 'papel_moeda_emitido', 'reservas_bancarias', 'pmpp', 'depositos_vista',
    'm1', 'm2', 'm3', 'm4', 'ipca_mensal', 'pib_mensal'];
  const [index, data] = await Promise.all([loadIndex(), loadSeries(ids)]);
  showCollected(index);
  bindPeriod(document.getElementById('period'));
  const source = (id, origin, seriesId) => {
    document.getElementById(`source-${id}`).textContent =
      sourceText(origin, data[seriesId].at(-1)[0], 'M', index[seriesId]);
  };

  // ----- identidades com os saldos do último mês (as séries vêm em R$ mil) -----
  const lastDate = data.m1.at(-1)[0];
  const bi = (id) => fmtNumber(new Map(data[id]).get(lastDate) / 1e6, 1);
  document.getElementById('identity-subtitle').textContent =
    `${fmtPeriod(lastDate, 'M')}, saldos em fim de período, em R$ bilhões.`;
  renderIdentity(document.getElementById('identity-base'), [
    [bi('base_monetaria'), 'B · base monetária'], '=', [bi('papel_moeda_emitido'), 'papel-moeda emitido'],
    '+', [bi('reservas_bancarias'), 'reservas bancárias'],
  ]);
  renderIdentity(document.getElementById('identity-m1'), [
    [bi('m1'), 'M1'], '=', [bi('pmpp'), 'PMPP · papel-moeda em poder do público'],
    '+', [bi('depositos_vista'), 'depósitos à vista'],
  ]);

  // ----- agregados em % do PIB (agregados em R$ mil; PIB mensal em R$ milhões) -----
  const pib12 = rollingSum(data.pib_mensal, 12);
  const pctOfGdp = (id) => combine([data[id], pib12], (m, pib) => (m / 1000 / pib) * 100);
  mount(document.getElementById('chart-aggregates'), {
    type: 'line', title: 'Meios de pagamento M1 a M4 em % do PIB', freq: 'M', unit: '%', decimals: 1,
    series: ['m1', 'm2', 'm3', 'm4'].map((id, k) => (
      { name: id.toUpperCase(), color: `var(--series-${k + 1})`, data: pctOfGdp(id) }
    )),
  });
  source('aggregates', `cálculo próprio com dados do ${BCB} 27791, 27810, 27813, 27815 e 4380`, 'm4');

  // ----- crescimento em 12 meses contra a inflação -----
  mount(document.getElementById('chart-growth'), {
    type: 'line', title: 'Crescimento em 12 meses da base monetária, do M1 e do M4, e inflação', freq: 'M', unit: '%', decimals: 1,
    series: [
      { name: 'Base monetária', color: 'var(--series-1)', data: pctChange(data.base_monetaria, 12) },
      { name: 'M1', color: 'var(--series-2)', data: pctChange(data.m1, 12) },
      { name: 'M4', color: 'var(--series-3)', data: pctChange(data.m4, 12) },
      { name: 'Inflação (IPCA)', color: 'var(--neutral)', data: rolling12(data.ipca_mensal), dashed: true },
    ],
    events: REGIMES,
  });
  source('growth', `cálculo próprio com dados do ${BCB} 1788, 27791, 27815 e 433`, 'm1');

  // ----- multiplicador e velocidade -----
  mount(document.getElementById('chart-multiplier'), {
    type: 'line', title: 'Multiplicador monetário, M1 dividido pela base monetária', freq: 'M', unit: '', decimals: 2, zero: false,
    series: [{ name: 'Multiplicador', color: 'var(--series-1)', data: combine([data.m1, data.base_monetaria], (m1, base) => m1 / base) }],
  });
  source('multiplier', `cálculo próprio com dados do ${BCB} 27791 e 1788`, 'm1');

  mount(document.getElementById('chart-velocity'), {
    type: 'line', title: 'Velocidade de circulação do M1', freq: 'M', unit: '', decimals: 1, zero: false,
    series: [{ name: 'Velocidade', color: 'var(--series-1)', data: combine([data.m1, pib12], (m1, pib) => pib / (m1 / 1000)) }],
  });
  source('velocity', `cálculo próprio com dados do ${BCB} 27791 e 4380`, 'm1');
});
