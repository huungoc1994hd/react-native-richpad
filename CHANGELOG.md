# Changelog

Notable changes per release. Entries up to 1.0.7 cite numbered platform quirks from the
[CONTRIBUTING.md of that release](https://github.com/huungoc1994hd/react-native-richpad/blob/v1.0.7/CONTRIBUTING.md).

## 1.0.9

### Added

- **Code blocks**, highlighted with lowlight (the 37 grammars of its `common` set). The
  language round-trips as `<pre><code class="language-xx">`; Enter three times, or the
  down arrow on the last line, leaves the block. A block without a language is not
  auto-detected.
- The block shows its language as a small label in its top-left corner.
- Bottom bar: a new **code** group after bold/italic/underline/strikethrough with an
  **inline code** button, a **code block** button and, inside a block, a **language
  picker** (`codeLanguages` prop, 15 languages by default). The group sits behind the
  new `code` feature flag.

## 1.0.8

### Changed

- **Text pasted flush against a link joins it only up to the first space**, as typed
  text does; the rest stays plain.
- **prosemirror-view 1.42.3.** Its clipboard parser now validates the attributes of
  pasted content, which closes an XSS vulnerability.

### Fixed

- (Android) The first letter typed on a new line after styled text landed in front of
  the caret.
- A read-only editor (`editable: false`) still let images be selected, captions typed
  into and table handles opened.
- (Android) The document lagged the screen while a word was being composed, so a
  command issued mid-word acted on the older text. The bundled prosemirror-view now
  keeps the nodes the IME is composing in instead of deferring every DOM read to the
  end of the word.

## 1.0.7

### Changed

- **An image with no alignment is now CENTRED.** It sat left before, out of step with
  how the same content renders outside the editor. An alignment set on the image is
  unchanged, and an image inside a table cell still sits flush.
- **The image toolbar marks the CENTRE icon as active** for an image carrying no
  alignment of its own. It marked the left icon before.
- Alignment is written as both margins of the image's inline style rather than one.
  Content saved by earlier versions still reads back with the same alignment.

## 1.0.6

### Changed

- **`autofocus` focuses the START of the document**, not the end, and the view no
  longer scrolls on open.
- **`keyboardOffset` defaults to 0** and now means EXTRA space above the bottom
  toolbar, whose measured height is already reserved. It was 60 against a ~46px bar,
  and the leftover showed as a band above the toolbar.
- **The keyboard no longer scrolls the document.** The editing area is sized to what
  is visible, so the scroll range always reaches the last line, and the caret is
  revealed by editing — typing, a caption taking focus, an image finishing its load.

### Added

- Typing flush against a link's trailing edge extends the link; a typed space ends it.
- Search ignores Vietnamese diacritics ("gach chan" finds "Gạch chân", đ/Đ included).
- The WebView editor is built from tentap's SOURCE, so it runs on a single, current
  ProseMirror instead of the prebuilt bundle's inlined copy.
- Recovery from a dead WebView renderer: the view is remounted and the document
  restored.

### Fixed

**Captions and images**

- Caption typing was blind — WebKit painted no caret in the field.
- Resizing or pinch-zooming an image dropped the caption's focus and closed the
  keyboard; an image could stop responding partway through a resize.
- Image width and alignment were lost on save.
- Selecting an image or focusing a caption jumped the view, often to the end of the
  document; selecting one also dismissed the keyboard.
- Backspace in a caption deselected the image instead of staying in the field.
- Deleting a selected image left a broken node behind.
- Inserting an image at the very end of a note threw.
- The insert-line badge above an image was unreachable at the document start, and the
  image toolbar flashed at the left edge right after inserting.
- Every image is now a figure, captioned or not, so toggling a caption never rebuilds
  the `<img>`; hiding one keeps the keyboard and removes it from the saved content.

**Keyboard, caret and scroll**

- The caret was drawn a line away from the text after a list edit on iOS, and stayed
  there until the document was scrolled by hand (quirk 23).
- Opening the keyboard did not scroll the caret clear of it, and the motion stuttered.
- The caret could end up under the bottom toolbar after Enter.
- A band of dead space could appear above the bottom toolbar.
- Flicking past the end of the document blanked the editor (quirk 22).
- Inserting a table closed the keyboard and reopened it.
- The caret ignored a font size picked before typing.

**Android IME**

- Text duplicated when typing next to a link, or when a space exited one.
- Text colour and highlight were lost after Enter.
- Selected text was painted black whatever colour was applied, which made the colour
  picker look broken.
- Backspace could not delete an empty first line above an image or table.

**Tables**

- The action menu opened under the keyboard.
- Deleting a row or column silently did nothing after typing; deleting a row left the
  caret outside the table.

**Toolbars and links**

- Applying a link to selected text inserted a copy of it instead of linking it.
- Typing flush against a link joined it again after the caret had left and come back.
- The search field needed a second tap when opened while a caption held focus.
- Select-all only covered the caption; it now selects the document.
- Undo, redo, search, select-all and remove-format were disabled while a caption held
  focus.
- A right-anchored popover could poke past the left screen edge.

## 1.0.5

- Both colour swatches are positioned from the same box, so they line up exactly.

## 1.0.4

- The highlight swatch shows the document background when no highlight is set.

## 1.0.3

- The text and highlight swatches share one geometry and show a visible default.

## 1.0.2

- Docs: restored the three-column README tables, folding only the options table.

## 1.0.1

- Docs: narrowed the README tables so npm renders them without horizontal scroll.

## 1.0.0

First release. A WebView rich-text editor for iOS and Android built on
tiptap/ProseMirror: two toolbars, tables, resizable images with captions,
in-document search, links, a colour picker, theming and i18n (en/vi).

The package ships TypeScript source rather than compiled JS, so each app's own Babel
transforms the Reanimated worklets with its own plugin version — see CONTRIBUTING,
"Why every runtime entry point is source".
