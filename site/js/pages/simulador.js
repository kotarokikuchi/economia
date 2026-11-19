import { rolling12 } from '../calc.js';
import { mount, update } from '../chart.js';
import { loadIndex, loadSeries } from '../data.js';
import { fmtNumber } from '../format.js';
import { calibrate, simulate, solveLever, todayLevers } from '../model.js';
import { run, showCollected } from './common.js';

const NS = 'http://www.w3.org/2000/svg';
const YEARS = 10;
const COMPONENTS = ['pib', 'consumo_familias', 'fbcf', 'estoques', 'consumo_governo', 'exportacoes', 'importacoes'];

function svg(name, attrs = {}, parent, text) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text != null) node.textContent = text;
  parent?.append(node);
  return node;
}
const signed = (value, decimals = 1) => `${value > 0 ? '+' : ''}${fmtNumber(value, decimals)}`.replace('-', '−');
const pct = (value, decimals = 1) => `${fmtNumber(value, decimals).replace('-', '−')}%`;
/** Variação contra o cenário sem mudanças, em texto. */
function versus(value, reference, unit = '%') {
  const diff = unit === '%' ? (value / reference - 1) * 100 : value - reference;
  if (Math.abs(diff) < 0.05) return 'sem alteração';
  return `${diff > 0 ? '▲' : '▼'} ${fmtNumber(Math.abs(diff), 1)}${unit === '%' ? '%' : ' p.p.'}`;
}

// ---------------------------------------------------------------- a máquina de tanques

// Altura da marca "sem mudanças" nos tanques: abaixo do meio, para não cruzar os textos.
const REFERENCE_LEVEL = 0.4;
// Quanto cada tanque varia entre vazio e o dobro da marca (fração do valor sem mudanças).
const RANGE = { income: 0.08, government: 0.2, credit: 0.25, families: 0.08, investment: 0.25 };
// No tanque do exterior, a altura inteira corresponde a esta variação do saldo externo, em pontos do PIB.
const ABROAD_SPAN = 8;

/**
 * Tanque com líquido. funnel: fundo afunilado. drag: { label, hint, onDrag(fração), onStep(±1) } torna o
 * nível arrastável (mouse, toque e setas do teclado). Devolve a função que atualiza nível e textos.
 */
function makeTank(root, { id, x, y, w, h, funnel = true, title, kind = 'water', drag }) {
  const cx = x + w / 2;
  const shoulder = y + h * 0.62;
  const d = funnel
    ? `M${x},${y}H${x + w}V${shoulder}L${cx + 9},${y + h}H${cx - 9}L${x},${shoulder}Z`
    : `M${x},${y}H${x + w}V${y + h}H${x}Z`;
  svg('path', { d }, svg('clipPath', { id: `clip-${id}` }, root));
  svg('path', { d, class: 'tank-back' }, root);
  const liquid = svg('rect', { x, width: w, y: y + h / 2, height: h / 2, class: kind, 'clip-path': `url(#clip-${id})` }, root);
  const mark = svg('line', { x1: x, x2: x + w, y1: y + h / 2, y2: y + h / 2, class: 'tank-mark' }, root);
  svg('path', { d, class: 'tank' }, root);
  svg('text', { x: cx, y: y + 16, class: 'tank-title' }, root, title);
  const value = svg('text', { x: cx, y: y + 32, class: 'tank-value' }, root);
  const delta = svg('text', { x: cx, y: y + 46, class: 'tank-delta' }, root);

  let grip = null;
  let hit = null;
  if (drag) {
    grip = svg('circle', { cx: x + w, cy: y + h / 2, r: 5.5, class: 'grip' }, root); // na parede do tanque, fora dos textos
    hit = svg('rect', {
      x, y, width: w, height: h, class: 'tank-hit', tabindex: 0, role: 'slider',
      'aria-orientation': 'vertical', 'aria-label': drag.label, 'aria-valuemin': 0, 'aria-valuemax': 100,
    }, root);
    svg('title', {}, hit, drag.hint);
    const fractionAt = (event) => {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(root.getScreenCTM().inverse());
      return Math.min(0.98, Math.max(0.02, 1 - (point.y - y) / h));
    };
    hit.addEventListener('pointerdown', (event) => {
      hit.setPointerCapture(event.pointerId);
      root.classList.add('dragging'); // sem transição: a água acompanha o dedo
      drag.onDrag(fractionAt(event));
    });
    hit.addEventListener('pointermove', (event) => {
      if (hit.hasPointerCapture(event.pointerId)) drag.onDrag(fractionAt(event));
    });
    const release = () => root.classList.remove('dragging');
    hit.addEventListener('pointerup', release);
    hit.addEventListener('pointercancel', release);
    hit.addEventListener('keydown', (event) => {
      const direction = { ArrowUp: 1, ArrowDown: -1 }[event.key];
      if (!direction) return;
      event.preventDefault();
      drag.onStep(direction);
    });
  }

  return {
    fraction: REFERENCE_LEVEL,
    /** fraction: 0 = vazio, 1 = cheio. markFraction: onde fica a marca de referência. */
    set(fraction, valueText, deltaText, markFraction = REFERENCE_LEVEL) {
      this.fraction = fraction;
      const level = Math.min(0.96, Math.max(0.06, fraction));
      liquid.setAttribute('y', y + h * (1 - level));
      liquid.setAttribute('height', h * level);
      grip?.setAttribute('cy', y + h * (1 - level));
      hit?.setAttribute('aria-valuenow', Math.round(level * 100));
      hit?.setAttribute('aria-valuetext', `${valueText}, ${deltaText}`);
      mark.setAttribute('y1', y + h * (1 - markFraction));
      mark.setAttribute('y2', y + h * (1 - markFraction));
      value.textContent = valueText;
      delta.textContent = deltaText;
    },
  };
}

/** Cano: uma linha cuja espessura mostra o tamanho do fluxo, com a água correndo por cima. */
function makePipe(root, d) {
  const base = svg('path', { d, class: 'pipe' }, root);
  const flow = svg('path', { d, class: 'pipe-flow' }, root);
  return {
    set(share, path) {
      const width = Math.max(1.5, Math.min(16, 20 * Math.abs(share)));
      base.setAttribute('stroke-width', width);
      flow.setAttribute('stroke-width', Math.max(1, width / 3));
      if (path) { base.setAttribute('d', path); flow.setAttribute('d', path); }
    },
  };
}

function makeValve(root, x, y, horizontal = false) {
  const d = horizontal
    ? `M${x - 7},${y - 7}V${y + 7}L${x + 7},${y - 7}V${y + 7}Z`
    : `M${x - 7},${y - 7}H${x + 7}L${x - 7},${y + 7}H${x + 7}Z`;
  svg('path', { d, class: 'valve' }, root);
}

/** Rótulo de duas linhas ao lado de um cano. Devolve a função que troca a segunda linha (e, se dado, o título). */
function makeLabel(root, x, y, title, anchor = 'start') {
  const heading = svg('text', { x, y, class: 'pipe-label', 'text-anchor': anchor }, root, title);
  const value = svg('text', { x, y: y + 13, class: 'pipe-value', 'text-anchor': anchor }, root);
  return (text, newTitle) => {
    value.textContent = text;
    if (newTitle) heading.textContent = newTitle;
  };
}

function buildMachine(container, drag) {
  const root = svg('svg', { viewBox: '0 0 640 612', role: 'img', 'aria-labelledby': 'machine-desc' }, container);
  const desc = svg('desc', { id: 'machine-desc' }, root);

  // Canos primeiro, para os tanques ficarem por cima das pontas.
  const pipes = {
    back: makePipe(root, 'M550,572H14V70H60'),          // tudo o que é gasto volta como renda
    taxes: makePipe(root, 'M110,106V196'),
    savings: makePipe(root, 'M250,106V196'),
    consumption: makePipe(root, 'M400,106V196'),
    imports: makePipe(root, 'M470,70H550V196'),
    exports: makePipe(root, 'M550,292V572'),
    deficit: makePipe(root, 'M200,240H160'),
    investment: makePipe(root, 'M250,292V372'),
    investmentOut: makePipe(root, 'M250,468V572'),
    government: makePipe(root, 'M110,292V572'),
    families: makePipe(root, 'M400,292V572'),
  };
  svg('path', { d: 'M60,232H44V372', class: 'debt-link' }, root);
  svg('circle', { cx: 14, cy: 572, r: 10, class: 'pump' }, root);
  svg('path', { d: 'M9,575L14,566L19,575Z', class: 'pump-arrow' }, root);

  const tanks = {
    income: makeTank(root, { id: 'income', x: 60, y: 14, w: 410, h: 92, funnel: false, title: 'RENDA DO PAÍS (PIB)' }),
    government: makeTank(root, { id: 'government', x: 60, y: 196, w: 100, h: 96, title: 'GOVERNO (G)', drag: drag.government }),
    credit: makeTank(root, { id: 'credit', x: 200, y: 196, w: 100, h: 96, title: 'POUPANÇA' }),
    families: makeTank(root, { id: 'families', x: 350, y: 196, w: 100, h: 96, title: 'FAMÍLIAS (C)', drag: drag.families }),
    abroad: makeTank(root, { id: 'abroad', x: 500, y: 196, w: 100, h: 96, title: 'EXTERIOR', drag: drag.abroad }),
    investment: makeTank(root, { id: 'investment', x: 200, y: 372, w: 100, h: 96, title: 'INVESTIMENTO (I)', drag: drag.investment }),
    debt: makeTank(root, { id: 'debt', x: 28, y: 372, w: 66, h: 130, funnel: false, title: 'DÍVIDA', kind: 'debt-water' }),
  };

  makeValve(root, 110, 150);
  makeValve(root, 250, 332);
  makeValve(root, 110, 420);
  makeValve(root, 550, 150);
  makeValve(root, 550, 380);

  const labels = {
    taxes: makeLabel(root, 124, 146, 'impostos'),
    savings: makeLabel(root, 264, 146, 'poupança'),
    consumption: makeLabel(root, 414, 146, 'consumo'),
    imports: makeLabel(root, 536, 124, 'importações', 'end'),
    fx: makeLabel(root, 564, 146, 'dólar'),
    inflation: makeLabel(root, 482, 22, 'transbordo: inflação'),
    deficit: makeLabel(root, 180, 310, '', 'middle'),
    selic: makeLabel(root, 264, 328, 'Selic'),
    spending: makeLabel(root, 124, 416, 'gasto'),
    world: makeLabel(root, 536, 376, 'mundo cresce', 'end'),
    exports: makeLabel(root, 536, 430, 'exportações', 'end'),
    interest: makeLabel(root, 61, 520, 'juros da dívida', 'middle'),
  };
  svg('text', { x: 300, y: 597, class: 'pipe-label', 'text-anchor': 'middle' }, root,
    'tudo o que é gasto no país volta como renda no ano seguinte');
  // Gotas do transbordo: uma por ponto percentual de inflação.
  const drops = Array.from({ length: 14 }, (_, i) => svg('circle', { cx: 486 + i * 9, cy: 50, r: 3, class: 'water drop' }, root));

  return { desc, pipes, tanks, labels, drops };
}

function drawMachine(machine, s, ref, levers, base) {
  const { pipes, tanks, labels } = machine;
  const share = (flow) => flow / s.Y;
  const savings = s.Y - s.T - s.C;
  const refSavings = ref.Y - ref.T - ref.C;
  const deficit = s.G - s.T;
  // Nível do tanque: na marca quando igual ao cenário sem mudanças; vazio em -range, o dobro da marca em +range.
  const level = (value, reference, range) => REFERENCE_LEVEL * (1 + (value / reference - 1) / range);
  const ofGdp = (flow) => `${pct(share(flow) * 100)} do PIB`;

  tanks.income.set(level(s.Y, ref.Y, RANGE.income), `R$ ${fmtNumber(s.Y / 1000, 2)} trilhões · cresce ${pct(s.growth)}`, versus(s.Y, ref.Y));
  tanks.government.set(level(s.G, ref.G, RANGE.government), ofGdp(s.G), versus(s.G, ref.G));
  tanks.credit.set(level(savings, refSavings, RANGE.credit), ofGdp(savings), versus(savings, refSavings));
  tanks.families.set(level(s.C, ref.C, RANGE.families), ofGdp(s.C), versus(s.C, ref.C));
  tanks.investment.set(level(s.I, ref.I, RANGE.investment), ofGdp(s.I), versus(s.I, ref.I));
  tanks.abroad.set(REFERENCE_LEVEL - (s.current - ref.current) / ABROAD_SPAN, `saldo ${pct(s.current)}`, versus(s.current, ref.current, 'pp'));
  tanks.debt.set(s.debt / 200, pct(s.debt), 'do PIB', base.debt / 200);

  pipes.back.set(0.7);
  pipes.taxes.set(share(s.T));
  pipes.savings.set(share(savings));
  pipes.consumption.set(share(s.C));
  pipes.imports.set(share(s.M));
  pipes.exports.set(share(s.X));
  pipes.investment.set(share(s.I));
  pipes.investmentOut.set(share(s.I));
  pipes.government.set(share(s.G));
  pipes.families.set(share(s.C));
  // Com déficit, o governo puxa da poupança; com superávit, devolve.
  pipes.deficit.set(share(deficit), deficit >= 0 ? 'M200,240H160' : 'M160,240H200');

  labels.taxes(ofGdp(s.T));
  labels.savings(ofGdp(savings));
  labels.consumption(ofGdp(s.C));
  labels.imports(ofGdp(s.M));
  labels.exports(ofGdp(s.X));
  labels.fx(`R$ ${fmtNumber(levers.fx, 2)}`);
  labels.inflation(`${pct(s.inflation)} ao ano (meta ${pct(base.target)})`);
  machine.drops.forEach((drop, i) => drop.setAttribute('visibility', i < Math.round(s.inflation) ? 'visible' : 'hidden'));
  labels.deficit(`${pct(Math.abs(s.primary))} do PIB`, deficit >= 0 ? 'déficit do governo' : 'superávit do governo');
  labels.selic(`${pct(s.selic, 2)} ao ano`);
  labels.spending(levers.spending === 0 ? 'como hoje' : `${signed(levers.spending, 0)}%`);
  labels.world(`${pct(levers.world)} ao ano`);
  labels.interest(`${pct(s.interest)} do PIB`);

  machine.desc.textContent =
    `Diagrama de tanques. Renda do país: R$ ${fmtNumber(s.Y / 1000, 2)} trilhões. `
    + `Dela saem impostos (${ofGdp(s.T)}), consumo das famílias (${ofGdp(s.C)}), poupança (${ofGdp(savings)}) `
    + `e importações (${ofGdp(s.M)}). A poupança financia o investimento (${ofGdp(s.I)}) e o `
    + `${deficit >= 0 ? 'déficit' : 'superávit'} do governo (${pct(Math.abs(s.primary))} do PIB). `
    + `Dívida pública: ${pct(s.debt)} do PIB. Inflação: ${pct(s.inflation)}.`;
}

// ---------------------------------------------------------------- a página

const LEVERS = {
  selic: (v) => `${pct(v, 2)} ao ano`,
  tax: (v) => (v === 0 ? 'como hoje' : `${signed(v)} ponto${Math.abs(v) === 1 ? '' : 's'} do PIB`),
  spending: (v) => (v === 0 ? 'como hoje' : `${signed(v, 0)}%`),
  fx: (v) => `R$ ${fmtNumber(v, 2)}`,
  world: (v) => `${pct(v)} ao ano`,
};

run(async () => {
  const [index, data] = await Promise.all([loadIndex(), loadSeries([
    ...COMPONENTS.map((c) => `${c}_corrente`), 'pib_taxa_4tri', 'ipca_mensal', 'meta_inflacao', 'meta_selic',
    'cambio_dolar', 'dbgg_pib', 'primario_gc_pib', 'juros_gc_pib', 'divida_selic', 'transacoes_correntes_pib',
    'focus_pib', 'focus_dbgg',
  ])]);
  showCollected(index);

  // ----- ponto de partida: os dados mais recentes -----
  const last = (id) => data[id].at(-1)[1];
  const sum4 = (id) => data[`${id}_corrente`].slice(-4).reduce((total, [, value]) => total + value, 0) / 1000; // R$ bilhões
  const base = calibrate({
    Y: sum4('pib'), C: sum4('consumo_familias'), I: sum4('fbcf') + sum4('estoques'), G: sum4('consumo_governo'),
    X: sum4('exportacoes'), M: sum4('importacoes'),
    selic: last('meta_selic'), inflation: rolling12(data.ipca_mensal).at(-1)[1], target: last('meta_inflacao'),
    potential: last('focus_pib'), // crescimento que o mercado espera no horizonte mais longo do Focus
    growth: last('pib_taxa_4tri'), debt: last('dbgg_pib'), primary: -last('primario_gc_pib'),
    interest: last('juros_gc_pib'), selicShare: last('divida_selic'), fx: last('cambio_dolar'),
    current: last('transacoes_correntes_pib'),
  });
  const today = todayLevers(base);
  const reference = simulate(base, today, YEARS);
  const thisYear = new Date().getFullYear();

  const inputs = Object.fromEntries(Object.keys(LEVERS).map((key) => [key, document.getElementById(`lever-${key}`)]));
  const yearInput = document.getElementById('year');
  // Tanques arrastáveis: cada um move a válvula que mais diretamente controla o seu nível.
  const DRAG = {
    government: { lever: 'spending', metric: (s) => s.G, name: 'Governo', moves: 'o gasto do governo' },
    families: { lever: 'tax', metric: (s) => s.C, name: 'Famílias', moves: 'os impostos' },
    investment: { lever: 'selic', metric: (s) => s.I, name: 'Investimento', moves: 'a Selic' },
    abroad: { lever: 'fx', metric: (s) => s.current, name: 'Exterior', moves: 'o dólar' },
  };
  const machine = buildMachine(document.getElementById('machine'), Object.fromEntries(
    Object.entries(DRAG).map(([name, tank]) => [name, {
      label: `Nível do tanque ${tank.name}: arraste ou use as setas para cima e para baixo para mudar ${tank.moves}`,
      hint: `Arraste a água para mudar ${tank.moves}`,
      onDrag: (fraction) => dragTank(name, fraction),
      onStep: (direction) => dragTank(name, machine.tanks[name].fraction + direction * 0.04),
    }]),
  ));
  const charts = {
    growth: document.getElementById('chart-growth'),
    inflation: document.getElementById('chart-inflation'),
    debt: document.getElementById('chart-debt'),
    primary: document.getElementById('chart-primary'),
  };
  const series = (path, key) => path.map((s) => [`${thisYear + s.t}-01-01`, s[key]]);
  const focusDebt = data.focus_dbgg.filter(([date]) => Number(date.slice(0, 4)) >= thisYear && Number(date.slice(0, 4)) <= thisYear + YEARS);
  const chartSpec = (path, key, title, extra = []) => ({
    type: 'line', title, freq: 'A', unit: '%', decimals: 1,
    series: [
      { name: 'Seu cenário', color: 'var(--series-1)', data: series(path, key) },
      { name: 'Sem mudanças', color: 'var(--neutral)', dashed: true, data: series(reference, key) },
      ...extra,
    ],
  });
  const specs = (path) => ({
    growth: chartSpec(path, 'growth', 'Crescimento do PIB simulado'),
    inflation: chartSpec(path, 'inflation', 'Inflação simulada'),
    debt: chartSpec(path, 'debt', 'Dívida bruta simulada em % do PIB', [
      { name: 'Expectativa do mercado (Focus)', color: 'var(--series-2)', dashed: true, sparse: true, data: focusDebt },
    ]),
    primary: chartSpec(path, 'primary', 'Resultado primário simulado em % do PIB'),
  });

  const readLevers = () => Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, Number(input.value)]));
  let path = reference;
  let mounted = false;

  function drawYear() {
    const t = Number(yearInput.value);
    const [s, ref] = [path[t], reference[t]];
    document.getElementById('year-out').textContent = t === 0 ? `${thisYear} (hoje)` : `${thisYear + t} (daqui a ${t} ano${t === 1 ? '' : 's'})`;
    drawMachine(machine, s, ref, readLevers(), base);

    const tiles = [
      ['Crescimento do PIB', pct(s.growth), ref.growth],
      ['Inflação', pct(s.inflation), ref.inflation],
      ['Resultado primário, % do PIB', pct(s.primary), ref.primary],
      ['Dívida bruta, % do PIB', pct(s.debt), ref.debt],
      ['Saldo externo, % do PIB', pct(s.current), ref.current],
      ['Juro real', `${pct(s.realRate)} a.a.`, ref.realRate],
    ];
    const container = document.getElementById('tiles');
    container.replaceChildren();
    for (const [label, value, refValue] of tiles) {
      const tile = document.createElement('figure');
      tile.className = 'card tile';
      for (const [className, text] of [['label', label], ['value', value], ['period', `sem mudanças: ${pct(refValue)}`]]) {
        const node = document.createElement('div');
        node.className = className;
        node.textContent = text;
        tile.append(node);
      }
      container.append(tile);
    }

    const gdp = (s.Y / ref.Y - 1) * 100;
    document.getElementById('summary').textContent = t === 0
      ? 'Este é o retrato de hoje. Avance os anos ou aperte "Simular 10 anos" para ver o efeito das válvulas.'
      : `Em ${thisYear + t}, a renda do país fica ${Math.abs(gdp) < 0.05 ? 'igual à' : `${pct(Math.abs(gdp))} ${gdp > 0 ? 'acima' : 'abaixo'} da`} `
        + `do cenário sem mudanças, a inflação vai a ${pct(s.inflation)} e a dívida pública chega a ${pct(s.debt)} do PIB.`;
  }

  function recompute() {
    const levers = readLevers();
    for (const [key, format] of Object.entries(LEVERS)) document.getElementById(`lever-${key}-out`).textContent = format(levers[key]);
    path = simulate(base, levers, YEARS);
    for (const [key, spec] of Object.entries(specs(path))) (mounted ? update : mount)(charts[key], spec);
    mounted = true;
    drawYear();
  }

  /** Leva o tanque ao nível pedido, procurando o valor da válvula que produz esse nível no ano mostrado. */
  function dragTank(name, fraction) {
    stop();
    if (Number(yearInput.value) === 0) yearInput.value = 1; // o retrato de hoje não muda; o efeito aparece a partir do ano seguinte
    const t = Number(yearInput.value);
    const { lever, metric } = DRAG[name];
    const target = name === 'abroad'
      ? reference[t].current - (fraction - REFERENCE_LEVEL) * ABROAD_SPAN
      : metric(reference[t]) * (1 + (fraction / REFERENCE_LEVEL - 1) * RANGE[name]);
    const input = inputs[lever];
    const step = Number(input.step);
    const value = solveLever(base, readLevers(), lever, [Number(input.min), Number(input.max)], metric, target, t, YEARS);
    input.value = Math.round(value / step) * step;
    recompute();
  }

  function setLevers(values) {
    for (const [key, input] of Object.entries(inputs)) input.value = values[key];
    recompute();
  }

  // ----- controles -----
  inputs.fx.min = Math.round(today.fx * 0.6 * 20) / 20;
  inputs.fx.max = Math.round(today.fx * 1.6 * 20) / 20;
  for (const input of Object.values(inputs)) input.addEventListener('input', recompute);
  yearInput.addEventListener('input', () => { stop(); drawYear(); });

  const presets = {
    today,
    rates: { ...today, selic: today.selic + 3 },
    austerity: { ...today, tax: 1, spending: -5 },
    spending: { ...today, spending: 10 },
    dollar: { ...today, fx: Math.round(today.fx * 1.25 * 20) / 20 },
    world: { ...today, world: 0.5 },
  };
  for (const button of document.querySelectorAll('[data-preset]')) {
    button.addEventListener('click', () => setLevers(presets[button.dataset.preset]));
  }

  // ----- passagem do tempo -----
  const playButton = document.getElementById('play');
  let timer = null;
  function stop() {
    clearInterval(timer);
    timer = null;
    playButton.textContent = 'Simular 10 anos';
  }
  playButton.addEventListener('click', () => {
    if (timer) { stop(); return; }
    yearInput.value = 0;
    drawYear();
    playButton.textContent = 'Pausar';
    timer = setInterval(() => {
      yearInput.value = Number(yearInput.value) + 1;
      drawYear();
      if (Number(yearInput.value) >= YEARS) stop();
    }, 900);
  });

  setLevers(today);
});
