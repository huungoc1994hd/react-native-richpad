// Smoke test: run the built WebView bundle inside jsdom to catch startup crashes
// and exercise the message bridge. Exits non-zero on failure so it can gate CI.
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';

const failures = [];

const bundle = fs.readFileSync(new URL('./dist/bundle.js', import.meta.url), 'utf8');

// An exception escaping a callback inside the bundle reaches jsdom as a
// `jsdomError`, which the default console prints while the run still passes.
// Fail on it instead.
const virtualConsole = new VirtualConsole().forwardTo(console, { jsdomErrors: 'none' });
virtualConsole.on('jsdomError', error => {
  const cause = error.cause ?? error;
  failures.push('uncaught inside the bundle: ' + cause.message);
  console.log('JSDOM ERROR:', cause.message);
  console.log((cause.stack || '').split('\n').slice(1, 7).join('\n'));
});

const dom = new JSDOM(
  '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  },
);

const { window } = dom;
// Recorded because the page's own announcement is part of the contract — see check 10.
const postedMessages = [];
window.ReactNativeWebView = {
  postMessage: raw => {
    try {
      postedMessages.push(JSON.parse(raw).type);
    } catch {
      postedMessages.push('unparseable');
    }
  },
};
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
// jsdom implements no scrolling at all, and the caret reveal calls Element.scrollTo.
let scrollToCalls = 0;
window.Element.prototype.scrollTo = function scrollTo() {
  scrollToCalls += 1;
};
// jsdom has no visual viewport; getVisibleBottom reads it, so give the page one.
window.visualViewport = {
  height: window.innerHeight,
  offsetTop: 0,
  addEventListener: () => {},
  removeEventListener: () => {},
};
window.initialContent = '';
window.editable = true;
// Config map that "has every bridge name" (mirrors the real app): patch JSON.parse
// to return a Proxy that answers for any bridge key. The ownKeys/descriptor traps
// matter: main.tsx gates its first render on Object.keys(config).length > 0 (the
// Android late-injection fix), so an "empty-looking" map would stall the mount
// until the 5s safety valve — way past this test's 300ms window.
// Lookups are recorded because the key IS the RN↔WebView contract — see check 0.
const requestedBridgeNames = new Set();
window.bridgeExtensionConfigMap = '__PROXY_MAP__';
window.whiteListBridgeExtensions = [];
const realParse = window.JSON.parse.bind(window.JSON);
window.JSON.parse = (s, r) =>
  s === '__PROXY_MAP__'
    ? new Proxy(
        {},
        {
          get: (_target, key) => {
            requestedBridgeNames.add(String(key));
            return { optionsConfig: undefined, extendConfig: undefined };
          },
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

// The caption/keyboard machinery rests on a handful of behaviours that a rename
// or a dependency bump can silently take away. jsdom cannot judge caret painting
// or first-responder handover, so these assert the STRUCTURE those fixes need:
// what jsdom can prove is proven here, the rest stays a manual checklist.
//
// Deliberately NOT asserted here: that the figure NodeView's ignoreMutation keeps
// PM from redrawing during a resize drag. PM's DOMObserver never reaches its
// redraw path under jsdom, so the check passes with the guard removed — a test
// that cannot fail is worse than none. It stays in the manual checklist, and the
// reasoning in "Platform quirks", both in CONTRIBUTING.md.

// 0. Every name RN sends config for is one the WebView asks about (quirk 19).
//    A missed lookup drops the bridge and its commands in silence.
const rnBridgeNames = [
  ...fs
    .readFileSync(new URL('../src/bridges/customBridges.ts', import.meta.url), 'utf8')
    .matchAll(/forceName:\s*'([^']+)'/g),
].map(match => match[1]);
for (const name of rnBridgeNames) {
  if (!requestedBridgeNames.has(name)) {
    failures.push(`no WebView bridge is named '${name}', which RN sends config for`);
  }
}

// 0b. The table floors a width-less column at the editor's metric, not tiptap's
//     default 25 — that default renders such a column as a sliver.
const tableExtension = window.__richpadEditor?.extensionManager?.extensions?.find(
  extension => extension.name === 'table',
);
if (tableExtension?.options?.cellMinWidth !== 70) {
  failures.push(`table cellMinWidth is ${tableExtension?.options?.cellMinWidth}, expected 70`);
}

// 1. prosemirror-view keeps exposing domObserver.setCurSelection. The caption
//    refreshes that snapshot after placing its own caret so PM does not read the
//    selection back and drop the image's NodeSelection. It is internal API, so a
//    bump can remove it: fail here rather than in the field.
if (typeof window.__richpadEditor?.view?.domObserver?.setCurSelection !== 'function') {
  failures.push('prosemirror-view no longer exposes domObserver.setCurSelection');
}

// 2. Image geometry survives a content round trip: width and alignment live in
//    the inline style of the figure, and the caption in <figcaption>.
const captioned =
  '<figure style="width:62%;margin-left:auto;margin-right:auto;">' +
  '<img src="https://example.com/a.png" alt="Caption"><figcaption>Caption</figcaption></figure>';
sendAction({ type: 'set-content', payload: { content: captioned } });
await new Promise(r => setTimeout(r, 150));
const roundTripped = window.document.querySelector('.ProseMirror')?.innerHTML ?? '';
if (!/<figure[^>]*width:\s*62%/.test(roundTripped)) {
  failures.push('figure width did not survive setContent');
}
if (!/margin-left:\s*auto/.test(roundTripped)) {
  failures.push('figure alignment did not survive setContent');
}
if (!roundTripped.includes('<figcaption')) {
  failures.push('figcaption did not survive setContent');
}

// 3. EVERY image is a figure (imageNormalizer): a bare <img> from stored
//    markdown or paste gets wrapped, its geometry lifted onto the figure. The
//    toggle-without-re-render design rests on this invariant.
sendAction({
  type: 'set-content',
  payload: {
    content:
      '<p>x</p><img src="https://example.com/l.png" alt="Stash" ' +
      'style="width:62%;margin-left:auto;margin-right:auto;">',
  },
});
await new Promise(r => setTimeout(r, 150));
const pmRoot = window.document.querySelector('.ProseMirror');
if (pmRoot.querySelector(':scope > img')) {
  failures.push('a loose <img> was not wrapped into a figure');
}
const wrapped = pmRoot.querySelector(':scope > figure > img');
if (!wrapped) {
  failures.push('normalized image did not land inside a top-level figure');
} else {
  const fig = wrapped.closest('figure');
  const figStyle = fig?.getAttribute('style') ?? '';
  if (!/width:\s*62%/.test(figStyle) || !/margin-left:\s*auto/.test(figStyle)) {
    failures.push('normalizer did not lift width/align from the image onto the figure');
  }
  if (/width|margin/.test(wrapped.getAttribute('style') ?? '')) {
    failures.push('normalizer left geometry styles behind on the inner <img>');
  }
  if (wrapped.getAttribute('alt') !== 'Stash') {
    failures.push('normalizer dropped the alt (stashed caption) from the image');
  }
}

// 3b. The insert-image message produces the figure shape directly.
sendAction({ type: 'insert-image', payload: { src: 'https://example.com/ins.png' } });
await new Promise(r => setTimeout(r, 150));
const inserted = window.document.querySelector(
  '.ProseMirror > figure > img[src="https://example.com/ins.png"]',
);
if (!inserted) {
  failures.push('insert-image did not produce a figure-wrapped image');
}
// The caret lands in a textblock AFTER the figure — the insert closes the
// document, so seeking a raw position would point at the doc node and throw.
const insertState = window.__richpadEditor?.state;
let figureEnd = -1;
insertState?.doc.descendants((node, pos) => {
  if (node.type.name === 'figure') figureEnd = pos + node.nodeSize;
});
if (!insertState?.selection.$from.parent.isTextblock) {
  failures.push('insert-image left the caret outside a textblock');
} else if (insertState.selection.from < figureEnd) {
  failures.push('insert-image left the caret before the figure');
}

// 4. An empty caption keeps the [empty text node, <br>] invariant. The <br> holds
//    the line box and the text node holds the caret anchor; without the anchor
//    WebKit paints no caret in an editable island nested in cE=false. This also
//    proves the figcaption NodeView ran, since renderHTML alone emits no <br>.
//    (Focus itself is not assertable here: jsdom implements neither
//    contentEditable nor focus on a non-focusable element.)
sendAction({
  type: 'set-content',
  payload: {
    content:
      '<figure><img src="https://example.com/b.png" alt=""><figcaption></figcaption></figure>',
  },
});
await new Promise(r => setTimeout(r, 150));
const emptyCaption = window.document.querySelector('.ProseMirror figcaption');
if (!emptyCaption) {
  failures.push('empty figcaption was not rendered');
} else {
  if (!emptyCaption.querySelector('br')) {
    failures.push('empty caption lost its <br> line box');
  }
  if (!(emptyCaption.firstChild && emptyCaption.firstChild.nodeType === 3)) {
    failures.push('empty caption lost its text-node caret anchor');
  }
}

// 5. Search folds Vietnamese diacritics: a query typed without accents matches
//    accented text (d-with-stroke included), and match offsets stay valid: the fold
//    preserves string length. Pure string logic — jsdom judges it fully.
sendAction({ type: 'set-content', payload: { content: '<p><u>Gạch chân</u> Đông đường</p>' } });
await new Promise(r => setTimeout(r, 120));
const searchCase = q => {
  sendAction({ type: 'search-set-query', payload: { query: q } });
  return window.__richpadSearchState?.().matches.length ?? -1;
};
if (searchCase('gach chan') !== 1) {
  failures.push('diacritic-free query did not match accented text (gach chan → Gạch chân)');
}
if (searchCase('GACH') !== 1) {
  failures.push('search stopped being case-insensitive after the fold');
}
if (searchCase('dong duong') !== 1) {
  failures.push('đ/Đ did not fold to d/D in search');
}
if (searchCase('chân') !== 1) {
  failures.push('an accented query no longer matches its own text');
}
sendAction({ type: 'search-clear', payload: undefined });

// 6. Link insert uses the display text with no
//    trailing escape space; typing flush against the trailing edge joins the
//    link (inclusive); a typed space EXITS it; a space inside the linked text
//    survives; re-linking with a new text renames the run.
sendAction({ type: 'set-content', payload: { content: '<p></p>' } });
await new Promise(r => setTimeout(r, 120));
sendAction({ type: 'format-set-link', payload: { href: 'https://vd.com', text: 'Tin tuc' } });
await new Promise(r => setTimeout(r, 120));
const ed6 = window.__richpadEditor;
const pmHtml = () => window.document.querySelector('.ProseMirror').innerHTML;
if (!/<a [^>]*href="https:\/\/vd\.com"[^>]*>Tin tuc<\/a>/.test(pmHtml())) {
  failures.push('set-link with display text did not insert <a>Tin tuc</a>');
}
if (/<\/a> /.test(pmHtml())) {
  failures.push('set-link still appends the legacy escape space');
}
const linkEnd = () => {
  let end = -1;
  ed6.state.doc.descendants((n, pos) => {
    if (n.isText && n.marks.some(m => m.type.name === 'link')) end = pos + n.nodeSize;
  });
  return end;
};
ed6.chain().setTextSelection(linkEnd()).insertContent('x').run();
await new Promise(r => setTimeout(r, 80));
if (!/>Tin tucx<\/a>/.test(pmHtml())) {
  failures.push('typing flush against the link did not extend it (inclusive)');
}
ed6.chain().setTextSelection(linkEnd()).insertContent(' ').run();
await new Promise(r => setTimeout(r, 80));
if (/>Tin tucx <\/a>/.test(pmHtml())) {
  failures.push('a typed trailing space stayed INSIDE the link (space-exit missing)');
}
ed6
  .chain()
  .setTextSelection(linkEnd() + 1)
  .insertContent('y')
  .run();
await new Promise(r => setTimeout(r, 80));
if (/y<\/a>/.test(pmHtml())) {
  failures.push('text typed after the exit space still joined the link');
}

// internal space survives a fresh apply
sendAction({ type: 'set-content', payload: { content: '<p>hai tu roi</p>' } });
await new Promise(r => setTimeout(r, 120));
ed6.commands.setTextSelection({ from: 1, to: 7 });
sendAction({ type: 'format-set-link', payload: { href: 'https://a.com' } });
await new Promise(r => setTimeout(r, 120));
if (!/<a [^>]*>(?:<span[^>]*>)?hai tu(?:<\/span>)?<\/a>/.test(pmHtml())) {
  failures.push('a space INSIDE the linked text did not survive the apply');
}

// rename an existing link (caret inside it)
ed6.commands.setTextSelection(3);
sendAction({ type: 'format-set-link', payload: { href: 'https://b.com', text: 'Doi ten' } });
await new Promise(r => setTimeout(r, 120));
if (
  !/<a [^>]*href="https:\/\/b\.com"[^>]*>(?:<span[^>]*>)?Doi ten(?:<\/span>)?<\/a>/.test(pmHtml())
) {
  failures.push('re-linking with a new display text did not rename the run');
}

// 6b. The space-exit DEFERS while an IME composition is live. Restructuring the
//     DOM inside an active composition (splitting the space out of the <a>)
//     desyncs Android IMEs and they re-commit stale text — the duplication bug.
//     The signal is view.composing: the PM copy inlined in the tentap bundle
//     predates the "composition" transaction meta, so the flag is the only
//     copy-agnostic source of truth.
sendAction({ type: 'set-content', payload: { content: '<p></p>' } });
await new Promise(r => setTimeout(r, 120));
sendAction({ type: 'format-set-link', payload: { href: 'https://ime.com' } });
await new Promise(r => setTimeout(r, 120));
const linkEnd2 = () => {
  let end = -1;
  ed6.state.doc.descendants((n, pos) => {
    if (n.isText && n.marks.some(m => m.type.name === 'link')) end = pos + n.nodeSize;
  });
  return end;
};
ed6.view.input.composing = true;
ed6.chain().setTextSelection(linkEnd2()).insertContent(' ').run();
await new Promise(r => setTimeout(r, 80));
if (!/ <\/a>/.test(pmHtml())) {
  failures.push('space-exit ran DURING a live composition (Android IMEs re-commit stale text)');
}
ed6.view.input.composing = false;
// Any doc change with the composition over lets the deferred strip land.
ed6.view.dispatch(ed6.state.tr.insertText('z', 1));
await new Promise(r => setTimeout(r, 80));
if (/ <\/a>/.test(pmHtml())) {
  failures.push('the deferred space-exit never ran once the composition ended');
}

// 7. A font size picked with nothing typed reaches the EMPTY block, so the caret
//    renders at the size about to be typed. The mark is stored on the state
//    only, so without this the block keeps the default size until the first
//    keystroke. Decoration output is plain DOM, which jsdom judges as well as
//    WebKit does.
sendAction({ type: 'set-content', payload: { content: '<p></p>' } });
await new Promise(r => setTimeout(r, 100));
sendAction({ type: 'set-font-size', payload: '28px' });
await new Promise(r => setTimeout(r, 100));
const emptyBlock = window.document.querySelector('.ProseMirror > p');
if (!emptyBlock) {
  failures.push('no empty paragraph rendered for the pending font-size check');
} else if (!/font-size:\s*28px/.test(emptyBlock.getAttribute('style') ?? '')) {
  failures.push('a font size picked before typing did not reach the empty block');
}

// 8. The scroll container is sized to what is VISIBLE, so its clientHeight is the
//    real editing height — that is what lets the browser scroll to the last line.
//    Two independent limits, and the page owns the visual-viewport one.
sendAction({ type: 'keyboard-will-show', payload: { hostChromeOverlap: 44 } });
await new Promise(r => setTimeout(r, 100));
const rootStyle = window.document.documentElement.style;
const chrome = parseInt(rootStyle.getPropertyValue('--editor-chrome'), 10);
if (chrome !== 44) {
  failures.push(`--editor-chrome is ${chrome}, expected the reported 44px`);
}
// jsdom reports an iOS user agent, so the visual-viewport limit must stay unset —
// reading it there subtracts the keyboard twice (quirk 21).
const strip = rootStyle.getPropertyValue('--editor-visible-strip').trim();
if (strip !== '') {
  failures.push(`--editor-visible-strip is "${strip}" off Android, expected it unset`);
}

// 9. A caret in an EMPTY block still reveals. Its DOM range reports a zero-sized
//    rect (measured on a device, and jsdom agrees), so the reveal has to fall back
//    to coordsAtPos — which needs the editor the CaretReveal plugin passes in.
//    Without it every append-row/column landed off screen in silence.
const pmEditor = window.__richpadEditor;
if (!pmEditor) {
  failures.push('no editor handle for the empty-block reveal check');
} else {
  sendAction({ type: 'set-content', payload: { content: '<p>one</p><p></p>' } });
  await new Promise(r => setTimeout(r, 100));
  const empty = pmEditor.state.doc.content.size - 1;
  const before = scrollToCalls;
  pmEditor.view.dispatch(
    pmEditor.state.tr
      .setSelection(pmEditor.state.selection.constructor.near(pmEditor.state.doc.resolve(empty)))
      .scrollIntoView(),
  );
  await new Promise(r => setTimeout(r, 50));
  if (scrollToCalls === before) {
    failures.push('a caret in an empty block did not reach the scroll container');
  }
}

// 10. The page announces itself as soon as the editor exists. RN's first config push
//     and its autofocus key off this: a state update only arrives once something edits
//     the document, which a freshly created note never does.
if (!postedMessages.includes('editor-mounted')) {
  failures.push("the WebView never posted 'editor-mounted' (RN cannot configure or focus it)");
}

if (failures.length > 0) {
  console.error('\nSMOKE TEST FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nSMOKE TEST PASSED');
