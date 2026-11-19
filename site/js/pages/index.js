import { rolling12 } from '../calc.js';
import { loadIndex, loadSeries } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { renderTiles, run, showCollected } from './common.js';

run(async () => {
  const [index, data] = await Promise.all([
    loadIndex(),
    loadSeries(['pib_taxa_4tri', 'ipca_mensal', 'meta_selic', 'cambio_dolar']),
  ]);
  showCollected(index);

  const lastOf = (series) => series.findLast(([, value]) => value != null);
  const tile = (label, [date, value], freq, format) => [label, format(value), fmtPeriod(date, freq)];
  renderTiles(document.getElementById('tiles'), [
    tile('PIB, acumulado em 4 trimestres', lastOf(data.pib_taxa_4tri), 'Q', (v) => `${fmtNumber(v, 1)}%`),
    tile('Inflação (IPCA) em 12 meses', lastOf(rolling12(data.ipca_mensal)), 'M', (v) => `${fmtNumber(v, 2)}%`),
    tile('Juros básicos (meta Selic)', lastOf(data.meta_selic), 'D', (v) => `${fmtNumber(v, 2)}% a.a.`),
    tile('Dólar', lastOf(data.cambio_dolar), 'D', (v) => `R$ ${fmtNumber(v, 2)}`),
  ]);
});
