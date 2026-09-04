# Contributing to react-native-richpad

## Package layout

- `src/` — the React Native layer, shipped as SOURCE (Metro compiles it).
  - `src/toolbar/bottom/` — the bottom bar's popover contents and their helpers.
  - `src/webview/generated/editorHtml.ts` — the committed WebView bundle (~800 KB).
    Never edit by hand; regenerate it.
- `webview/` — dev-only build that produces that bundle.
  - `bridges/` — one file per `BridgeExtension`, collected by `bridges/index.ts`.
  - `extensions/` — tiptap/ProseMirror extensions and the caption session.
  - `figure/` — the image block: figure and figcaption nodes, caption field, maintenance.
  - `image/`, `table/` — the two overlays, each a set of hooks over one shared session
    (`ImageHandles.tsx` / `TableHandles.tsx` compose them).
  - `patches/` — `patch-package` patches applied by `postinstall`.
- `lib/` — build output: TYPE DECLARATIONS ONLY.
- `scripts/` — the two lint gates (`lint:language`, `lint:docs`).

## Why every runtime entry point is source

| Field                                      | Target                            |
| ------------------------------------------ | --------------------------------- |
| `source`, `main`, `module`, `react-native` | `./src/index.ts`                  |
| `types`                                    | `./lib/typescript/src/index.d.ts` |

Compiled output is actively wrong here, for two reasons.

**1. Worklets must be compiled by the consuming app.** The reanimated Babel plugin's
output format is coupled to the reanimated major (3 uses `react-native-reanimated/plugin`,
4 uses `react-native-worklets/plugin`), and the peer range spans both. Nothing in this
repo runs Babel: bob's `typescript` target is `tsc` only.

**2. On modern Metro, `main` beats `react-native`.** Metro 0.82+ enables
`unstable_enablePackageExports`, which consults `main` first and treats
`resolverMainFields` as a fallback. Verified on RN 0.82: with `main` at `lib/commonjs`,
Metro bundled 60 modules out of `lib/` and the editor died with
`[Worklets] Trying to convert a cyclic object to a serializable`.

So if a `commonjs`/`module` bob target is ever added, `main` must NOT point at it.
The cost is that a consumer's Jest needs the package added to (not replacing) React
Native's default `transformIgnorePatterns` — documented in the README.

## Commands

```bash
npm run typecheck              # tsc --noEmit (strict) — src/ ONLY
cd webview && npx tsc --noEmit # the WebView project has its own tsconfig
npm run lint                   # eslint + prettier + language + doc-refs
npm run build                  # bob build → lib/typescript
npm run build:webview:offline  # rebuild the bundle + jsdom smoke test, no network
npm run verify:webview         # what prepublishOnly runs: rebuild, fail if the
                               # committed editorHtml.ts would change
```

Rebuild the bundle after ANY change under `webview/` — and after `src/protocol.ts`,
which `webview/` imports directly. The root tsconfig excludes `webview/`, so
`npm run typecheck` alone does not cover it.

`webview/smoke-test.mjs` loads the built bundle in jsdom and asserts the structure the
caption, bridge-naming and geometry fixes depend on. It guards against a rename or a
dependency bump, not against a behaviour regression — that is the checklist below.

## Manual regression checklist

Run on a **real device**: the Simulator's keyboard and the desktop Web Inspector both
diverge from the behaviours in "Platform quirks". On the iOS Simulator the toolbar can
lead the keyboard — that is the simulator's frame pacing, not a defect.

**Caret and focus.** Tap an image → its caption focuses with a VISIBLE caret on the
first keystroke. Tap straight from one image to another → the second caption focuses,
keyboard never closes. Tap an image mid-word (composition open) → focus still moves.
Delete a caption's last character → the caret stays visible, the field stays one line.

**Image gestures.** Drag a resize handle → smooth for the whole gesture, caption keeps
focus (quirk 6). Change alignment → save → reopen: width AND alignment survive. Insert
an image and leave its alignment alone → it sits CENTRED, before and after a save. Set
it left or right → it moves there and stays put across a reopen. An image inside a table
cell sits flush whatever the document does. Tap a bare image while typing → the keyboard
STAYS up; with it closed → it stays closed. Toggle a caption off while typing in it →
keyboard stays, image stays selected. Toggle on/off → the image never blinks or reloads.
Scroll with a finger while an image is selected → the overlay fades and returns in
place. Open a note saved with bare `<img>` → images render, resize and caption normally.

**Tables.** Add a row / add a column from the table menu → the caret lands in the
first cell of what was just created AND that cell is brought into view, scrolling the
table's own wrapper sideways when the new column is off to the right. jsdom has no
layout, so the horizontal half cannot be covered by the smoke test.

**Keyboard and scroll.** Open a long note → the caret is at the START and nothing
scrolls. Type near the bottom → the caret stays above the toolbar. Drag while the
keyboard opens → the drag wins. No band of dead space above the bottom toolbar in
either platform, keyboard open or closed.

**Links (IME-sensitive — use the Vietnamese keyboard).** Attach a link, type right
after it → the letters JOIN it. Type a space at its end → that space and everything
after is plain. Link a phrase with spaces → the inner spaces stay linked. Enter at a
link's end → the new line is plain. (Android) Apply or close the link popover → the
keyboard COMES BACK.

**Toolbars.** With a caption focused: undo/redo/search/select-all/remove-format stay
enabled and act on the DOCUMENT, the formatting group is disabled. Every bottom-bar
popover opens, applies and closes. Tap search from a focused caption → the field takes
focus on the FIRST tap.

## Coding standards

Enforced by `npm run lint`, not left to review:

- **No `any`, no non-null assertions.** An `eslint-disable` needs a justification.
- **`src/protocol.ts` is the single source of truth** for message strings, payload and
  editor-state shapes. Never restate a shape on one side.
- **From `webview/`, import `../src/protocol` — never the `../src` barrel**, which
  drags react-native's Flow entry point into Vite. Reach the leaf, not the barrel.
- **The WebView message switches assert exhaustiveness** through `assertUnhandled`, so
  a message declared without a handler is a compile error. Keep those guards.
- **Comments state a constraint, not a history.** English, present tense, at most two
  lines. No "used to", no "this fixes". Evidence and measurements belong in a quirk
  below, and the code points at it by number. `scripts/check-comment-language.mjs`
  enforces the language part.
- **The `**Where:**` pointers below stay resolvable.** `scripts/check-doc-refs.mjs`
  fails the build when a path or a named symbol no longer exists.

## Platform quirks

Workarounds that look wrong until you know what they defend against. Each is
load-bearing: removing it brings back a bug no test catches.

### 1. WebKit does not paint a caret anchored on an element

**Where:** `webview/figure/captionDom.ts` (`ensureCaretLine`),
`webview/extensions/captionSession.ts` (`placeCaretAtEnd`)

In an editable island nested in a `cE=false` shell, a selection anchored on the element
itself (what `collapse(el, 0)` and an empty field produce) accepts focus and typing but
paints NO caret, and the session never recovers. An empty field therefore keeps the
invariant `[empty text node, <br>]`: the `<br>` holds the line box, the text node holds
a paintable anchor. The `<br>` goes as soon as real text exists, or the field is two
lines tall. WebKit removes the text node when the last character is deleted, so the
invariant is re-established on every mutation.

### 2. Handing off between editing hosts needs the host re-armed

**Where:** `webview/extensions/captionSession.ts` (`focusCaptionFieldDirect`)

Moving focus between editing hosts while WebKit's input session is LIVE leaves UIKit on
the old session: the selection is right, typing lands, no caret is painted. Toggling
`contentEditable` off and on rebuilds it, immediately before `focus()` and only when a
session is already live — an unconditional re-arm flickers the keyboard.

### 3. React registers the root touch listener as passive

**Where:** `webview/image/useImageResizeDrag.ts` (`keepFocusOnTouch`)

`preventDefault()` inside an `onTouchStart` prop is a no-op, so the overlay controls
cannot stop WebKit blurring the caption when a handle is touched — which would close the
keyboard mid-drag. They register a native, non-passive listener through a ref callback.

### 4. UIKit's focus reveal ignores `preventScroll`

**Where:** `webview/scrollCoordinator.ts` (`getVisibleTop`)

When the keyboard opens for a newly focused field, UIKit scrolls it into view by its own
rule; `preventScroll` governs the DOM focus algorithm, not that reveal. Revealing is
therefore the editor's job, against its own measured geometry.

The same reveal shifts the visible strip's TOP: WebKit scrolls the document to clear the
caret even with nothing to scroll (measured: `scrollHeight === innerHeight`,
`visualViewport.offsetTop` up to 54). Overlays anchored above their node clamp to
`getVisibleTop()`, or the image insert-line badge is unreachable at the document start.

### 5. `focus()` is refused during an open composition

**Where:** `webview/extensions/captionSession.ts` (`releaseDomFocus`)

WebKit keeps focus on a composing host to finish the composition and silently ignores
`focus()` elsewhere. Blurring the source first commits it and releases the host.

### 6. ProseMirror redraws a NodeView that writes its own DOM attributes

**Where:** `webview/figure/figureNode.ts`

The resize preview writes the figure's inline `style` every frame; PM's `DOMObserver`
reads that as an external edit and redraws the node, destroying the child figcaption
NodeView and ending the caption session mid-gesture. The NodeView must declare
`ignoreMutation` for attribute mutations on its own element. jsdom never reaches PM's
redraw path, so the smoke test passes with the guard removed — it is on the checklist.

### 7. tentap dispatches to every bridge

**Where:** `webview/bridges/history.ts`

Actions go out with `bridges.forEach`: every bridge sees every message and there is no
"first handler wins". A built-in cannot be wrapped or intercepted — it has to be
REPLACED in the array.

### 8. `Selection` and PM's snapshot drift apart

**Where:** `webview/extensions/captionSession.ts` (`syncPmSelectionSnapshot`)

After the caption places its own caret, PM would read that DOM selection back on its
next flush and replace the image's NodeSelection. `view.domObserver.setCurSelection()`
marks it as already known. It is INTERNAL API: the smoke test asserts it still exists.
Note that `handlers.focus` in prosemirror-view is registered without capture and `focus`
does not bubble, so PM never learns about caption focus that way.

### 9. tentap's prebuilt bundle inlines its own copy of ProseMirror

**Where:** `webview/vite.config.ts`, `webview/extensions/pendingFontSize.ts`

`vite.config.ts` builds tentap's web editor from SOURCE, so every `prosemirror-*`
resolves to one copy and this no longer bites at runtime. The entry stays because the
alias is one line from being lost, and the two patterns below read as cruft:
`selection instanceof NodeSelection` is always false across copies (duck-type on
`.node`), and a `DecorationSet` built from `@tiptap/pm/view` throws inside the view
(import `Decoration` from `@10play/tentap-editor/web`). Plain values cross safely.

### 10. A programmatic focus cannot open the Android keyboard

**Where:** `src/RichEditor.tsx`, `src/hooks/useEditorFocusManager.ts` (`openAndroidIme`)

Android raises the IME only for a real touch or a NATIVE input taking focus; focusing the
document moves the caret and nothing else. `<RichEditor>` keeps a hidden 1x1 `TextInput`
mounted for its whole lifetime, focuses it to summon the keyboard, then hands the input
connection to the WebView. It must never unmount while focused — RN then issues an
explicit `hideSoftInput` that Android honours over the implicit show.

Two guards: the opener acts only on an INVITED focus (Android's focus search lands on it
uninvited), and its `onFocus` returns DOM focus through `RestoreInputFocus`, to whichever
host owns the session. Same reason `KeyboardController.dismiss` runs with `keepFocus` —
a cleared focus is what starts that search. An overlay carrying its own native input must
hand focus back BEFORE unmounting (`focusManager.refocusNow`).

### 11. Changing Android keyboard visibility mid-animation crashes

**Where:** `src/hooks/useEditorFocusManager.ts` (`runWhenKeyboardIdle`)

Showing or hiding the IME while its insets animation runs makes Android cancel that
animation and then write to it: `IllegalStateException: Can't change insets on an
animation that is cancelled`. Every request is queued until the keyboard settles. For the
same reason the table sheet is a same-window portal, never an RN Modal.

### 12. iOS ignores `::selection`, so a hidden NodeSelection still paints

**Where:** `webview/editor.css`

PM hides a NodeSelection with `::selection { background: transparent }`, which iOS
WebKit does not support at all — a node-selected image gets the native blue wash. The
rule takes images out of selection painting with `user-select: none`, scoped to
`html.ios`: Chromium answers the same rule by DROPPING the DOM selection, and a focused
editable with no selection releases the IME, so unscoped it closed the Android keyboard
on every image tap.

Second half: with the image unselectable, WebKit paints an image-height caret anchored in
the `.ProseMirror` root, which PM's `hideselection *` rule cannot reach — the root gets
`caret-color: transparent`, and the focused figcaption wins it back with `auto`, or
caption typing goes invisible.

### 13. Android IMEs re-commit stale text if the doc changes mid-composition

**Where:** `webview/extensions/linkEdgeRules.ts`

An IME tracks its composing region by offsets into the text it believes is there. A
transaction that restructures that region invalidates the map, and the IME re-commits its
stale text — characters duplicate. So appendTransaction work that rewrites text or marks
around the caret must check `view.composing` and defer until it clears, picked up by a
view-update sweep. The check must be the FLAG, not the `"composition"` transaction meta,
which the inlined prosemirror-view never sets (quirk 9).

### 14. Reading the DOM mid-composition makes Chromium duplicate text

**Where:** `webview/patches/prosemirror-view+1.42.1.patch`

Android IMEs continue a word by RECOMPOSING it. prosemirror-view re-renders on every
composition update, which replaces the nodes Chromium anchored to; Chromium re-anchors to
the new tail while its composition STRING still holds the absorbed characters and writes
the whole thing again ("http://abc.com" + "anh" → "…comcomanh"). Plain contenteditable
handles the same keystrokes correctly — PM only has to stop disturbing it.

The patch makes `DOMObserver.flush` a no-op for the whole of any Chromium composition and
reads the records in ONE pass at the end, through both doors: the compositionend
microtask flush, and `endComposition` for a composition interrupted from outside (a tap
into another cell), where the flag must be dropped BEFORE `clearComposition` marks the
nodes dirty.

It deliberately does not try to detect "which compositions absorb text": a predicate that
did missed the reported case. **Known cost:** `state.doc` lags the screen until the word
ends, so a command issued mid-composition acts on the older document (press Bold again
after the word). Reading content is safe — every exit path ends the composition first. A
narrower variant that kept reading but suppressed writes was measured to be WORSE: the
document and DOM drift and later diffs corrupt the text.

On a `prosemirror-view` bump, `patch-package` will refuse to apply: re-test on a device
with a recomposing IME and drop the patch if the duplication is gone.

### 15. Android emits no event for a Backspace with nothing to delete

**Where:** `webview/extensions/leadingEmptyParagraphBackspace.ts`

An empty paragraph FIRST in a join barrier cannot be removed by the browser, and on
Android the key press never reaches a handler: measured on a device, it produces
`compositionstart`, `keydown 229`, `keyup 229` and NOTHING else — the engine finds no
character to delete and emits no event. So the press is identified by what it did NOT do:
an IME-owned key that ran keydown → keyup writing nothing, with the caret still in the
same trapped paragraph and the document unchanged. Every key that writes emits
`beforeinput` first, so none can be mistaken for it.

The alternative — a real zero-width character to delete — was measured and rejected:
Blink canonicalizes the caret into any node placed before it, so the sentinel has to live
in the model and be stripped at every content exit, forever.

### 16. Chromium drops the outer mark wrapper when an IME re-commits text

**Where:** `webview/extensions/compositionMarkRepair.ts`

Text with nested mark wrappers (colour outside, highlight inside) loses the OUTER one
when an IME commits a composition that re-inserts the same characters: PM reads the
degraded DOM back and the colour reverts. The trigger is the REWRITE, not any key —
Enter merely provokes it, before its own key press arrives — and the `beforeinput` is
`cancelable: false`, so repair after the fact is the only lever: snapshot the block at
`compositionstart`, restore when the commit returns the same characters with fewer marks.

### 17. Chromium repaints selected text black, discarding its colour

**Where:** `webview/editor.css`

A selection is painted with the platform pair `Highlight` / `HighlightText`, which in the
Android WebView resolve to a blue tint and OPAQUE BLACK — so coloured text under a live
selection is drawn black, which is exactly the state the colour picker leaves it in.
Declaring a `::selection` style stops the substitution, but naming `color` alone drops
the tint too (Blink then takes the background from that style). Name both:
`background-color: Highlight` and `color: currentColor`.

### 18. WebKit drops the first key press for 500ms after a composition ends

**Where:** `webview/extensions/leadingEmptyParagraphBackspace.ts`

prosemirror-view's keydown handler opens with `inOrNearComposition`, which on Safari
swallows any key within 500ms of `compositionend`. A composition ends at every typed word
on iOS, so the first Backspace after typing was lost. `handleDOMEvents` runs BEFORE that
guard, which is why the real-Backspace door lives in the plugin.

### 19. A bridge is named after its extension, and a wrong name drops it silently

**Where:** `webview/bridges/index.ts`, `webview/bridges/fontSize.ts`

`BridgeExtension` takes its name from `tiptapExtension.name` and IGNORES `forceName`
whenever one is present. `useTenTap` registers a bridge only if that name is a key in the
config map RN injects, and returns null otherwise — no throw, no warning. Renaming
FontSizeBridge's extension away from TextStyle killed the font-size control this way.
Smoke check 0 pins it: every `forceName` in `src/bridges/customBridges.ts` must be looked
up by the bundle.

The same rule forces TextStyle to be registered more than once, and tiptap warns about
the repeats. LEAVE THE SPARES: a redundant plugin costs nothing, while filtering them
lets one dropped bridge take the mark out of the schema entirely.

### 20. tentap overwrites the editor's padding and scroll margins on Android

**Where:** `webview/editor.css`, `webview/scrollCoordinator.ts` (`syncVisibleHeight`)

`RichText.tsx` injects `doc.style.paddingBottom` inline on every Android keyboard change
and calls `setOptions({ editorProps: { scrollThreshold, scrollMargin } })`. Measured: the
padding lands as `0px` and both margins read back as zeros. `setOptions` replaces
`editorProps` wholesale and PM consults `view._props` before any plugin, so neither can
be defended from an extension. Express geometry through the `::after` spacer and the
scroll container's own height instead.

### 21. Whose measurement of the visible strip is authoritative differs by platform

**Where:** `webview/scrollCoordinator.ts` (`syncVisibleHeight`),
`src/hooks/hostChrome.ts`

- **Android.** The WebView spans the keyboard, so `visualViewport.height` IS the visible
  strip and it is final on its FIRST event. The LAYOUT viewport is not: `innerHeight`
  climbs 658 → 706 over ~280ms as edge-to-edge absorbs the navigation bar, and `vh`,
  `svh`, `lvh`, `dvh` all climb with it. Chromium keeps the focused editable a fixed
  distance above the bottom edge, so it follows a container sized off that lag backwards:
  measured `scrollTop` 1027 → 983 against `clientHeight` 304 → 348, the same 44px.
- **iOS.** The host lifts the WebView clear of the keyboard, so the frame IS the strip
  and `100%` is the answer. WebKit still shrinks the visual viewport by the keyboard, so
  reading it here subtracts the keyboard twice — a 56pt band of dead space.

The container takes `min()` of two INDEPENDENT limits: `100% - chrome` (the host toolbar,
which only RN can see) and the visual viewport (Android only). Independent limits, not
two estimates of one number, which is why combining them cannot drift.

The chrome term is 0 on iOS structurally: `RichEditor` reserves the toolbar's MEASURED
height there, so the WebView already ends where the toolbar begins, and reporting the bar
again takes the strip twice. That reserve must stay measured — with a constant, the
leftover shows as a band of the host view's own background between the WebView and the
toolbar, which no page-side sizing can reach.

**The keyboard gets no reveal of its own**, deliberately. Android needs none: Chromium
scrolls the focused editable itself (proved by trapping every `scrollTo`/`scrollTop`
write during a keyboard open — zero calls from script, `scrollTop` still moved
674 → 1027), and there is no API to take that over, `virtualKeyboard` being absent in
Android WebView. On iOS a keyboard-driven reveal aims at an edge the host is still
animating, lands short, and correcting it on every viewport event restarts the easing
~15 times in 250ms. Instead the editing area is SIZED correctly so the scroll range
always reaches the last line, and the caret is revealed by EDITING alone. Open a long
note and the view can sit where the document was laid out; the first keystroke brings the
caret in.

### 22. Overscrolling the editor pans the visual viewport, blanking the page

**Where:** `webview/editor.css`

The scroll container ends above the keyboard while the LAYOUT viewport stays full height,
so the strip the keyboard covers is empty page — and pannable. Flick past the end of the
document on Android and Chromium slides the VISUAL viewport onto it (measured:
`visualViewport.offsetTop` 0 → 358), leaving the editor blank until the next tap.
`overscroll-behavior: contain` stops the chain and keeps the native overscroll feedback.

### 23. An animated programmatic scroll strands the caret on iOS

**Where:** `webview/scrollCoordinator.ts`

WebKit paints a composited overflow scroller from the scrolling thread, and a scroll it
animates on JS's behalf leaves that paint offset from the layout scroll: the text moves,
`scrollTop` and every `getBoundingClientRect()` agree with each other, and whatever is
placed from those coordinates — `position: fixed` overlays, and the caret WebKit itself
draws — stays a line behind. Measured on iOS 26.5.2: a marker positioned inside the
container hugged the caret's line while the same rect drawn `fixed` sat 36px lower, with
`visualViewport.offsetTop`, `pageTop`, `scrollY` and `documentElement.scrollTop` all 0.
Touch-scrolling resynchronises it, which is why the caret snaps back on the next drag.
`SCROLL_BEHAVIOR` keeps programmatic scrolls instant there; Android is unaffected and
still glides.

## Local testing inside an app (before publishing)

Consume the package via a packed tarball, never `npm link`: only a tarball exercises the
`files` allow-list and the entry-point resolution, which is where this package's sharpest
edge lives.

```bash
npm pack                       # -> react-native-richpad-<version>.tgz
# in the app:
yarn add file:/abs/path/to/react-native-richpad-<version>.tgz
```

**Bump the version on every re-pack** — yarn/npm cache the tarball by name+version — and
start Metro with `--reset-cache` after swapping the dependency.
