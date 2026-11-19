// Rodar: node --test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calibrate, simulate, solveLever, todayLevers } from '../site/js/model.js';

// Economia fictícia em números redondos; Y = C + I + G + X - M fecha exatamente.
const base = calibrate({
  Y: 1000, C: 620, I: 170, G: 200, X: 180, M: 170,
  selic: 12, inflation: 4, target: 3, potential: 2, growth: 2,
  debt: 80, primary: -0.5, interest: 8, selicShare: 50, fx: 5, current: -2,
});
const today = todayLevers(base);
const run = (changes = {}) => simulate(base, { ...today, ...changes });
const near = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, `${a} não está a ${tolerance} de ${b}`);

test('o ano zero é o retrato de hoje', () => {
  const [now] = run();
  assert.equal(now.Y, 1000);
  assert.equal(now.inflation, 4);
  assert.equal(now.debt, 80);
  assert.equal(now.selic, 12);
  near((now.T - now.G) / now.Y * 100, -0.5, 1e-9); // os impostos líquidos reproduzem o primário de hoje
});

test('a identidade do PIB fecha em todos os anos, em qualquer cenário', () => {
  for (const changes of [{}, { selic: 20 }, { spending: 15, tax: -3 }, { fx: 8, world: 0 }]) {
    for (const s of run(changes)) near(s.Y, s.C + s.I + s.G + s.X - s.M, 1e-6);
  }
});

test('sem mexer em nada, a economia cresce no ritmo potencial e a inflação vai à meta', () => {
  const path = run();
  near(path[1].growth, 2, 0.01);
  near(path[10].growth, 2, 0.1);
  near(path[10].inflation, 3, 0.1);
  near(path[1].selic, 12, 1e-9); // no primeiro ano, a Selic é a escolhida
  assert.ok(path[10].selic < 12); // depois acompanha a queda da inflação esperada
});

test('juros mais altos esfriam a economia, baixam a inflação e encarecem a dívida', () => {
  const [calm, tight] = [run(), run({ selic: 15 })];
  assert.ok(tight[3].Y < calm[3].Y);
  assert.ok(tight[3].I < calm[3].I);
  assert.ok(tight[5].inflation < calm[5].inflation);
  assert.ok(tight[5].interest > calm[5].interest);
  assert.ok(tight[10].debt > calm[10].debt);
});

test('mais gasto do governo aquece a economia, piora o primário e tira espaço do investimento', () => {
  const [calm, spend] = [run(), run({ spending: 10 })];
  assert.ok(spend[1].Y > calm[1].Y);
  assert.ok(spend[1].primary < calm[1].primary);
  assert.ok(spend[1].inflation > calm[1].inflation);
  assert.ok(spend[3].I < calm[3].I); // o déficit a mais disputa o crédito
  assert.ok(spend[10].debt > calm[10].debt);
});

test('mais impostos melhoram o primário e a dívida, ao custo de menos consumo', () => {
  const [calm, taxed] = [run(), run({ tax: 2 })];
  near(taxed[1].primary - calm[1].primary, 2, 0.3);
  assert.ok(taxed[1].C < calm[1].C);
  assert.ok(taxed[10].debt < calm[10].debt);
});

test('dólar mais caro traz inflação no primeiro ano e melhora o saldo externo', () => {
  const [calm, weak] = [run(), run({ fx: 6 })];
  assert.ok(weak[1].inflation > calm[1].inflation + 1);
  assert.ok(weak[1].nx > calm[1].nx);
  assert.ok(weak[1].current > calm[1].current);
  near(weak[10].inflation, calm[10].inflation, 0.3); // o efeito sobre os preços se dissipa
});

test('mundo crescendo menos derruba exportações e renda', () => {
  const [calm, slump] = [run(), run({ world: 0 })];
  assert.ok(slump[5].X < calm[5].X);
  assert.ok(slump[5].Y < calm[5].Y);
  assert.ok(slump[5].primary < calm[5].primary); // menos renda, menos impostos
});

test('alavancas no extremo não produzem números impossíveis', () => {
  for (const changes of [
    { selic: 25, tax: 3, spending: -15, fx: 9, world: 0 },
    { selic: 2, tax: -3, spending: 15, fx: 3.5, world: 6 },
  ]) {
    for (const s of run(changes)) {
      for (const value of Object.values(s)) assert.ok(Number.isFinite(value));
      assert.ok(s.Y > 0 && s.C > 0 && s.I > 0 && s.M > 0 && s.debt >= 0);
      assert.ok(s.inflation >= -2 && s.inflation <= 40);
    }
  }
});

test('solveLever acha a alavanca que leva um tanque ao nível pedido', () => {
  // gasto do governo: o alvo é 6% acima do cenário sem mudanças, no ano 3
  const target = run()[3].G * 1.06;
  near(solveLever(base, today, 'spending', [-15, 15], (s) => s.G, target, 3), 6, 1e-4);

  // investimento desce quando a Selic sobe: a busca funciona nos dois sentidos
  const invested = run({ selic: 9 })[5].I;
  near(solveLever(base, today, 'selic', [4, 24], (s) => s.I, invested, 5), 9, 1e-4);

  // alvo fora do alcance: fica no extremo
  near(solveLever(base, today, 'spending', [-15, 15], (s) => s.G, run()[3].G * 2, 3), 15, 1e-4);
});
