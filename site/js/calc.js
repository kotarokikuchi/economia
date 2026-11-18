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

/** Alinha várias séries em uma tabela: datas ordenadas e uma coluna de valores por série. */
export function align(seriesData) {
  const dates = [...new Set(seriesData.flatMap((d) => d.map(([date]) => date)))].sort();
  const cols = seriesData.map((d) => {
    const byDate = new Map(d);
    return dates.map((date) => byDate.get(date) ?? null);
  });
  return { dates, cols };
}
