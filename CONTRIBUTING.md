# Contributing to react-native-richpad

## Package layout

- `src/` — the React Native layer (shipped as source; Metro compiles it).
- `webview/` — the dev-only build that produces the editor's WebView bundle.
- `src/webview/generated/editorHtml.ts` — the committed, generated WebView bundle
  (~800 KB). Never edit it by hand; regenerate it (see below).
- `lib/` — build output (`npm run build`). Type declarations ONLY; see below.

## Why every runtime entry point is source

| Field                                      | Target                            | Who reads it  |
| ------------------------------------------ | --------------------------------- | ------------- |
| `source`, `main`, `module`, `react-native` | `./src/index.ts`                  | every bundler |
| `types`                                    | `./lib/typescript/src/index.d.ts` | TypeScript    |

This package ships **source, not compiled JS**, and `react-native-builder-bob` is
configured with the `typescript` target only. That is not laziness — compiled
output is actively wrong here, for two reasons that were both established the
hard way.

**1. Worklets must be compiled by the consuming app, not by us.** `useKeyboardSlide`,
`WheelPicker`, `ColorPickerModal` and `RichEditor` all use
`react-native-reanimated` worklets. A worklet only works if the reanimated Babel
plugin transformed it, and the transform's output format is coupled to the
reanimated major — reanimated 3 uses `react-native-reanimated/plugin`, reanimated 4
uses `react-native-worklets/plugin`. Our peer range (`>= 3.10`) spans both, so any
pre-compiled worklet we shipped would be wrong for half our consumers. Shipping
source lets each app's own Babel do the transform with its own plugin version.
Nothing in this repo's build runs Babel at all: bob's `typescript` target is `tsc`
only, so there is no step that could accidentally bake a worklet in.

**2. On modern Metro, `main` beats `react-native` — do not trust the field
order.** Metro's `resolverMainFields` is `["react-native", "browser", "main"]`,
which reads as if `react-native` wins. It does not. Metro 0.82+ enables
`unstable_enablePackageExports` by default, which switches resolution to the
Node algorithm; `main` is consulted first and `resolverMainFields` only acts as a
fallback. Verified on React Native 0.82 / Metro 0.83: with `main` pointing at
`lib/commonjs`, Metro bundled 60 modules out of `lib/` and zero out of `src/`,
and the editor died on mount with
`[Worklets] Trying to convert a cyclic object to a serializable` — reanimated
receiving a closure the plugin never processed. Pointing `main` at a nonexistent
file made Metro fall back to `react-native` and pull in `src/` instead, which is
how the precedence was confirmed.

So: **if you ever add a `commonjs`/`module` bob target, `main` must NOT point at
it.** The only safe compiled artifact for this package is `lib/typescript`.

The cost of this design is that a consumer's Jest needs the package whitelisted.
ADD it to React Native's default pattern rather than replacing it, or their own
`@react-native-community` / `jest-react-native` packages stop being transformed:

```js
transformIgnorePatterns: [
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-richpad)/)',
],
```

That is documented in the README. It is the correct trade — a broken editor is
worse than one line of Jest config.

## Publish-time check

`prepublishOnly` runs `npm run verify:webview`: it rebuilds the WebView bundle
offline and then `git diff --exit-code`s `src/webview/generated/editorHtml.ts`.
Publishing therefore fails if the committed bundle is stale relative to
`webview/` — regenerate and commit it before releasing.

## Rebuilding the WebView bundle

The editor runs inside a pre-built HTML bundle. Rebuild it after changing anything
under `webview/` (`main.tsx`, `extensions/`, `editor.css`, `configStore.ts`, …) —
and also after changing `src/protocol.ts`, which lives in `src/` but is compiled
into the bundle because `webview/` imports it directly (`from '../src/protocol'`).

```bash
npm run build:webview          # npm ci + tsc + Vite + build.js + smoke test
npm run build:webview:offline  # same without npm ci — no network needed
```

Both regenerate `src/webview/generated/editorHtml.ts` and then run the hardened
jsdom smoke test, which must exit 0. Use the `:offline` variant day to day; the
plain one reinstalls `webview/node_modules` from scratch and needs the network.

## Verifying a change

```bash
npm run typecheck              # tsc --noEmit (strict) — src/ ONLY
cd webview && npx tsc --noEmit # the WebView project, which has its own tsconfig
npm run lint                   # eslint . && prettier --check . (two gates)
npm run build                  # bob build → lib/typescript declarations only
npm run build:webview:offline  # only when webview/ or src/protocol.ts changed
npm run verify:webview         # what prepublishOnly runs: rebuild + fail if the
                               # committed editorHtml.ts would change
```

The root tsconfig excludes `webview/`, so `npm run typecheck` will not catch an
error there. `npm run build:webview:offline` runs the WebView `tsc` for you, so a
full local verify covers both; run the standalone command when you want the fast
loop. `npm run lint`, by contrast, covers `src/` and `webview/` together.

## Coding standards

Enforced by `npm run lint`, not left to review:

- **No `any`, no non-null assertions.** `@typescript-eslint/no-explicit-any` and
  `no-non-null-assertion` are errors. Reach for a type predicate, a generic key
  parameter, or the `closest<T>()`-style generic overloads instead of a cast. An
  `eslint-disable` needs a comment that justifies it on its own terms.
- **`src/protocol.ts` is the single source of truth** for message type strings,
  payload shapes and per-bridge editor-state shapes. Both sides import the same
  declarations — never restate a shape on one side.
- **From `webview/`, import `../src/protocol` — never the `../src` barrel.**
  `protocol.ts` has no imports of its own, so it is safe to pull into a DOM bundle.
  The barrel re-exports the React Native surface, which drags `react-native`'s
  Flow-typed entry point into Vite and fails the build with
  `Expected 'from', got 'typeOf'`. The same rule covers any other `src/` module a
  WebView file needs: reach the leaf, not the barrel.
- **The WebView message switches assert exhaustiveness.** Each `default` branch
  passes the unhandled value to `assertUnhandled` (`webview/domUtils.ts`), whose
  parameter is `never`, so declaring an RN→WebView message in `protocol.ts` without
  handling it in `webview/main.tsx` is a compile error. Keep the guards. The
  webview→RN direction is dispatched by `if` chains and has no such guarantee.
- **Comments state a constraint, not a history.** English, present tense. No
  "used to", "previously", "this fixes". If the code is self-evident, leave it
  uncommented; the survival rules that do exist (bridge naming, worklet
  compilation, focus ordering) are the ones worth keeping.

## Android keyboard: two facts the code is shaped around

The workarounds look arbitrary out of context. Do not remove them without reading
this.

**1. A programmatic focus cannot open the keyboard.** Android calls
`InputMethodManager.showSoftInput` only for a real user touch, or when a _native_
input view takes focus. Focusing the document — or the WebView itself — moves the
caret without raising the keyboard, and `keyboardDisplayRequiresUserAction` is an
iOS-only WebView prop with no Android equivalent. So `<RichEditor>` keeps a hidden
1×1 `TextInput` mounted for its whole lifetime and briefly focuses it to summon the
keyboard, then hands the input connection to the WebView. It must never be
unmounted while focused: unmounting a focused `TextInput` makes RN issue an
explicit `hideSoftInput`, which Android honours over the implicit show the WebView
triggers — the helper would close the keyboard it just opened. (`@10play/tentap-editor`
does the same for its own Android autofocus.)

**2. Changing keyboard visibility mid-animation crashes.** Showing or hiding the
IME while its insets animation is still running makes Android cancel that animation
and then write to it anyway: `IllegalStateException: Can't change insets on an
animation that is cancelled`. Every keyboard request here is queued until the
keyboard settles (`keyboardDidShow` / `keyboardDidHide`).

## Local testing inside an app (before publishing)

Consume the package via a packed tarball, never `npm link`. Only a tarball
exercises what a consumer actually gets: the `files` allow-list and the entry-point
resolution. A symlinked checkout bypasses both — which is exactly where this
package's sharpest edge lives (see "Why every runtime entry point is source").

```bash
npm pack                       # -> react-native-richpad-<version>.tgz
# in the app:
yarn add file:/abs/path/to/react-native-richpad-<version>.tgz
```

**Bump the version on every re-pack** during local iteration — yarn/npm cache the
tarball by name+version, so re-packing the same version can install a stale copy.
Start Metro with `--reset-cache` after swapping the dependency.
