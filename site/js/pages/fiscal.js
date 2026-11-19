import { combine, rollingSum } from '../calc.js';
import { bindPeriod, mount } from '../chart.js';
import { loadIndex, loadSeries, REGIMES } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { renderIdentity, run, showCollected, sourceText } from './common.js';

const BCB = 'Banco Central do Brasil, SGS';
// O Banco Central publica necessidade de financiamento (déficit positivo); aqui déficit é negativo.
const flip = (series) => series.map(([date, value]) => [date, value == null ? null : -value]);

run(async () => {
  const [index, data] = await Promise.all([loadIndex(), loadSeries([
    'primario_gc_pib', 'nominal_gc_pib', 'juros_gc_pib', 'primario_tesouro_pib', 'primario_inss_pib', 'primario_bc_pib',
    'primario_gc', 'nominal_gc', 'juros_gc', 'pib_mensal',
    'rtn_receita_liquida', 'rtn_despesa_total', 'rtn_primario',
    'rtn_previdencia', 'rtn_pessoal', 'rtn_outras_obrigatorias', 'rtn_programacao',
  ])]);
  showCollected(index);
  bindPeriod(document.getElementById('period'));
  const source = (id, codes, seriesId) => {
    document.getElementById(`source-${id}`).textContent =
      sourceText(`${BCB} ${codes}`, data[seriesId].at(-1)[0], 'M', index[seriesId]);
  };

  // ----- identidade com os valores acumulados em 12 meses -----
  const last = (series) => series.at(-1)[1];
  const sum12 = (id) => last(rollingSum(data[id], 12)) / 1000; // R$ milhões -> R$ bilhões
  const signed = (value, decimals) => fmtNumber(value, decimals).replace('-', '−');
  document.getElementById('identity-subtitle').textContent =
    `Acumulado em 12 meses até ${fmtPeriod(data.primario_gc_pib.at(-1)[0], 'M')}. Valor negativo é déficit.`;
  renderIdentity(document.getElementById('identity-pib'), [
    [`${signed(-last(data.nominal_gc_pib), 2)}%`, 'resultado nominal'], '=',
    [`${signed(-last(data.primario_gc_pib), 2)}%`, 'resultado primário'], '−',
    [`${signed(last(data.juros_gc_pib), 2)}%`, 'juros'],
  ]);
  renderIdentity(document.getElementById('identity-brl'), [
    [signed(-sum12('nominal_gc'), 1), 'resultado nominal'], '=',
    [signed(-sum12('primario_gc'), 1), 'resultado primário'], '−',
    [signed(sum12('juros_gc'), 1), 'juros'],
  ]);

  mount(document.getElementById('chart-result'), {
    type: 'line', title: 'Resultado primário e nominal do Governo Central em % do PIB', freq: 'M', unit: '%', decimals: 2,
    series: [
      { name: 'Resultado primário', color: 'var(--series-1)', data: flip(data.primario_gc_pib) },
      { name: 'Resultado nominal', color: 'var(--series-2)', data: flip(data.nominal_gc_pib) },
    ],
    events: REGIMES,
  });
  source('result', '5783 e 5717', 'primario_gc_pib');

  mount(document.getElementById('chart-interest'), {
    type: 'line', title: 'Juros nominais do Governo Central em % do PIB', freq: 'M', unit: '%', decimals: 2,
    series: [{ name: 'Juros', color: 'var(--series-2)', data: data.juros_gc_pib }],
  });
  source('interest', '5750', 'juros_gc_pib');

  mount(document.getElementById('chart-parts'), {
    type: 'line', title: 'Resultado primário do Tesouro, da Previdência e do Banco Central em % do PIB', freq: 'M', unit: '%', decimals: 2,
    series: [
      { name: 'Tesouro Nacional', color: 'var(--series-1)', data: flip(data.primario_tesouro_pib) },
      { name: 'Previdência (INSS)', color: 'var(--series-2)', data: flip(data.primario_inss_pib) },
      { name: 'Banco Central', color: 'var(--series-3)', data: flip(data.primario_bc_pib) },
    ],
  });
  source('parts', '7869, 7870 e 5785', 'primario_inss_pib');

  // ----- acima da linha: receitas e despesas do Tesouro Nacional (R$ milhões) -----
  const RTN = 'Tesouro Nacional, Resultado do Tesouro Nacional, tabela 1.1';
  const rtnSource = (id, extra = '') => {
    document.getElementById(`source-${id}`).textContent =
      `${sourceText(RTN, data.rtn_despesa_total.at(-1)[0], 'M', index.rtn_despesa_total)}${extra}`;
  };
  document.getElementById('identity-rtn-subtitle').textContent =
    `Acumulado em 12 meses até ${fmtPeriod(data.rtn_primario.at(-1)[0], 'M')}, em R$ bilhões.`;
  renderIdentity(document.getElementById('identity-rtn'), [
    [signed(sum12('rtn_primario'), 1), 'resultado primário'], '=',
    [signed(sum12('rtn_receita_liquida'), 1), 'receita líquida'], '−',
    [signed(sum12('rtn_despesa_total'), 1), 'despesa total'],
  ]);

  const pib12 = rollingSum(data.pib_mensal, 12);
  const pctOfGdp = (id) => combine([rollingSum(data[id], 12), pib12], (value, pib) => (value / pib) * 100);
  mount(document.getElementById('chart-revenue'), {
    type: 'line', title: 'Receita líquida e despesa primária do Governo Central em % do PIB', freq: 'M', unit: '%', decimals: 1, zero: false,
    series: [
      { name: 'Receita líquida', color: 'var(--series-1)', data: pctOfGdp('rtn_receita_liquida') },
      { name: 'Despesa total', color: 'var(--series-2)', data: pctOfGdp('rtn_despesa_total') },
    ],
    events: REGIMES,
  });
  rtnSource('revenue', ' PIB: Banco Central, SGS 4380.');

  // Composição ao fim de cada trimestre: barras mensais ficariam finas demais.
  const quarterEnd = (series) => series.filter(([date]) => Number(date.slice(5, 7)) % 3 === 0);
  mount(document.getElementById('chart-spending'), {
    type: 'bars', title: 'Despesa primária do Governo Central por grupo em % do PIB', freq: 'M', unit: '%', decimals: 1,
    totalLabel: 'Despesa total',
    series: [
      { name: 'Previdência', color: 'var(--series-1)', data: quarterEnd(pctOfGdp('rtn_previdencia')) },
      { name: 'Pessoal', color: 'var(--series-2)', data: quarterEnd(pctOfGdp('rtn_pessoal')) },
      { name: 'Outras obrigatórias', color: 'var(--series-3)', data: quarterEnd(pctOfGdp('rtn_outras_obrigatorias')) },
      { name: 'Sujeitas à programação', color: 'var(--series-4)', data: quarterEnd(pctOfGdp('rtn_programacao')) },
    ],
  });
  rtnSource('spending', ' PIB: Banco Central, SGS 4380.');
});
