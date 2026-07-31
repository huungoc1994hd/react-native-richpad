# react-native-richpad

A WebView-based rich-text editor for React Native (iOS + Android), built on
[`@10play/tentap-editor`](https://github.com/10play/10tap-editor) (tiptap /
ProseMirror). It ships a polished top and bottom toolbar, tables, resizable
images with captions, in-document search, links, a full color picker, light/dark
theming, and i18n — all behind a small, typed public API.

- **Cross-platform**: one editor for iOS and Android.
- **Batteries included**: two toolbars, table editor, image toolkit, search, links, color picker.
- **Themeable**: light/dark presets plus a fully overridable theme (RN toolbars _and_ the WebView document).
- **Composable**: toggle built-in tools, add custom toolbar buttons, or bring your own icons.
- **Typed**: written in strict TypeScript; no internals leak from the public API.

---

## Installation

```bash
npm install react-native-richpad
```

### Peer dependencies

Install the peers your app doesn't already have:

```bash
npm install react-native-webview react-native-reanimated \
  react-native-keyboard-controller react-native-vector-icons \
  react-native-gesture-handler react-native-linear-gradient \
  @react-native-async-storage/async-storage
```

> **`@10play/tentap-editor` (the tiptap engine) ships bundled with this library** —
> you do **not** install it yourself, and its native module autolinks. Reach its API
> directly via `import { tentap } from 'react-native-richpad'` (e.g. `tentap.useEditorBridge`).
> Note: the `tentap` namespace re-export means Metro bundles tentap with the library
> either way — importing from it adds no extra weight.

| Package                                            | Required | Used for                                                |
| -------------------------------------------------- | -------- | ------------------------------------------------------- |
| `react` ≥ 19.1, `react-native` ≥ 0.82              | ✅       | See "React Native floor" below                          |
| `react-native-webview` ≥ 13                        | ✅       | Renders the editor (host for the bundled tiptap engine) |
| `react-native-reanimated` ≥ 3.10                   | ✅       | Toolbar/popover animations (v3 and v4 supported)        |
| `react-native-keyboard-controller` ≥ 1.12          | ✅       | Keyboard events + sticky bottom bar                     |
| `react-native-vector-icons` ≥ 10                   | ✅       | Default toolbar icons (override with `renderIcon`)      |
| `react-native-gesture-handler` ≥ 2.16              | ✅       | Color picker spectrum, table size wheel                 |
| `react-native-linear-gradient` ≥ 2.8               | ✅       | Color picker gradients                                  |
| `@react-native-async-storage/async-storage` ≥ 1.21 | ✅       | Color picker recent-colors history                      |

Follow each library's own native setup (pods on iOS, autolinking on Android,
fonts for `react-native-vector-icons`).

Shadows are drawn with `boxShadow`, which needs the New Architecture — hence the
0.82 floor — and on Android needs `minSdkVersion` 28. Below API 28 the surfaces
render flat; nothing else changes.

### Jest setup

This package ships TypeScript source, so Jest must be told to transform it. Add it
to React Native's default pattern rather than replacing it:

```js
transformIgnorePatterns: [
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-richpad)/)',
],
```

Rendering the editor outside Metro — react-native-web included — is untested.

### Required app setup

**1. Wrap your app in `KeyboardProvider`** (from `react-native-keyboard-controller`).
It powers the cross-platform keyboard events and the sticky bottom toolbar:

```tsx
import { KeyboardProvider } from 'react-native-keyboard-controller';

export default function App() {
  return <KeyboardProvider>{/* your navigation / screens */}</KeyboardProvider>;
}
```

**2. Add the Reanimated worklets Babel plugin** (`babel.config.js`). Reanimated 4
uses `react-native-worklets`; on Reanimated 3 use `react-native-reanimated/plugin`:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'], // must be listed last
};
```

**3. Android — set `adjustResize`.** In `android/app/src/main/AndroidManifest.xml`,
on your main `<activity>`:

```xml
<activity
  android:name=".MainActivity"
  android:windowSoftInputMode="adjustResize"
  ... />
```

This is required for the keyboard-aware scrolling and the sticky toolbar on Android.

---

## Quick start

```tsx
import { useRef } from 'react';
import { View } from 'react-native';
import {
  useRichEditor,
  RichEditorProvider,
  RichEditor,
  RichEditorTopBar,
  RichEditorBottomBar,
  type RichEditorRef,
} from 'react-native-richpad';

export function NoteEditor() {
  const editorRef = useRef<RichEditorRef>(null);

  const editor = useRichEditor({
    initialContent: '<p>Hello world</p>',
    autofocus: true,
    placeholder: 'Start writing…',
    onChange: html => console.log('content changed', html),
  });

  const handlePickImage = async (fromCamera: boolean): Promise<string | null> => {
    // Pick + upload with your own libraries, then return the final URL.
    const uri = await pickAndUpload(fromCamera); // your code
    return uri ?? null; // null cancels
  };

  return (
    <RichEditorProvider editor={editor}>
      <View style={{ flex: 1 }}>
        <RichEditorTopBar onPickImage={handlePickImage} />
        <RichEditor ref={editorRef} />
        <RichEditorBottomBar />
      </View>
    </RichEditorProvider>
  );
}
```

The bottom toolbar pins itself above the keyboard by default. Call
`editorRef.current?.getHTML()` at any time to read the content imperatively. It
rejects if the WebView does not answer within 5s, so handle the failure:

```ts
try {
  const html = await editorRef.current?.getHTML();
} catch {
  // WebView reloaded, crashed or unmounted mid-call.
}
```

---

## API reference

### `useRichEditor(options)`

Creates the editor instance. Pass it to `RichEditorProvider`.

| Option                     | Type                         | Default      | Description                                                                                                                                                                  |
| -------------------------- | ---------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initialContent`           | `string`                     | `''`         | Initial HTML, read **once** on load. Pass a stable value.                                                                                                                    |
| `editable`                 | `boolean`                    | `true`       | Set `false` for a read-only viewer. Toggling it at runtime is supported.                                                                                                     |
| `autofocus`                | `boolean`                    | `false`      | Focus the editor on load.                                                                                                                                                    |
| `locale`                   | `LocaleOption`               | `'en'`       | Built-in code (`'en'`, `'vi'`) or a full custom bundle; an unknown code falls back to English. Drives every string below. See [Internationalization](#internationalization). |
| `placeholder`              | `string`                     | locale's     | Empty-document placeholder. Overrides the locale's.                                                                                                                          |
| `keyboardOffset`           | `number`                     | `60`         | Extra height reserved above the keyboard.                                                                                                                                    |
| `debounceMs`               | `number`                     | `300`        | Debounce for `onChange` (leading + trailing).                                                                                                                                |
| `theme`                    | `RichThemePartial`           | `lightTheme` | See [Theming](#theming).                                                                                                                                                     |
| `labels`                   | `Partial<RichEditorLabels>`  | locale's     | RN toolbar strings, merged over the locale's.                                                                                                                                |
| `editorLabels`             | `Partial<EditorLabels>`      | locale's     | In-WebView strings (table menu, image caption), merged over the locale's.                                                                                                    |
| `headingOptions`           | `HeadingOption[]`            | locale's     | Entries of the top-bar heading menu (`value` 0 = paragraph).                                                                                                                 |
| `metrics`                  | `EditorMetrics`              | see below    | Image/table minimum sizes.                                                                                                                                                   |
| `onReady`                  | `(editor) => void`           | —            | Fires once when the editor is ready.                                                                                                                                         |
| `onChange`                 | `(html: string) => void`     | —            | Debounced content changes.                                                                                                                                                   |
| `onFocusChanged`           | `(focused: boolean) => void` | —            | Editor focus/blur.                                                                                                                                                           |
| `onStateChange`            | `(state) => void`            | —            | Raw bridge state (advanced).                                                                                                                                                 |
| `onImageInteractionChange` | `(active, inCell) => void`   | —            | An image was selected/deselected (e.g. to disable swipe-back).                                                                                                               |

> `theme`, `labels`, `editorLabels`, `metrics`, `headingOptions` and a custom
> `locale` object are compared by identity. Pass module-level constants or `useMemo`
> values — a fresh literal each render re-pushes the WebView config.

Returns a `RichEditorInstance` for `RichEditorProvider`. Fields worth reading
yourself: `editor` (the tentap `EditorBridge`), `focusManager` (see
[Dismissing the keyboard](#dismissing-the-keyboard-for-your-own-overlays)),
`resolvedTheme` and `resolvedLabels`.

### `<RichEditorProvider>`

Hosts the popover portal and distributes the editor, theme, labels, and icon
renderer to `RichEditor` and the toolbars. Everything must live inside it.

| Prop         | Type                               | Description                                  |
| ------------ | ---------------------------------- | -------------------------------------------- |
| `editor`     | `RichEditorInstance`               | From `useRichEditor`.                        |
| `renderIcon` | `(name, size, color) => ReactNode` | Override the default MaterialIcons renderer. |
| `children`   | `ReactNode`                        | Your `RichEditor` + toolbars + layout.       |

### `<RichEditor ref>`

Renders the editor WebView. Accepts a `style` prop and a ref:

```ts
interface RichEditorRef {
  /** Rejects with `Error('richpad: getHTML timed out')` after 5s. */
  getHTML(): Promise<string>;
  setContent(html: string): void;
  /** Delayed by the focus manager's refocus delay; skipped while focus is suspended. */
  focus(): void;
  /** Resigns the native responder, not just DOM focus. */
  blur(): void;
  insertImage(src: string): void;
  clearContent(): void;
}
```

### `<RichEditorTopBar>`

| Prop              | Type                                                            | Description                                                                                                                                             |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onPickImage`     | `(fromCamera: boolean) => Promise<string \| null \| undefined>` | Pick/upload an image and resolve to the src to insert (or `null` to cancel). The keyboard stays hidden until it settles; the library inserts the image. |
| `features`        | `TopBarFeatureFlags`                                            | Toggle built-in tools (`history`, `heading`, `fontSize`, `table`, `image`, `search`). `history` covers undo **and** redo.                               |
| `items`           | `ToolbarItem[]`                                                 | Custom buttons appended after the built-ins.                                                                                                            |
| `headingOptions`  | `HeadingOption[]`                                               | Overrides the heading menu for this bar only. Defaults to the `headingOptions` resolved by `useRichEditor` (i.e. the locale's).                         |
| `fontSizeOptions` | `number[]`                                                      | Defaults to `[12,14,16,18,20,24,28,32]`.                                                                                                                |
| `style`           | `StyleProp<ViewStyle>`                                          | —                                                                                                                                                       |

### `<RichEditorBottomBar>`

| Prop              | Type                    | Description                                                                                        |
| ----------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| `stickToKeyboard` | `boolean`               | Pin above the keyboard. Default `true`.                                                            |
| `bottomOffset`    | `number`                | Extra bottom offset while the keyboard is open (e.g. a tab bar). Default `0`.                      |
| `features`        | `BottomBarFeatureFlags` | Toggle tools (`taskList`, `color`, `format`, `link`, `list`, `align`, `selectAll`, `clearFormat`). |
| `items`           | `ToolbarItem[]`         | Custom buttons appended after the built-ins.                                                       |
| `style`           | `StyleProp<ViewStyle>`  | —                                                                                                  |

### Toolbar composition

Hide tools you don't want, and add your own:

```tsx
<RichEditorTopBar
  features={{ table: false }} // hide the table tool
  items={[
    {
      key: 'clear',
      icon: 'format-clear',
      onPress: editor => editor.clearFormatting(),
      isActive: state => state.isBoldActive,
    },
  ]}
/>
```

A `ToolbarItem` is either an icon button (`icon` + `onPress`, optional
`isActive`/`isDisabled` predicates over the bridge state) or a fully custom
`render({ editor, state })`. Built-in tools cannot be reordered relative to each
other — they keep their canonical order; custom `items` are appended.

---

## Theming

The theme covers both the React Native toolbars and the WebView document. Start
from `lightTheme`/`darkTheme` and override any subset (deep-merged):

```tsx
import { useRichEditor, type RichThemePartial } from 'react-native-richpad';

// Module scope: a stable reference, so the WebView config is not re-pushed and
// the toolbars are not re-rendered on every parent render.
const myTheme: RichThemePartial = {
  mode: 'dark', // picks darkTheme as the base
  toolbar: { accent: '#22D3EE' }, // RN toolbar tokens
  editor: { accentColor: '#22D3EE' }, // WebView CSS variables
  fontColors: ['#000', '#F00', '#00F'],
};

// …then, inside your component:
const editor = useRichEditor({ theme: myTheme });
```

- `theme.toolbar` — RN colors (`background`, `surface`, `surfaceActive`, `icon`, `iconActive`, `accent`, `danger`, …).
- `theme.editor` — the WebView, applied as CSS variables. Covers the document
  (`backgroundColor`, `textColor`, `placeholderColor`, `tableBorderColor`,
  `accentColor`, …) and the overlay chrome drawn inside it — the table and image
  popovers and the drag handles — via `surfaceColor`, `borderColor`, `iconColor`,
  `mutedColor`, `dividerColor` and `dangerColor`.
- `theme.fontColors` / `theme.highlightColors` — the color-menu swatches.

**Dark mode toggles at runtime** — swap the `theme` you pass to `useRichEditor`
between two stable constants and both the toolbars and the WebView update live.

Everything on `resolvedTheme.editor` is filled in, so it never needs a fallback;
only `fontFamily` stays optional (unset = the WebView default).

---

## Internationalization

The library ships **English (default) and Vietnamese** locales built in. Pick one
with the `locale` option — no need to supply any strings:

```tsx
useRichEditor({ locale: 'vi' }); // toolbars, WebView menus, placeholder, headings → Vietnamese
```

A locale covers every user-facing string: the `placeholder`, the RN toolbar
`labels`, the in-WebView `editorLabels` (table menu + image caption), and the
`headingOptions`. Override any subset on top of the chosen locale:

```tsx
useRichEditor({
  locale: 'vi',
  labels: { tableTitle: 'Bảng của tôi' }, // override one string, keep the rest Vietnamese
});
```

For a language the library doesn't ship, pass a full `RichEditorLocale` object (or
compose one from `enLocale` / `viLocale`) as `locale`:

```tsx
import { enLocale, type RichEditorLocale } from 'react-native-richpad';

const fr: RichEditorLocale = {
  ...enLocale,
  placeholder: 'Commencez à écrire…',
  labels: { ...enLocale.labels, tableTitle: 'Propriétés du tableau', tableInsert: 'Insérer' },
  editorLabels: { ...enLocale.editorLabels, deleteTable: 'Supprimer le tableau' },
  headingOptions: [
    { label: 'Paragraphe', value: 0 },
    { label: 'Titre 1', value: 1 },
    { label: 'Titre 2', value: 2 },
    { label: 'Titre 3', value: 3 },
  ],
};

useRichEditor({ locale: fr });
```

An unrecognised code falls back to English rather than throwing, so
`locale: 'fr'` renders in English until you pass a bundle.

Exports: `enLocale`, `viLocale`, `BUILTIN_LOCALES`, `resolveLocale`, and the
`RichEditorLocale`, `BuiltinLocaleCode` (`'en' | 'vi'`) and `LocaleOption`
(what the `locale` option accepts) types.

## Icons

The default icons come from `react-native-vector-icons/MaterialIcons`. To use a
different icon set, pass `renderIcon` to the provider:

```tsx
<RichEditorProvider editor={editor} renderIcon={(name, size, color) => <MyIcon name={name} size={size} color={color} />}>
```

`name` is one of the library's `RichIconName` values (the MaterialIcons glyph names it uses).

---

## Image handling

The library never uploads. `onPickImage(fromCamera)` is where you run your own
picker + permissions + upload, then resolve to the final URL:

```tsx
const handlePickImage = async (fromCamera: boolean) => {
  const asset = fromCamera ? await launchCamera(opts) : await launchImageLibrary(opts);
  if (!asset) return null; // user canceled
  const { url } = await uploadToServer(asset);
  return url; // library inserts it at the saved cursor
};
```

While the promise is pending the keyboard is kept down; once it resolves the
image is inserted and the editor refocuses.

## Metrics

Runtime size limits, no rebuild required:

```tsx
useRichEditor({
  metrics: {
    imageMinWidthPct: 15, // min width of a top-level image (% of editor)
    imageMinWidthPx: 48, // min width of an in-cell image (px)
    tableMinCellWidth: 70, // min table cell width (px)
  },
});
```

`tableMinCellWidth` is both the CSS floor and the floor a column-resize drag
commits to, so a stored `colwidth` never falls below what the layout renders.

---

## Dismissing the keyboard for your own overlays

When you open your own modal, bottom sheet, or menu over the editor, dismiss the
editor's keyboard so it doesn't sit on top of your UI. `editorRef.current?.blur()`
closes it reliably once. But while your overlay stays open the WebView can try to
re-raise the keyboard on its own (iOS restores the first responder around modal
transitions) — so use the instance's `focusManager` to dismiss it **and hold it
down** for as long as the overlay is open:

```tsx
const editor = useRichEditor({/* … */});

// when your overlay opens:
editor.focusManager.suspend('my-sheet'); // blur + dismiss + lock

// when it closes:
editor.focusManager.resume('my-sheet', { refocus: false }); // refocus: true reopens the keyboard
```

`suspend(reason)` dismisses the keyboard and blocks it from reappearing while any
reason is active; `resume(reason)` releases that reason and — unless you pass
`refocus: false` — refocuses the editor once the last one clears. This is the same
mechanism the editor uses internally around the image picker.

---

## Limitations

- **No custom tiptap extensions.** The editor runs inside a pre-built WebView
  bundle, so the extension set is fixed at build time. Custom nodes/marks require
  forking and rebuilding the bundle.
- **One editor at a time.** Three channels are module-global (Android IME opener,
  blur ack, image selection) and go to the most recently mounted editor. With two
  mounted, the older one loses all three: on Android `focus()` stops raising the
  keyboard and `blur()` falls back to a timeout.
- **Android below API 28** renders every surface without its shadow.
- **Android 3-button navigation:** the table-size sheet's backdrop stops at the
  navigation bar. Fixing it would add `react-native-safe-area-context` as a peer.

---

## License

MIT
