// Smoke test: run the built WebView bundle inside jsdom to catch startup crashes
// and exercise the message bridge. Exits non-zero on failure so it can gate CI.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const failures = [];

const bundle = fs.readFileSync(new URL('./dist/bundle.js', import.meta.url), 'utf8');

const dom = new JSDOM(
  '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  },
);

const { window } = dom;
window.ReactNativeWebView = { postMessage: () => {} };
// Stub APIs that exist on WKWebView but jsdom lacks.
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
// No CSS Custom Highlight API stub: the editor deliberately does not use it
// (undefined on iOS WKWebView — see extensions/searchHighlight.ts), so the
// test runs against the same reality as the devices.
if (!window.CSS) window.CSS = {};
window.initialContent = '';
window.editable = true;
// Config map that "has every bridge name" (mirrors the real app): patch JSON.parse
// to return a Proxy that answers for any bridge key. The ownKeys/descriptor traps
// matter: main.tsx gates its first render on Object.keys(config).length > 0 (the
// Android late-injection fix), so an "empty-looking" map would stall the mount
// until the 5s safety valve — way past this test's 300ms window.
window.bridgeExtensionConfigMap = '__PROXY_MAP__';
window.whiteListBridgeExtensions = [];
const realParse = window.JSON.parse.bind(window.JSON);
window.JSON.parse = (s, r) =>
  s === '__PROXY_MAP__'
    ? new Proxy(
        {},
        {
          get: () => ({ optionsConfig: undefined, extendConfig: undefined }),
          has: () => true,
          ownKeys: () => ['core'],
          getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true, value: {} }),
        },
      )
    : realParse(s, r);

window.onerror = (msg, src, line, col, err) => {
  console.log('WINDOW ERROR:', msg, 'line', line, 'col', col);
  if (err?.stack) console.log(err.stack.split('\n').slice(0, 6).join('\n'));
};

try {
  dom.window.eval(bundle);
  console.log('bundle eval OK');
} catch (err) {
  failures.push('bundle eval threw: ' + err.message);
  console.log('EVAL ERROR:', err.message);
  console.log((err.stack || '').split('\n').slice(0, 8).join('\n'));
}

await new Promise(r => setTimeout(r, 300));
const rootHtml = window.document.getElementById('root')?.innerHTML ?? '';
console.log('root length:', rootHtml.length);
if (rootHtml.length === 0) {
  failures.push('React did not mount (#root is empty)');
}

// Dispatch a set-link message the way RN sends it (empty cursor → expect an
// inserted <a href>). This also confirms the custom FormatBridge is registered
// under the right name and the dispatch loop is intact.
const sendAction = payloadMessage => {
  window.dispatchEvent(
    new window.MessageEvent('message', {
      data: JSON.stringify({
        type: 'action',
        payload: payloadMessage,
        id: Math.random().toString(),
      }),
    }),
  );
};
sendAction({ type: 'format-set-link', payload: { href: 'https://example.com' } });
await new Promise(r => setTimeout(r, 200));
const html = window.document.querySelector('.ProseMirror')?.innerHTML ?? '';
const hasAnchor = html.includes('<a');
console.log('has <a>:', hasAnchor);
console.log('editor html:', html.slice(0, 300));
if (!hasAnchor) {
  failures.push('FormatBridge set-link did not insert an <a> element');
}

// Verify the ConfigBridge applies theme CSS variables (the dark-mode path).
sendAction({ type: 'init-config', payload: { theme: { backgroundColor: '#123456' } } });
await new Promise(r => setTimeout(r, 100));
const bgVar = window.document.documentElement.style
  .getPropertyValue('--editor-background-color')
  .trim();
console.log('--editor-background-color:', bgVar);
if (bgVar !== '#123456') {
  failures.push('ConfigBridge did not apply --editor-background-color from InitConfig');
}

if (failures.length > 0) {
  console.error('\nSMOKE TEST FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nSMOKE TEST PASSED');
