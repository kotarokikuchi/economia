// Contas puras, sem DOM. Testadas em tests/calc.test.js.

/** Marcas "redondas" de eixo cobrindo [min, max]. */
export function niceTicks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw * (1 - 1e-9));
  const start = Math.floor(min / step + 1e-9) * step;
  const ticks = [];
  for (let i = 0; start + i * step < max + step * (1 - 1e-9); i++) {
    ticks.push(Number((start + i * step).toPrecision(12)));
  }
  return ticks;
}

export const scaleLinear = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** Data ISO de N anos antes de hoje; '' quando years = 0 (período completo). */
export const cutoff = (todayIso, years) =>
  years ? `${Number(todayIso.slice(0, 4)) - years}${todayIso.slice(4)}` : '';

/** Anos a rotular no eixo, no máximo maxLabels, em passo de 1, 2, 5, 10 ou 20 anos. */
export function yearTicks(firstIso, lastIso, maxLabels) {
  let first = Number(firstIso.slice(0, 4));
  if (firstIso.slice(5) > '01-01') first += 1; // só anos cujo 1º de janeiro está no intervalo
  const last = Number(lastIso.slice(0, 4));
  const step = [1, 2, 5, 10, 20].find((s) => (last - first) / s + 1 <= Math.max(maxLabels, 2)) ?? 20;
  const years = [];
  for (let y = Math.ceil(first / step) * step; y <= last; y += step) years.push(y);
  return years;
}

/** Índice do elemento de `sorted` (crescente) mais próximo de x. */
export function nearestIndex(sorted, x) {
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid; else hi = mid;
  }
  return Math.abs(sorted[hi] - x) < Math.abs(sorted[lo] - x) ? hi : lo;
}

/** Empilha valores: positivos sobem a partir de zero, negativos descem. Devolve [início, fim]. */
export function stack(values) {
  let up = 0;
  let down = 0;
  return values.map((v) => {
    if (v == null) return null;
    if (v >= 0) { up += v; return [up - v, up]; }
    down += v;
    return [down - v, down];
  });
}

/** Variação acumulada (%) de uma lista de variações percentuais. */
export const compound = (rates) => (rates.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100;

/** Série mensal de variações (%) -> série da variação acumulada em 12 meses. */
export function rolling12(data) {
  const out = [];
  for (let i = 11; i < data.length; i++) {
    const window = data.slice(i - 11, i + 1).map(([, v]) => v);
    out.push([data[i][0], window.includes(null) ? null : compound(window)]);
  }
  return out;
}

/** Variação (%) contra `lag` períodos antes. Supõe série sem períodos faltando. */
export function pctChange(data, lag) {
  return data.slice(lag).map(([date, value], i) => {
    const base = data[i][1];
    return [date, value == null || !base ? null : (value / base - 1) * 100];
  });
}

/** Soma móvel de n períodos; nula se faltar algum valor na janela. */
export function rollingSum(data, n) {
  const out = [];
  for (let i = n - 1; i < data.length; i++) {
    const window = data.slice(i - n + 1, i + 1).map(([, v]) => v);
    out.push([data[i][0], window.includes(null) ? null : window.reduce((a, b) => a + b, 0)]);
  }
  return out;
}

/** Combina séries data a data: fn recebe um valor de cada série. Datas sem todos os valores ficam de fora. */
export function combine(seriesList, fn) {
  const [first, ...rest] = seriesList;
  const maps = rest.map((d) => new Map(d));
  return first
    .filter(([date, value]) => value != null && maps.every((m) => m.get(date) != null))
    .map(([date, value]) => [date, fn(value, ...maps.map((m) => m.get(date)))]);
}

/** Série diária -> mensal, com o último valor de cada mês na data do dia 1º. */
export function monthEnd(daily) {
  const byMonth = new Map();
  for (const [date, value] of daily) if (value != null) byMonth.set(`${date.slice(0, 7)}-01`, value);
  return [...byMonth];
}

/** Repete o valor anual (datas aaaa-01-01) em cada uma das datas dadas; anos sem valor ficam de fora. */
export function spreadYearly(yearly, dates) {
  const byYear = new Map(yearly.map(([date, value]) => [date.slice(0, 4), value]));
  return dates.filter((date) => byYear.get(date.slice(0, 4)) != null).map((date) => [date, byYear.get(date.slice(0, 4))]);
}

/** Juro real (%) a partir do juro nominal e da inflação, ambos em % ao ano. */
export const realRate = (nominal, inflation) => ((1 + nominal / 100) / (1 + inflation / 100) - 1) * 100;

/** Alinha várias séries em uma tabela: datas ordenadas e uma coluna de valores por série. */
export function align(seriesData) {
  const dates = [...new Set(seriesData.flatMap((d) => d.map(([date]) => date)))].sort();
  const cols = seriesData.map((d) => {
    const byDate = new Map(d);
    return dates.map((date) => byDate.get(date) ?? null);
  });
  return { dates, cols };
}
