// Números e datas no formato brasileiro.

const formatters = new Map();
function numberFormat(decimals) {
  if (!formatters.has(decimals)) {
    formatters.set(decimals, new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }));
  }
  return formatters.get(decimals);
}
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtNumber = (value, decimals = 1) =>
  value == null ? '–' : numberFormat(decimals).format(value);

/** Rótulo de eixo: casas decimais conforme o passo; notação compacta em valores grandes. */
export function fmtTick(value, step) {
  if (Math.abs(value) >= 10000) return compact.format(value);
  const decimals = Number.isInteger(step) ? 0 : Number.isInteger(step * 10) ? 1 : 2;
  return fmtNumber(value, decimals);
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-04-01' -> '2º tri 2026' (Q), 'abr/2026' (M), '2026' (A) ou '01/04/2026' (D). */
export function fmtPeriod(iso, freq) {
  const [year, month, day] = iso.slice(0, 10).split('-');
  if (freq === 'A') return year;
  if (freq === 'Q') return `${Math.ceil(Number(month) / 3)}º tri ${year}`;
  if (freq === 'M') return `${MONTHS[Number(month) - 1]}/${year}`;
  return `${day}/${month}/${year}`;
}
