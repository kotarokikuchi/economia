// Rodar: node --test tests/
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  align, combine, compound, cutoff, nearestIndex, niceTicks, pctChange, rolling12, rollingSum, scaleLinear, stack, yearTicks,
} from '../site/js/calc.js';
import { fmtNumber, fmtPeriod, fmtTick } from '../site/js/format.js';

test('niceTicks cobre o intervalo com passos redondos', () => {
  assert.deepEqual(niceTicks(-4.6, 7.5), [-5, -2.5, 0, 2.5, 5, 7.5]);
  assert.deepEqual(niceTicks(0, 100), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(niceTicks(0, 0.43), [0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  const ticks = niceTicks(-3.1, 104.2);
  assert.ok(ticks[0] <= -3.1 && ticks.at(-1) >= 104.2);
  assert.ok(ticks.includes(0));
});

test('niceTicks aceita intervalo de um único valor', () => {
  const ticks = niceTicks(13.75, 13.75);
  assert.ok(ticks[0] <= 13.75 && ticks.at(-1) >= 13.75 && ticks.length >= 2);
});

test('scaleLinear mapeia domínio em pixels, inclusive invertido', () => {
  const y = scaleLinear(0, 10, 300, 100);
  assert.equal(y(0), 300);
  assert.equal(y(10), 100);
  assert.equal(y(5), 200);
});

test('cutoff recua N anos e devolve vazio para o período completo', () => {
  assert.equal(cutoff('2026-11-18', 10), '2016-11-18');
  assert.equal(cutoff('2026-11-18', 0), '');
});

test('yearTicks limita a quantidade de rótulos', () => {
  assert.deepEqual(yearTicks('2016-10-01', '2026-04-01', 12), [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(yearTicks('1996-01-01', '2026-04-01', 8), [2000, 2005, 2010, 2015, 2020, 2025]);
  assert.deepEqual(yearTicks('1996-01-01', '2026-04-01', 4), [2000, 2010, 2020]);
});

test('nearestIndex acha o ponto mais próximo, inclusive nas bordas', () => {
  const xs = [10, 20, 30, 40];
  assert.equal(nearestIndex(xs, -5), 0);
  assert.equal(nearestIndex(xs, 24), 1);
  assert.equal(nearestIndex(xs, 26), 2);
  assert.equal(nearestIndex(xs, 999), 3);
  assert.equal(nearestIndex([7], 3), 0);
});

test('stack empilha positivos para cima e negativos para baixo', () => {
  assert.deepEqual(stack([60, 20, 18, -3]), [[0, 60], [60, 80], [80, 98], [0, -3]]);
  assert.deepEqual(stack([10, null, -2, -5]), [[0, 10], null, [0, -2], [-2, -7]]);
});

test('compound e rolling12 acumulam variações percentuais', () => {
  assert.ok(Math.abs(compound([10, 10]) - 21) < 1e-9);
  const monthly = Array.from({ length: 13 }, (_, i) => [`2025-${String(i + 1).padStart(2, '0')}-01`, 1]);
  const result = rolling12(monthly);
  assert.equal(result.length, 2);
  assert.equal(result[0][0], '2025-12-01');
  assert.ok(Math.abs(result[0][1] - (1.01 ** 12 - 1) * 100) < 1e-9);
});

test('rolling12 devolve nulo quando falta um mês na janela', () => {
  const monthly = Array.from({ length: 12 }, (_, i) => [`m${i}`, i === 5 ? null : 1]);
  assert.equal(rolling12(monthly)[0][1], null);
});

test('pctChange compara com o período de lag anterior', () => {
  const data = [['a', 100], ['b', 110], ['c', null], ['d', 121], ['e', 0], ['f', 5]];
  assert.deepEqual(pctChange(data, 1).map(([d, v]) => [d, v == null ? null : Math.round(v)]),
    [['b', 10], ['c', null], ['d', null], ['e', -100], ['f', null]]);
  assert.deepEqual(pctChange(data, 3).map(([d, v]) => [d, v == null ? null : Math.round(v)]),
    [['d', 21], ['e', -100], ['f', null]]);
});

test('rollingSum soma a janela e propaga nulos', () => {
  assert.deepEqual(rollingSum([['a', 1], ['b', 2], ['c', 3], ['d', null], ['e', 5]], 2),
    [['b', 3], ['c', 5], ['d', null], ['e', null]]);
});

test('combine opera data a data e descarta datas incompletas', () => {
  const m1 = [['2026-08-01', 600], ['2026-09-01', 650], ['2026-10-01', null]];
  const base = [['2026-09-01', 325], ['2026-10-01', 330], ['2026-07-01', 300]];
  assert.deepEqual(combine([m1, base], (a, b) => a / b), [['2026-09-01', 2]]);
});

test('align une datas e preenche lacunas com nulo', () => {
  assert.deepEqual(
    align([[['2026-01-01', 1], ['2026-04-01', 2]], [['2026-04-01', 9], ['2025-10-01', 8]]]),
    { dates: ['2025-10-01', '2026-01-01', '2026-04-01'], cols: [[null, 1, 2], [8, null, 9]] },
  );
});

test('formatação brasileira de números e períodos', () => {
  assert.equal(fmtNumber(3425.728, 1), '3.425,7');
  assert.equal(fmtNumber(null), '–');
  assert.equal(fmtPeriod('2026-04-01', 'Q'), '2º tri 2026');
  assert.equal(fmtPeriod('2026-09-01', 'M'), 'set/2026');
  assert.equal(fmtPeriod('2026-11-18', 'D'), '18/11/2026');
  assert.equal(fmtPeriod('2026-11-18T20:15:14-03:00', 'D'), '18/11/2026');
  assert.equal(fmtTick(7.5, 2.5), '7,5');
  assert.equal(fmtTick(5, 2.5), '5,0');
  assert.equal(fmtTick(60, 20), '60');
  assert.equal(fmtTick(0.25, 0.05), '0,25');
});
