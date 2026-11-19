import { loadIndex } from '../data.js';
import { fmtPeriod } from '../format.js';
import { run, showCollected } from './common.js';

const FREQUENCY = { D: 'diária', M: 'mensal', Q: 'trimestral', A: 'anual' };

run(async () => {
  const index = await loadIndex();
  showCollected(index);
  const series = Object.values(index);

  const table = document.getElementById('series');
  const cell = (row, tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    row.append(node);
  };
  const head = table.createTHead().insertRow();
  ['Série', 'Fonte', 'Unidade', 'Periodicidade', 'Última coleta'].forEach((title) => cell(head, 'th', title));
  const body = table.createTBody();
  for (const s of series) {
    const row = body.insertRow();
    cell(row, 'th', s.name);
    cell(row, 'td', s.ref ?? '–');
    cell(row, 'td', s.unit);
    cell(row, 'td', FREQUENCY[s.freq] ?? s.freq);
    const collected = s.ok_at ? fmtPeriod(s.ok_at, 'D') : 'nunca';
    cell(row, 'td', s.error ? `${collected} (última tentativa falhou)` : collected);
  }

  const failed = series.filter((s) => s.error).length;
  document.getElementById('series-summary').append(
    ` São ${series.length} séries; ${failed === 0 ? 'todas foram atualizadas na última coleta' : `${failed} não puderam ser atualizadas na última coleta`}.`,
  );
});
