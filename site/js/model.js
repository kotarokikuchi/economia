// Modelo didático da economia para o simulador de tanques. Contas puras, sem DOM.
//
// Os níveis de partida vêm dos dados reais. As sensibilidades abaixo são valores de livro-texto,
// escolhidos para dar direção e ordem de grandeza plausíveis; não foram estimadas com os dados.
import { realRate } from './calc.js';

export const PARAMS = {
  habit: 0.5,            // parte do consumo que repete o do ano anterior
  consumptionRate: 0.25, // queda do consumo desejado (%) por ponto a mais de juro real
  consumptionFx: 0.05,   // queda do consumo desejado (%) por 1% de alta do dólar (importados mais caros)
  investmentRate: 1.5,   // queda do investimento (%) por ponto a mais de juro real
  accelerator: 0.5,      // alta do investimento (%) por ponto de aquecimento da economia no ano anterior
  crowdingOut: 0.5,      // investimento que deixa de ocorrer por real a mais de déficit do governo
  tradeFx: 0.12,         // resposta de exportações e importações a 1% de variação do câmbio real (em %)
  exportWorld: 1.0,      // pontos de crescimento das exportações por ponto de crescimento mundial
  worldGrowth: 3.0,      // crescimento mundial de referência (% ao ano)
  inflationInertia: 0.6, // quanto da inflação do ano anterior se repete
  inflationGap: 0.3,     // pontos de inflação por ponto de aquecimento da economia
  overheating: 0.1,      // inflação extra quando o aquecimento passa de 2 pontos (cresce com o quadrado do excesso)
  capacityAdapt: 0.15,   // parte do aquecimento (ou da ociosidade) que vira capacidade no ano seguinte
  fxPassThrough: 0.1,    // pontos de inflação por 1% de alta do dólar
  anchoring: 0.5,        // peso da meta nas expectativas de inflação (o resto é a inflação passada)
};

/** Descrição de cada sensibilidade, para a página de metodologia. */
export const PARAM_NOTES = {
  habit: 'Parte do consumo que repete o do ano anterior',
  consumptionRate: 'Queda do consumo desejado, em %, por ponto a mais de juro real',
  consumptionFx: 'Queda do consumo desejado, em %, por 1% de alta do dólar',
  investmentRate: 'Queda do investimento, em %, por ponto a mais de juro real',
  accelerator: 'Alta do investimento, em %, por ponto de aquecimento da economia no ano anterior',
  crowdingOut: 'Investimento que deixa de ocorrer por real a mais de déficit do governo',
  tradeFx: 'Resposta das exportações e das importações, em %, a 1% de variação do câmbio real',
  exportWorld: 'Pontos de crescimento das exportações por ponto de crescimento mundial',
  worldGrowth: 'Crescimento mundial de referência, em % ao ano',
  inflationInertia: 'Parte da inflação do ano anterior que se repete',
  inflationGap: 'Pontos de inflação por ponto de aquecimento da economia',
  overheating: 'Inflação extra quando o aquecimento passa de 2 pontos (multiplica o quadrado do excesso)',
  capacityAdapt: 'Parte do aquecimento ou da ociosidade que vira capacidade produtiva no ano seguinte',
  fxPassThrough: 'Pontos de inflação por 1% de alta do dólar, no primeiro ano',
  anchoring: 'Peso da meta nas expectativas de inflação; o restante é a inflação do ano anterior',
};

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/**
 * Prepara o ponto de partida. Fluxos (Y, C, I, G, X, M) em R$ bilhões por ano; o resto em %:
 * selic, inflation, target, potential (crescimento potencial), growth, debt, primary, interest e
 * current em % do PIB ou ao ano; selicShare = parcela da dívida atrelada à Selic; fx em R$/US$.
 */
export function calibrate(d, params = PARAMS) {
  const T = d.G + (d.primary / 100) * d.Y; // impostos líquidos que reproduzem o primário de hoje
  const expected = expectedInflation(d.target, d.inflation, params);
  return {
    ...d,
    tax0: T / d.Y,
    c0: d.C / (d.Y - T),
    m0: d.M / d.Y,
    nx0: ((d.X - d.M) / d.Y) * 100,
    // Juro médio pago hoje sobre a dívida: os juros de 12 meses sobre a dívida de um ano atrás.
    effRate0: ((d.interest * (1 + d.growth / 100) * (1 + d.inflation / 100)) / d.debt) * 100,
    expected0: expected,
    r0: realRate(d.selic, expected),
  };
}

function expectedInflation(target, lastInflation, p) {
  return p.anchoring * target + (1 - p.anchoring) * lastInflation;
}

/** Alavancas no valor de hoje: nada muda. */
export const todayLevers = (base, params = PARAMS) =>
  ({ selic: base.selic, tax: 0, spending: 0, fx: base.fx, world: params.worldGrowth });

/**
 * Simula ano a ano. levers: selic (% a.a., no primeiro ano), tax (pontos do PIB a mais de impostos
 * líquidos), spending (% a mais de gasto do governo), fx (R$/US$) e world (crescimento mundial, %).
 * A Selic escolhida fixa o juro real; nos anos seguintes ela acompanha a inflação esperada.
 * Devolve uma lista de estados; o índice 0 é hoje.
 */
export function simulate(base, levers, years = 10, params = PARAMS) {
  const p = params;
  const g = base.potential / 100;
  const depreciation = Math.log(levers.fx / base.fx);
  const taxRate = base.tax0 + levers.tax / 100;
  const rate = realRate(levers.selic, base.expected0);
  const dRate = rate - base.r0;
  const path = [{
    t: 0, Y: base.Y, C: base.C, I: base.I, G: base.G, X: base.X, M: base.M, T: base.tax0 * base.Y,
    growth: base.growth, gap: 0, inflation: base.inflation, selic: base.selic, realRate: base.r0,
    primary: base.primary, interest: base.interest, debt: base.debt, nx: base.nx0, current: base.current,
  }];
  let capacity = base.Y;       // quanto a economia consegue produzir sem pressionar os preços
  let lostCompetitiveness = 0; // inflação acumulada acima da meta encarece o que o país vende

  for (let t = 1; t <= years; t++) {
    const prev = path[t - 1];
    const trend = (1 + g) ** t;
    const expected = expectedInflation(base.target, prev.inflation, p);
    const selic = ((1 + rate / 100) * (1 + expected / 100) - 1) * 100;
    const fxReal = depreciation - lostCompetitiveness;
    capacity *= (1 + g) * (1 + (p.capacityAdapt * prev.gap) / 100);

    const G = base.G * trend * (1 + levers.spending / 100);
    // O déficit a mais do ano anterior disputa o crédito com as empresas.
    const crowdedOut = p.crowdingOut * ((base.primary - prev.primary) / 100) * prev.Y * (1 + g);
    const I = Math.max(
      0.2 * base.I * trend,
      base.I * trend * (1 - (p.investmentRate / 100) * dRate + (p.accelerator / 100) * prev.gap) - crowdedOut,
    );
    const world = (1 + (p.exportWorld * (levers.world - p.worldGrowth)) / 100) ** t;
    const X = base.X * trend * world * Math.max(0.2, 1 + p.tradeFx * fxReal);
    const c = base.c0 * Math.max(0.2, 1 - (p.consumptionRate / 100) * dRate - p.consumptionFx * fxReal);
    const m = base.m0 * Math.max(0.2, 1 - p.tradeFx * fxReal);

    // Y = C + I + G + X - M, com C = hábito + (1 - hábito) * c * (Y - T), T = taxRate * Y e M = m * Y.
    const habitC = p.habit * prev.C * (1 + g);
    const Y = (habitC + I + G + X) / (1 - (1 - p.habit) * c * (1 - taxRate) + m);
    const T = taxRate * Y;
    const C = habitC + (1 - p.habit) * c * (Y - T);
    const M = m * Y;

    const gap = (Y / capacity - 1) * 100;
    const growth = (Y / prev.Y - 1) * 100;
    const inflation = clamp(
      p.inflationInertia * prev.inflation + (1 - p.inflationInertia) * base.target
        + p.inflationGap * gap + p.overheating * Math.max(0, gap - 2) ** 2
        + (t === 1 ? p.fxPassThrough * depreciation * 100 : 0),
      -2, 40,
    );
    lostCompetitiveness += (inflation - base.target) / 100;

    const primary = ((T - G) / Y) * 100;
    // O juro médio da dívida acompanha a Selic na parcela atrelada a ela, e a inflação esperada no todo.
    const effRate = base.effRate0 + (base.selicShare / 100) * (levers.selic - base.selic) + (expected - base.expected0);
    const nominalGrowth = (1 + growth / 100) * (1 + inflation / 100);
    const interest = ((effRate / 100) * prev.debt) / nominalGrowth;
    const debt = Math.max(0, (prev.debt * (1 + effRate / 100)) / nominalGrowth - primary);
    const nx = ((X - M) / Y) * 100;

    path.push({
      t, Y, C, I, G, X, M, T, growth, gap, inflation, selic, realRate: rate,
      primary, interest, debt, nx, current: base.current + nx - base.nx0,
    });
  }
  return path;
}

/**
 * Valor da alavanca `key`, entre lo e hi, que leva metric(estado do ano t) o mais perto possível de target.
 * Supõe que a medida só sobe ou só desce com a alavanca. Fora do alcance, devolve o extremo mais próximo.
 */
export function solveLever(base, levers, key, [lo, hi], metric, target, t, years = 10) {
  const at = (value) => metric(simulate(base, { ...levers, [key]: value }, years)[t]);
  const rising = at(hi) > at(lo);
  let [a, b] = [lo, hi];
  for (let i = 0; i < 30; i++) {
    const mid = (a + b) / 2;
    if ((at(mid) < target) === rising) a = mid; else b = mid;
  }
  return (a + b) / 2;
}
