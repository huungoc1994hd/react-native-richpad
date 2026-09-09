# Contributing to react-native-richpad

## Layout

- `src/` — the React Native side, shipped as source (Metro compiles it). `src/protocol.ts`
  defines every message and payload shape the two sides exchange; nothing restates them.
- `webview/` — the editor page: tiptap/ProseMirror extensions, the image and table
  overlays, and the tentap bridges. Vite builds it into
  `src/webview/generated/editorHtml.ts`, which is committed. Never edit that file by hand.
- `webview/patches/` — `patch-package` patches, applied by `npm install` (see below).
- `lib/` — type declarations only. `scripts/` — the two lint gates.

Every runtime entry point in `package.json` points at `src/`, on purpose: the Reanimated
worklets must be compiled by the consuming app's own Babel plugin, and Metro 0.82+ resolves
`main` before `react-native`. A compiled `commonjs` or `module` target must never become
`main`.

## Commands

```bash
npm run typecheck              # tsc --noEmit for src/
npm run lint                   # eslint, prettier, English-only source, doc references
npm run build:webview:offline  # rebuild the bundle and run the jsdom smoke test
npm run verify:webview         # what prepublishOnly runs: the committed bundle must not change
cd webview && npx tsc --noEmit # the WebView project has its own tsconfig
```

Rebuild the bundle after any change under `webview/` or to `src/protocol.ts`. The smoke test
(`webview/smoke-test.mjs`) loads the bundle in jsdom and checks the structure the bridges,
captions and geometry depend on. Behaviour is checked on a device.

## Testing on a device

The Simulator's keyboard and the desktop inspector both behave differently from a phone.
Run these on a real device, with a Vietnamese keyboard wherever an IME is involved:

- Captions: tapping an image focuses its caption with a visible caret; tapping from one
  image to the next keeps the keyboard up; deleting the last character keeps the caret.
- Images: a resize handle drags smoothly with the caption still focused; width and
  alignment survive a save; an image without alignment sits centred; tapping an image
  leaves the keyboard in whatever state it was.
- Tables: adding a row or column puts the caret in the new cell and scrolls it into view.
- Keyboard and scrolling: a long note opens at the top without scrolling; typing near the
  bottom keeps the caret above the toolbar; no dead band above the toolbar.
- Links: letters typed right after a link join it, a space leaves it, spaces inside a
  linked phrase stay linked, Enter at its end starts a plain line. A word typed with an
  IME after a link never duplicates.
- Stored marks (Android): bold a word, Enter, type — the caret sits behind each letter
  from the first frame and the letters come out in order.
- Read-only (`editable: false`): images, captions and tables ignore taps; flipping it back
  restores them.
- Toolbars: with a caption focused, undo, redo, search and select-all act on the document
  and the formatting group is disabled; every popover opens, applies and closes.

## Code

- No `any`, no non-null assertions; an `eslint-disable` needs a reason.
- From `webview/`, import `../src/protocol`, never the `../src` barrel.
- The WebView message switches assert exhaustiveness through `assertUnhandled`.
- Comments are English, present tense, and state the constraint the code satisfies — the
  platform behaviour it works around — in a line or two, not how it was found.
  Measurements and traces belong in the commit message. `scripts/check-comment-language.mjs`
  enforces the language.
- The code works around WebKit's caret painting inside `contenteditable=false`, Android's
  keyboard and IME behaviour, Chromium compositions, and tentap's bridge dispatch. Each
  workaround is explained where it lives. Before touching one, reproduce the behaviour it
  names on a device.

## The prosemirror-view patch

`webview/patches/prosemirror-view+1.42.3.patch` fixes text duplication when an Android IME
reopens the word before the caret at the end of a link. Stock prosemirror-view re-renders
the nodes Chromium is composing in, and Chromium then writes its composition again. The
three hunks are written to be submitted upstream. It reproduces in pure prosemirror-view on
desktop Chrome: drive the page over the DevTools protocol with `Input.imeSetComposition`
given a `replacementStart`/`replacementEnd` range at a link's end, then extend the composition.

On a prosemirror-view bump, install the new version, re-apply the same three changes to
`webview/node_modules/prosemirror-view/dist/index.js` and regenerate the file with
`cd webview && npx patch-package prosemirror-view`. Drop the patch once upstream carries them.

## Trying a build in an app

Consume the package as a packed tarball, never `npm link`: only a tarball exercises the
`files` allow-list and the entry-point resolution.

```bash
npm pack                       # -> react-native-richpad-<version>.tgz
# in the app:
yarn add file:/abs/path/to/react-native-richpad-<version>.tgz
```

Bump the version on every re-pack (the tarball is cached by name and version) and start
Metro with `--reset-cache` after swapping the dependency.
