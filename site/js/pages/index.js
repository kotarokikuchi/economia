import { rolling12 } from '../calc.js';
import { loadIndex, loadSeries } from '../data.js';
import { fmtNumber, fmtPeriod } from '../format.js';
import { run, showCollected } from './common.js';

run(async () => {
  const [index, data] = await Promise.all([
    loadIndex(),
    loadSeries(['pib_taxa_4tri', 'ipca_mensal', 'meta_selic', 'cambio_dolar']),
  ]);
  showCollected(index);

  const lastOf = (series) => series.findLast(([, value]) => value != null);
  const tiles = [
    ['PIB, acumulado em 4 trimestres', lastOf(data.pib_taxa_4tri), 'Q', (v) => `${fmtNumber(v, 1)}%`],
    ['Inflação (IPCA) em 12 meses', lastOf(rolling12(data.ipca_mensal)), 'M', (v) => `${fmtNumber(v, 2)}%`],
    ['Juros básicos (meta Selic)', lastOf(data.meta_selic), 'D', (v) => `${fmtNumber(v, 2)}% a.a.`],
    ['Dólar', lastOf(data.cambio_dolar), 'D', (v) => `R$ ${fmtNumber(v, 2)}`],
  ];
  const container = document.getElementById('tiles');
  for (const [label, [date, value], freq, format] of tiles) {
    const tile = document.createElement('figure');
    tile.className = 'card tile';
    for (const [className, text] of [['label', label], ['value', format(value)], ['period', fmtPeriod(date, freq)]]) {
      const node = document.createElement('div');
      node.className = className;
      node.textContent = text;
      tile.append(node);
    }
    container.append(tile);
  }
});
