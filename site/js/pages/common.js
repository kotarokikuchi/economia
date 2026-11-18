// O que toda página faz: rodapé com a data da coleta e aviso quando os dados não carregam.
import { fmtPeriod } from '../format.js';

export function showCollected(index) {
  const latest = Object.values(index).map((s) => s.ok_at).filter(Boolean).sort().at(-1);
  if (latest) document.getElementById('collected').textContent = `Dados coletados em ${fmtPeriod(latest, 'D')}.`;
}

/** Texto de fonte de um gráfico: origem, último período disponível e data da coleta. */
export const sourceText = (origin, lastDate, freq, meta) =>
  `Fonte: ${origin}. Último dado: ${fmtPeriod(lastDate, freq)}. Coletado em ${fmtPeriod(meta.ok_at, 'D')}.`;

export function run(load) {
  load().catch((error) => {
    console.error(error);
    const p = document.createElement('p');
    p.className = 'card error';
    p.textContent = 'Não foi possível carregar os dados agora. Tente novamente em alguns minutos.';
    document.querySelector('main').append(p);
  });
}
