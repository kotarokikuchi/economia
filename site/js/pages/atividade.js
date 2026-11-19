import { combine, rollingSum } from '../calc.js';
import { bindPeriod, mount } from '../chart.js';
import { loadIndex, loadSeries, REGIMES } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { renderIdentity, run, showCollected, sourceText } from './common.js';

const COMPONENTS = ['pib', 'consumo_familias', 'fbcf', 'estoques', 'consumo_governo', 'exportacoes', 'importacoes'];
const WITH_RATES = COMPONENTS.filter((c) => c !== 'estoques');
const SECTORS = ['agropecuaria', 'industria', 'servicos'];
const CNT = 'IBGE, Contas Nacionais Trimestrais';

run(async () => {
  const [index, data] = await Promise.all([
    loadIndex(),
    loadSeries([
      ...COMPONENTS.map((c) => `${c}_corrente`),
      ...WITH_RATES.map((c) => `${c}_taxa_anual`),
      'pib_taxa_4tri', 'pib_taxa_trimestral', ...SECTORS.map((s) => `${s}_taxa_4tri`), 'ibc_br',
    ]),
  ]);
  showCollected(index);
  bindPeriod(document.getElementById('period'));
  const source = (id, origin, freq, extra = '') => {
    document.getElementById(`source-${id}`).textContent =
      `${sourceText(origin, data[freq.series].at(-1)[0], freq.freq, index[freq.series])}${extra}`;
  };

  // Tabela por trimestre: valores correntes (R$ milhões) e variação real anual (%) de cada componente.
  const quarters = data.pib_corrente.map(([date], i) => {
    const v = Object.fromEntries(COMPONENTS.map((c) => [c, data[`${c}_corrente`][i][1]]));
    const g = Object.fromEntries(WITH_RATES.map((c) => [c, data[`${c}_taxa_anual`][i][1]]));
    return { date, v, g, y: v.pib, c: v.consumo_familias, i: v.fbcf + v.estoques, gov: v.consumo_governo, x: v.exportacoes, m: v.importacoes };
  });

  // ----- identidade com os valores do último trimestre -----
  const last = quarters.at(-1);
  const bi = (millions) => fmtNumber(millions / 1000, 1);
  document.getElementById('identity-subtitle').textContent =
    `${fmtPeriod(last.date, 'Q')}, valores correntes, em R$ bilhões.`;
  renderIdentity(document.getElementById('identity'), [
    [bi(last.y), 'Y · PIB'], '=', [bi(last.c), 'C · consumo das famílias'], '+', [bi(last.i), 'I · investimento'],
    '+', [bi(last.gov), 'G · consumo do governo'], '+', '(', [bi(last.x), 'X · exportações'], '−', [bi(last.m), 'M · importações'], ')',
  ]);

  // ----- crescimento acumulado em 4 trimestres -----
  mount(document.getElementById('chart-growth'), {
    type: 'line', title: 'Crescimento do PIB acumulado em 4 trimestres', freq: 'Q', unit: '%', decimals: 1,
    series: [{ name: 'PIB', color: 'var(--series-1)', data: data.pib_taxa_4tri }],
    events: REGIMES,
  });
  source('growth', `${CNT}, tabela 5932`, { series: 'pib_taxa_4tri', freq: 'Q' });

  // ----- crescimento na margem -----
  mount(document.getElementById('chart-quarterly'), {
    type: 'bars', title: 'Crescimento do PIB contra o trimestre anterior', freq: 'Q', unit: '%', decimals: 1,
    series: [{ name: 'PIB', color: 'var(--series-1)', data: data.pib_taxa_trimestral }],
  });
  source('quarterly', `${CNT}, tabela 5932`, { series: 'pib_taxa_trimestral', freq: 'Q' });

  // ----- contribuição de cada componente ao crescimento anual -----
  // Aproximação usual: peso do componente no PIB nominal de um ano antes x seu crescimento real.
  // O resíduo (estoques e diferenças do encadeamento) fecha a conta com o PIB oficial.
  const contributions = quarters.slice(4).flatMap((q, k) => {
    const base = quarters[k];
    if (Object.values(q.g).includes(null)) return [];
    const part = (c) => (base.v[c] / base.y) * q.g[c];
    const row = { date: q.date, c: part('consumo_familias'), i: part('fbcf'), g: part('consumo_governo'), nx: part('exportacoes') - part('importacoes') };
    return [{ ...row, rest: q.g.pib - row.c - row.i - row.g - row.nx }];
  });
  const contribution = (key) => contributions.map((row) => [row.date, row[key]]);
  mount(document.getElementById('chart-contributions'), {
    type: 'bars', title: 'Contribuição de cada componente ao crescimento do PIB', freq: 'Q', unit: 'p.p.', decimals: 1,
    totalLabel: 'Crescimento do PIB',
    series: [
      { name: 'Consumo das famílias', color: 'var(--series-1)', data: contribution('c') },
      { name: 'Investimento fixo', color: 'var(--series-2)', data: contribution('i') },
      { name: 'Consumo do governo', color: 'var(--series-3)', data: contribution('g') },
      { name: 'Exportações líquidas', color: 'var(--series-4)', data: contribution('nx') },
      { name: 'Estoques e resíduo', color: 'var(--neutral)', data: contribution('rest') },
    ],
  });
  source('contributions', `cálculo próprio com dados do ${CNT}, tabelas 1846 e 5932`, { series: 'pib_taxa_anual', freq: 'Q' });

  // ----- participação no PIB -----
  const share = (fn) => quarters.map((q) => [q.date, (fn(q) / q.y) * 100]);
  mount(document.getElementById('chart-shares'), {
    type: 'bars', title: 'Participação dos componentes da despesa no PIB', freq: 'Q', unit: '%', decimals: 1,
    series: [
      { name: 'Consumo das famílias (C)', color: 'var(--series-1)', data: share((q) => q.c) },
      { name: 'Investimento (I)', color: 'var(--series-2)', data: share((q) => q.i) },
      { name: 'Consumo do governo (G)', color: 'var(--series-3)', data: share((q) => q.gov) },
      { name: 'Exportações líquidas (X − M)', color: 'var(--series-4)', data: share((q) => q.x - q.m) },
    ],
  });
  source('shares', `${CNT}, tabela 1846`, { series: 'pib_corrente', freq: 'Q' },
    ' Investimento = formação bruta de capital fixo + variação de estoques.');

  // ----- taxa de investimento -----
  const investmentRate = combine(
    [rollingSum(data.fbcf_corrente, 4), rollingSum(data.pib_corrente, 4)],
    (fbcf, pib) => (fbcf / pib) * 100,
  );
  mount(document.getElementById('chart-investment'), {
    type: 'line', title: 'Taxa de investimento', freq: 'Q', unit: '%', decimals: 1, zero: false,
    series: [{ name: 'Taxa de investimento', color: 'var(--series-2)', data: investmentRate }],
  });
  source('investment', `cálculo próprio com dados do ${CNT}, tabela 1846`, { series: 'fbcf_corrente', freq: 'Q' });

  // ----- ótica da oferta -----
  mount(document.getElementById('chart-sectors'), {
    type: 'line', title: 'Crescimento por setor acumulado em 4 trimestres', freq: 'Q', unit: '%', decimals: 1,
    series: [
      { name: 'Agropecuária', color: 'var(--series-1)', data: data.agropecuaria_taxa_4tri },
      { name: 'Indústria', color: 'var(--series-2)', data: data.industria_taxa_4tri },
      { name: 'Serviços', color: 'var(--series-3)', data: data.servicos_taxa_4tri },
    ],
  });
  source('sectors', `${CNT}, tabela 5932`, { series: 'servicos_taxa_4tri', freq: 'Q' });

  // ----- prévia mensal -----
  mount(document.getElementById('chart-ibc'), {
    type: 'line', title: 'IBC-Br, índice de atividade do Banco Central', freq: 'M', unit: 'índice', decimals: 1, zero: false,
    series: [{ name: 'IBC-Br', color: 'var(--series-1)', data: data.ibc_br }],
  });
  source('ibc', 'Banco Central do Brasil, SGS 24364', { series: 'ibc_br', freq: 'M' });
});
