// Gráficos em SVG, feitos em casa: linha e barras empilhadas.
//
// mount(el, spec) desenha e redesenha quando a largura ou o período mudam.
// spec = {
//   type: 'line' | 'bars',
//   title: texto para leitores de tela,
//   freq: 'D' | 'M' | 'Q',
//   unit: '%', decimals: 1,
//   series: [{ name, color: 'var(--series-1)', data: [[iso, valor]], dashed }],
//   events: [{ date, label }]        // só em 'line': linhas verticais de mudança de regime
//   zero: false                      // só em 'line': não forçar o zero no eixo
//   totalLabel: 'PIB'                // só em 'bars': mostra a soma da coluna na dica e na tabela
// }
import { align, cutoff, nearestIndex, niceTicks, scaleLinear, stack, yearTicks } from './calc.js';
import { fmtNumber, fmtPeriod, fmtTick } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const charts = [];
let periodYears = 10;

function svg(name, attrs, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent?.append(node);
  return node;
}

// Nomes de séries entram sempre por textContent, nunca por innerHTML.
function html(tag, className, text, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  parent?.append(node);
  return node;
}

export function mount(el, spec) {
  const chart = { el, spec, width: 0 };
  charts.push(chart);
  new ResizeObserver(() => {
    if (el.clientWidth !== chart.width) render(chart);
  }).observe(el);
  render(chart);
}

/** Liga o seletor de período da página (inputs radio name="period") a todos os gráficos. */
export function bindPeriod(fieldset) {
  fieldset.addEventListener('change', () => {
    periodYears = Number(fieldset.querySelector('input:checked').value);
    charts.forEach(render);
  });
}

function render(chart) {
  const { el, spec } = chart;
  chart.width = el.clientWidth;
  el.replaceChildren();

  const from = cutoff(new Date().toISOString().slice(0, 10), periodYears);
  const series = spec.series.map((s) => ({ ...s, data: s.data.filter(([date]) => date >= from) }));
  const { dates, cols } = align(series.map((s) => s.data));
  if (!dates.length) {
    html('p', 'chart-empty', 'Sem dados no período selecionado.', el);
    return;
  }
  const decimals = spec.decimals ?? 1;
  const isBars = spec.type === 'bars';
  const suffix = { '%': '%', 'p.p.': ' p.p.' }[spec.unit] ?? '';
  const total = (i) => cols.reduce((sum, col) => sum + (col[i] ?? 0), 0);

  if (series.length > 1) {
    const legend = html('ul', 'legend', null, el);
    for (const s of series) {
      const item = html('li', null, null, legend);
      html('span', isBars ? 'key key-box' : 'key', null, item).style.background = s.color;
      html('span', null, s.name, item);
    }
  }

  // ----- geometria -----
  const width = chart.width || 640;
  const height = width < 480 ? 240 : 300;
  const hasEvents = !isBars && spec.events?.length;
  const m = { left: 46, right: isBars ? 8 : 58, top: hasEvents ? 36 : 12, bottom: 26 };
  const plotW = width - m.left - m.right;
  const plotBottom = height - m.bottom;

  let lo = 0;
  let hi = 0;
  const stacks = isBars ? dates.map((_, i) => stack(cols.map((c) => c[i]))) : null;
  if (isBars) {
    for (const column of stacks) for (const seg of column) if (seg) { lo = Math.min(lo, seg[1]); hi = Math.max(hi, seg[1]); }
  } else {
    const values = cols.flat().filter((v) => v != null);
    lo = Math.min(...values);
    hi = Math.max(...values);
    if (spec.zero !== false) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  }
  // Marcas redondas, mas sem esticar o eixo muito além dos dados (ex.: -25 a 125 para dados de -2 a 102).
  let ticks = niceTicks(lo, hi, 5);
  const step = ticks[1] - ticks[0];
  if (ticks.length > 3 && ticks[0] < lo - step / 2) ticks = ticks.slice(1);
  if (ticks.length > 3 && ticks.at(-1) > hi + step / 2) ticks = ticks.slice(0, -1);
  const y = scaleLinear(Math.min(ticks[0], lo), Math.max(ticks.at(-1), hi), plotBottom, m.top);

  const times = dates.map((d) => Date.parse(d));
  const band = plotW / dates.length;
  const timeX = scaleLinear(times[0], times.at(-1) === times[0] ? times[0] + 1 : times.at(-1), m.left, m.left + plotW);
  const xs = isBars ? dates.map((_, i) => m.left + band * (i + 0.5)) : times.map(timeX);

  const plot = html('div', 'plot', null, el);
  const root = svg('svg', {
    width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', tabindex: 0,
    'aria-label': `${spec.title}. Use as setas esquerda e direita para percorrer os valores.`,
  }, plot);

  // ----- eixos -----
  for (const tick of ticks) {
    svg('line', { class: tick === 0 ? 'baseline' : 'grid', x1: m.left, x2: m.left + plotW, y1: y(tick), y2: y(tick) }, root);
    svg('text', { class: 'tick', x: m.left - 8, y: y(tick), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, root)
      .textContent = fmtTick(tick, step);
  }
  for (const year of yearTicks(dates[0], dates.at(-1), Math.floor(plotW / 52))) {
    let x;
    if (isBars) {
      const inYear = dates.map((d, i) => (d.startsWith(String(year)) ? i : -1)).filter((i) => i >= 0);
      if (!inYear.length) continue;
      x = (xs[inYear[0]] + xs[inYear.at(-1)]) / 2;
    } else {
      x = timeX(Date.parse(`${year}-01-01`));
    }
    svg('text', { class: 'tick', x, y: plotBottom + 18, 'text-anchor': 'middle' }, root).textContent = year;
  }

  // ----- mudanças de regime -----
  if (hasEvents) {
    const visible = spec.events.filter((e) => e.date >= dates[0] && e.date <= dates.at(-1));
    const taken = [[], []]; // trechos horizontais já ocupados em cada uma das duas linhas de rótulo
    for (const event of visible) {
      const x = timeX(Date.parse(event.date));
      const flip = x > m.left + plotW * 0.7;
      const w = event.label.length * 6; // largura estimada do texto de 11px
      const span = flip ? [x - 5 - w, x - 5] : [x + 5, x + 5 + w];
      const row = taken.findIndex((spans) => spans.every(([a, b]) => span[1] + 6 < a || span[0] - 6 > b));
      // Sem espaço em nenhuma linha (telas estreitas): fica só o traço; o nome segue na legenda da página.
      svg('line', { class: 'event', x1: x, x2: x, y1: row < 0 ? m.top : 8 + row * 14, y2: plotBottom }, root);
      if (row < 0) continue;
      taken[row].push(span);
      svg('text', { class: 'event-label', x: flip ? span[1] : span[0], y: 14 + row * 14, 'text-anchor': flip ? 'end' : 'start' }, root)
        .textContent = event.label;
    }
  }

  // ----- marcas -----
  const hover = svg('g', { 'pointer-events': 'none' }, null);
  if (isBars) {
    const barW = Math.max(1, Math.min(24, band - 2));
    const wash = svg('rect', { class: 'wash', y: m.top, width: band, height: plotBottom - m.top, visibility: 'hidden' }, root);
    stacks.forEach((column, i) => {
      const lastUp = column.findLastIndex((seg) => seg && seg[1] > seg[0]);
      const lastDown = column.findLastIndex((seg) => seg && seg[1] < seg[0]);
      column.forEach((seg, s) => {
        if (!seg || seg[0] === seg[1]) return;
        let y0 = y(seg[0]);
        const y1 = y(seg[1]);
        const dir = y1 < y0 ? -1 : 1;
        if (seg[0] !== 0 && Math.abs(y1 - y0) > 3) y0 += dir * 2; // espaço de 2px entre segmentos
        const round = s === lastUp || s === lastDown;
        svg('path', { d: barPath(xs[i] - barW / 2, y0, y1, barW, round), fill: series[s].color }, root);
      });
    });
    hover.wash = wash;
  } else {
    series.forEach((s, k) => {
      let d = '';
      let pen = 'M';
      cols[k].forEach((value, i) => {
        if (value == null) { pen = 'M'; return; }
        d += `${pen}${xs[i].toFixed(1)},${y(value).toFixed(1)}`;
        pen = 'L';
      });
      const path = svg('path', { class: 'line', d, stroke: s.color }, root);
      if (s.dashed) path.setAttribute('stroke-dasharray', '5 4');
    });
    // rótulo direto no último ponto, quando os rótulos não colidem
    const ends = series.map((s, k) => {
      const i = cols[k].findLastIndex((v) => v != null);
      return s.dashed || i < 0 ? null : { color: s.color, x: xs[i], y: y(cols[k][i]), value: cols[k][i] };
    }).filter(Boolean);
    const apart = ends.every((a, i) => ends.every((b, j) => i === j || Math.abs(a.y - b.y) >= 14));
    for (const end of ends) {
      svg('circle', { class: 'ring', cx: end.x, cy: end.y, r: 4, fill: end.color }, root);
      if (apart) {
        svg('text', { class: 'end-label', x: end.x + 9, y: end.y, 'dominant-baseline': 'middle' }, root)
          .textContent = fmtNumber(end.value, decimals);
      }
    }
    hover.cross = svg('line', { class: 'crosshair', y1: m.top, y2: plotBottom }, hover);
    hover.dots = series.map((s) => svg('circle', { class: 'ring', r: 4, fill: s.color }, hover));
  }
  hover.setAttribute('visibility', 'hidden');
  root.append(hover);

  // ----- dica (mouse, toque e teclado) -----
  const tip = html('div', 'tooltip', null, plot);
  tip.hidden = true;
  let current = -1;
  function show(i) {
    current = i;
    tip.replaceChildren(html('div', 'tooltip-title', fmtPeriod(dates[i], spec.freq)));
    series.forEach((s, k) => {
      const row = html('div', 'tooltip-row', null, tip);
      html('span', 'key', null, row).style.background = s.color;
      html('strong', null, `${fmtNumber(cols[k][i], decimals)}${suffix}`, row);
      html('span', null, s.name, row);
    });
    if (spec.totalLabel) {
      const row = html('div', 'tooltip-row tooltip-total', null, tip);
      html('strong', null, `${fmtNumber(total(i), decimals)}${suffix}`, row);
      html('span', null, spec.totalLabel, row);
    }
    if (isBars) {
      hover.wash.setAttribute('x', xs[i] - band / 2);
      hover.wash.setAttribute('visibility', 'visible');
    } else {
      hover.cross.setAttribute('x1', xs[i]);
      hover.cross.setAttribute('x2', xs[i]);
      hover.dots.forEach((dot, k) => {
        const value = cols[k][i];
        dot.setAttribute('visibility', value == null ? 'hidden' : 'inherit');
        if (value != null) { dot.setAttribute('cx', xs[i]); dot.setAttribute('cy', y(value)); }
      });
      hover.setAttribute('visibility', 'visible');
    }
    tip.hidden = false;
    const left = xs[i] > width / 2 ? xs[i] - tip.offsetWidth - 12 : xs[i] + 12;
    tip.style.left = `${Math.max(0, Math.min(left, width - tip.offsetWidth))}px`;
    tip.style.top = `${m.top}px`;
  }
  function hide() {
    current = -1;
    tip.hidden = true;
    hover.setAttribute('visibility', 'hidden');
    hover.wash?.setAttribute('visibility', 'hidden');
  }
  root.addEventListener('pointermove', (e) => show(nearestIndex(xs, e.clientX - root.getBoundingClientRect().left)));
  root.addEventListener('pointerleave', hide);
  root.addEventListener('focus', () => { if (current < 0) show(dates.length - 1); });
  root.addEventListener('blur', hide);
  root.addEventListener('keydown', (e) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    show(Math.max(0, Math.min(dates.length - 1, (current < 0 ? dates.length - 1 : current) + delta)));
  });

  // ----- os mesmos dados em tabela, montada só quando aberta -----
  const details = html('details', 'table-view', null, el);
  html('summary', null, 'Ver dados em tabela', details);
  details.addEventListener('toggle', () => {
    if (!details.open || details.querySelector('table')) return;
    const table = html('table', null, null, html('div', 'table-scroll', null, details));
    const head = html('tr', null, null, html('thead', null, null, table));
    html('th', null, 'Período', head);
    const withUnit = (name) => (spec.unit ? `${name} (${spec.unit})` : name);
    for (const s of series) html('th', null, withUnit(s.name), head);
    if (spec.totalLabel) html('th', null, withUnit(spec.totalLabel), head);
    const body = html('tbody', null, null, table);
    for (let i = dates.length - 1; i >= 0; i--) {
      const row = html('tr', null, null, body);
      html('th', null, fmtPeriod(dates[i], spec.freq), row);
      cols.forEach((col) => html('td', null, fmtNumber(col[i], decimals), row));
      if (spec.totalLabel) html('td', null, fmtNumber(total(i), decimals), row);
    }
  });
}

/** Segmento de barra de y0 (lado da base) a y1 (ponta); ponta arredondada só se `round`. */
function barPath(x, y0, y1, w, round) {
  const dir = y1 < y0 ? 1 : -1;
  const r = round ? Math.min(4, w / 2, Math.abs(y1 - y0)) : 0;
  return `M${x},${y0}V${y1 + dir * r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + dir * r}V${y0}Z`;
}
