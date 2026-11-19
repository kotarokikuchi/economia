// Gera as capturas de tela usadas no README, em docs/screenshots/.
//
// Uso: node tools/screenshots.mjs        (antes, rode a coleta para o site ter dados)
// Precisa do Google Chrome ou Chromium instalado; o executável pode ser indicado em CHROME.
// Sem pacotes: conversa com o navegador pelo protocolo DevTools, usando o WebSocket do próprio Node.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'screenshots');
const PORT = 8765;
const DEBUG_PORT = 9333;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Cada captura: página, largura, tema e o trecho a fotografar (do topo de `from` até o fim de `to`).
// `prepare` roda na página antes da foto; `hover` posiciona o mouse sobre um gráfico para mostrar a dica;
// `maxHeight` corta a foto quando o trecho é comprido demais.
const SHOTS = [
  { name: 'visao-geral', page: 'index.html', to: '#focus' },
  { name: 'atividade', page: 'atividade.html', to: '#chart-growth' },
  { name: 'atividade-contribuicoes', page: 'atividade.html', from: '#chart-contributions', to: '#chart-contributions', hover: ['#chart-contributions', 0.62],
    prepare: `document.querySelector('#chart-contributions details').open = true` },
  { name: 'moeda', page: 'moeda.html', to: '#chart-aggregates' },
  { name: 'fiscal', page: 'fiscal.html', to: '#chart-result' },
  { name: 'fiscal-despesa', page: 'fiscal.html', from: '#identity-rtn', to: '#chart-spending' },
  { name: 'divida', page: 'divida.html', to: '#chart-debt' },
  { name: 'divida-simulador', page: 'divida.html', from: '#chart-sim', to: '#chart-sim' },
  { name: 'externo', page: 'externo.html', to: '#chart-current' },
  { name: 'precos', page: 'precos.html', to: '#chart-inflation' },
  { name: 'simulador', page: 'simulador.html', from: '#lever-selic', to: '#machine',
    prepare: `document.querySelector('[data-preset="spending"]').click()` },
  { name: 'simulador-graficos', page: 'simulador.html', from: '#tiles', to: '#chart-primary',
    prepare: `document.querySelector('[data-preset="rates"]').click()` },
  { name: 'metodologia', page: 'metodologia.html', to: 'main section:nth-of-type(3)' },
  { name: 'metodologia-series', page: 'metodologia.html', from: '#series', to: '#series' },
  { name: 'tema-escuro', page: 'precos.html', to: '#chart-inflation', dark: true },
  { name: 'celular', page: 'index.html', to: '#tiles', width: 390, scale: 2, maxHeight: 760 },
];

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', join(root, 'site')], { stdio: 'ignore' });
const chrome = spawn(process.env.CHROME ?? 'google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${DEBUG_PORT}`, 'about:blank',
], { stdio: 'ignore' });

try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { /* ainda subindo */ }
  }
  if (!target) throw new Error('o navegador não respondeu');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) pending.get(message.id)?.(message.result ?? message.error);
  });
  const send = (method, params = {}) => new Promise((resolve) => { pending.set(++id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value;
  await send('Page.enable');

  mkdirSync(out, { recursive: true });
  for (const shot of SHOTS) {
    const width = shot.width ?? 1000;
    const metrics = (height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: shot.scale ?? 1, mobile: width < 500 });
    await metrics(900);
    await send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-color-scheme', value: shot.dark ? 'dark' : 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' }, // água parada: a foto sai igual toda vez
    ] });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${shot.page}` });
    await sleep(1800);
    if (shot.prepare) { await evaluate(shot.prepare); await sleep(900); }
    // A página inteira cabe na janela: nada precisa rolar, e as coordenadas do mouse são as do documento.
    await metrics(await evaluate('document.documentElement.scrollHeight'));
    await sleep(400);
    if (shot.hover) {
      const [selector, fraction] = shot.hover;
      const box = await evaluate(`(() => { const r = document.querySelector('${selector} svg').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box[0] + box[2] * fraction, y: box[1] + box[3] / 2 });
      await sleep(300);
    }
    // Do topo do quadro que contém `from` (ou do topo da página) ao fim do quadro que contém `to`.
    const edge = (selector, side) => evaluate(
      `(() => { const e = document.querySelector('${selector}'); const card = e.closest('section, .tiles, .chart-grid') ?? e; return card.getBoundingClientRect().${side} + scrollY; })()`,
    );
    const top = shot.from ? Math.max(0, (await edge(shot.from, 'top')) - 16) : 0;
    const bottom = Math.min((await edge(shot.to, 'bottom')) + 16, top + (shot.maxHeight ?? Infinity));
    const image = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: top, width, height: bottom - top, scale: 1 } });
    writeFileSync(join(out, `${shot.name}.png`), Buffer.from(image.data, 'base64'));
    console.log(`${shot.name}.png  ${width}x${Math.round(bottom - top)}`);
  }
  socket.close();
} finally {
  chrome.kill();
  server.kill();
}
