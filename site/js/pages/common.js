// O que toda página faz: rodapé com a data da coleta e aviso quando os dados não carregam.
import { fmtPeriod } from '../format.js';

export function showCollected(index) {
  const latest = Object.values(index).map((s) => s.ok_at).filter(Boolean).sort().at(-1);
  if (latest) document.getElementById('collected').textContent = `Dados coletados em ${fmtPeriod(latest, 'D')}.`;
}

/** Texto de fonte de um gráfico: origem, último período disponível e data da coleta. */
export const sourceText = (origin, lastDate, freq, meta) =>
  `Fonte: ${origin}. Último dado: ${fmtPeriod(lastDate, freq)}. Coletado em ${fmtPeriod(meta.ok_at, 'D')}.`;

/**
 * Mostra uma identidade contábil com os valores no lugar dos símbolos.
 * terms: operadores como texto ('=', '+') e parcelas como [valor formatado, 'símbolo · nome'].
 */
export function renderIdentity(el, terms) {
  for (const term of terms) {
    const node = document.createElement('div');
    if (typeof term === 'string') {
      node.className = 'op';
      node.textContent = term;
    } else {
      node.className = 'term';
      for (const [className, text] of [['value', term[0]], ['symbol', term[1]]]) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        node.append(span);
      }
    }
    el.append(node);
  }
}

export function run(load) {
  load().catch((error) => {
    console.error(error);
    const p = document.createElement('p');
    p.className = 'card error';
    p.textContent = 'Não foi possível carregar os dados agora. Tente novamente em alguns minutos.';
    document.querySelector('main').append(p);
  });
}
