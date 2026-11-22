# Text and editing

This guide covers rich text in NSE: the attributed text model, the owners and sessions that edit it, the `NSETextView` that displays it, and how a custom drawing surface can accept keyboard and input-method text. [TextFX](fx/text.md) adds optional glyph shaping. Browser DOM layout and shaped layout report their geometry separately; see [Text geometry](text-geometry.md).

## Text ownership and presentation

Import the text APIs from `@syndromatic/syncloudos/nse/text`. None of them expose an editor engine, plugin system or selection classes from a third-party library; the standard text view uses its own private DOM implementation.

```tsx
import { useEffect, useState } from "react";
import { NSETextView, TextEditingSession, createUndoableNSETextOwner } from "@syndromatic/syncloudos/nse/text";

export function NoteBody() {
  const [binding, setBinding] = useState<{
    owner: ReturnType<typeof createUndoableNSETextOwner>;
    session: TextEditingSession;
  } | null>(null);
  useEffect(() => {
    const owner = createUndoableNSETextOwner({ flowId: "body" });
    const session = new TextEditingSession({ id: "note-view", textOwner: owner, history: owner.history });
    setBinding({ owner, session });
    return () => { session.dispose(); owner.dispose(); };
  }, []);
  return binding ? <NSETextView session={binding.session} label="Note body" /> : null;
}
```

An `NSETextOwner` holds the text, and every change goes through it. `NSETextStorage` passes snapshots, range operations and notifications through to the owner. Several sessions can share one owner and history while each keeps its own selection, typing attributes and in-progress input-method text. For read-only text, call `session.setEditable(false)`; the owner still enforces its own write permission separately.

The text view handles paragraphs, inline attributes and attachment placeholders. It has no built-in toolbar and doesn't save anything itself. You build menus, panels and inspectors from ordinary NSE controls and commands. An attachment placeholder is an accessible description of the attachment; showing the image needs an `attachmentResolver` (see below).

### Sessions, commands and inspectors

`TextEditingSession` (also exported as `NSETextEditingController`) holds the selection, typing attributes and input-method composition for one view. Pass the text owner as `textOwner`. The separate `owner` option, as in other NSE controllers, sets the session's lifetime owner (for example `owner: this`), and `ownerSignal` works too. Asynchronous actions check, once their resources arrive, that the document, flow, model revision and selection are still the ones they started with. Disposing either the text owner or the lifetime owner ends the session.

`NSETextCommands` provides ready-made insertion, deletion, clipboard, formatting and undo commands. The clipboard carries attributed JSON alongside plain text; formats specific to your application need their own codecs. `NSETextInspectorBinding` uses an `NSEObjectController` to hold inspector field drafts, then commits them through the text owner without registering a second undo action. The typography adapters supply character, colour and paragraph ruler actions. Named styles and page margins are up to your application.

### Document structure

All of these are attributes in the v1 content format, so storage, the clipboard, undo and the text view carry them with no extra work.

| Attribute | Level | Meaning |
| --- | --- | --- |
| `headerLevel` (0 to 6) | paragraph | Heading level. The view renders levels 1 to 6 as `h1` to `h6`; 0 is body text. |
| `textLists` | paragraph | The lists a paragraph belongs to, outermost first, up to 8 deep. Each `{ id, marker, start? }` uses one of the markers `disc`, `circle`, `square`, `decimal`, `lower-alpha`, `upper-alpha`, `lower-roman` or `upper-roman`. Consecutive paragraphs in the same list id number continuously; a paragraph outside it ends the run. |
| `paragraphSpacing`, `paragraphSpacingBefore` | paragraph | Space after and before a paragraph, in CSS px. |
| `bounds` | attachment | The displayed width and height, in CSS px. |
| `placement` | attachment | How text wraps the attachment. `wrap` is `inline` (the default, a character in the line), `above-and-below` (alone on its lines) or `around` (text flows beside it). `alignment` is `start`, `centre` or `end`; `around` can't be centred. With `textFit` set to `shape`, text follows the image's own outline instead of its rectangle, using `alphaThreshold` (0 to 1). `spacing` (0 to 200 px) keeps text away from it. |
| `appearance` | attachment | How the picture is drawn: `border` (a solid, dashed or dotted line, or a picture frame), `shadow` (`drop`, `contact` or `curved`, with blur, offset, opacity, angle and colour), `reflection`, `opacity`, `rotation`, `flipHorizontal`, `flipVertical`, `exposure` and `saturation`. A picture with no appearance is drawn exactly as it is, with no frame or shadow. |
| `custom` | character, paragraph | Your application's own keys. They're namespaced (`app.key`), with up to 16 per set, and each value is a string (up to 256 UTF-16 units), a number, a boolean or null. The view never renders them. |

The view draws list markers in the indent gutter. They aren't characters, so copying, find and word counts never see them. In a list, Tab and Shift-Tab change the level, Backspace at the start of an item outdents it, and Enter on an empty item ends that level.

```ts
const session = new TextEditingSession({
  id: "post-body", textOwner: owner, history,
  // A comment anchor doesn't grow when you type at its edge; a style id doesn't follow Enter.
  customAttributePolicies: { "journal.comment": { extendsWhenTyping: false }, "journal.style": { carriesAcrossParagraphSplit: false } },
  // A heading is followed by body text.
  nextParagraphAttributes: previous => previous.headerLevel
    ? { paragraph: { custom: { "journal.style": "body" } }, typingAttributes: {} }
    : previous,
});
const commands = new NSETextCommands({ session });
await commands.execute("text.toggleList", "decimal");   // also text.headerLevel, text.listLevel, text.restartNumbering
```

Operations merge `custom` key by key. To remove individual keys, use `customKeys` (character) or `removeCustom` (paragraph). Custom surfaces can build the same operations with pure helpers: `nseToggleListOperations`, `nseListLevelOperations`, `nseRestartNumberingOperations`, `nseHeaderLevelOperations`, `selectedNSETextAttachment`, `nseAttachmentBoundsOperations` and `nseAttachmentUpdateOperations`. The last one changes any of an attachment's size, placement, appearance, description, caption or source in one operation, keeping the attachment's identity and paragraph; pass `null` to clear placement, appearance or caption. `effectiveNSETextCustomAttribute` and `effectiveNSEParagraphCustomAttribute` read a key across a selection, the way an inspector reads any attribute.

Give `NSETextView` a `fontResolver` to draw font descriptors through the host's font catalogue. It maps `{ familyId, face, size }` to `{ family, weight?, style? }`, so a face such as a condensed light cut keeps its CSS family and weight; explicit bold and italic still win. Without a resolver, the descriptor's `familyId` is used as the family name.

Give `NSETextView` an `attachmentResolver` to show attachment images. It maps a run to `{ src, naturalWidth?, naturalHeight? }`, or to `null` to keep the accessible placeholder. If the image fails to load, the placeholder comes back. Only http(s), blob, `data:image` and relative URLs are shown.

In editable text, a selected image shows eight handles, and dragging any of them resizes it in proportion so it never stretches. Dragging the image itself moves it through the text, which re-wraps around it as it goes, and the whole move is one undoable action. To accept files dropped or pasted into the text, give `NSETextView` an `onDropFiles(files, location)` handler. Return `true` if you took the files; otherwise the text view handles the event as usual.

The shaped TextFX projection doesn't support lists, headings or paragraph spacing and throws `NSEUnsupportedShapedTextError` for them, so print structured documents from the DOM view.

### In a SynWare

`createSynWareNSETextOwner` connects a text flow to one of the application's documents, so text edits become document transactions. You supply `readContent` and `writeContent` to map between your model and attributed content. `bindSynWareNSETextEditingSession` registers the session as a participant in the document's Save and Close, and unregisters it when the session is disposed. Give document-bound sessions the document's undo history. A standalone owner from `createUndoableNSETextOwner` brings its own history.

```tsx
const documents = SCOS.documents.workspaceDocuments;
const owner = createSynWareNSETextOwner({ documents, documentId, flowId: "body", readContent: model => model.body, writeContent: (model, body) => ({ ...model, body }) });
const session = new TextEditingSession({ id: "body-view", documentId, textOwner: owner, history: documents.getUndoManager(documentId) });
const participant = bindSynWareNSETextEditingSession({ documents, documentId, session });
// Dispose the participant, session and owner when the view goes away.
```

### Content helpers

`@syndromatic/syncloudos/nse/content` handles v1 attributed content (paragraphs of runs) and works the same on servers, in workers and in browsers:

| Function | Purpose |
| --- | --- |
| `parseAttributedContent`, `attributedContent`, `paragraph`, `textRun`, `attachmentRun` | Validate or build attributed content. |
| `serializeAttributedContent` | Validate content and serialise it as JSON. `nseAttributedContentType` is its MIME type. |
| `attributedContentText`, `attributedContentLayoutText` | Accessible plain text, or the UTF-16 layout string with U+FFFC for each attachment. |
| `normalizeNSEAttributedContentNewlines` | Convert CR and CRLF line endings to LF and report what changed. |
| `validateNSETextCustomAttributes` | Check a `custom` attribute set against the limits above. |

Ranges use UTF-16 offsets and reject positions inside a surrogate pair. Deleting and moving the cursor work in grapheme clusters. Validation rejects executable properties, malformed links and oversized structures before anything is stored. The v1 format is for interchange; keep your application's own document model.

### Custom surfaces and output

If your application draws its own text surface, `NSETextInputClient` and `NSETextInputHost` connect it to keyboard and input-method input. One stable, accessible input host receives input-method text, defines the reading order and handles native events. You supply caret and candidate-window positions as geometry tagged with a revision and an explicit coordinate transform. Geometry that isn't ready yet stays pending, or is marked provisional. While an input method is composing, the document can't be saved or closed until the composition finishes or is cancelled; autosave captures only committed text.

`createSynWareDocumentOutputPreparation` finishes any editing in progress, captures one fixed revision of the model and holds the resources your engine says it needs. You supply the page geometry and drawing callbacks. It doesn't paginate for you, and it doesn't mark the document as saved. Print receipts tell you whether output was prepared and the print dialog was shown, which is not the same as the page being printed. See [custom document engines](custom-document-engines.md) and [text geometry](text-geometry.md).

## Typography

`NSEFontManager` and `NSEFontPanel` handle font selection, including families, sizes, weights and paragraph styles. Applications open the shared font panel through the session and choose fonts by `TFXFontDescriptor`. `NSERulerView` draws a text ruler with tab stops and indents.

Fonts are the host's choice. A font manager has no built-in catalogue: give it family metadata when you construct it, or offer the fonts registered in its font library. The framework ships no site font files, and its chrome uses the host's typography. A font descriptor records what was asked for; finding and loading the font uses the caller's resources.

[Managed fonts](managed-fonts.md) declare font resources, named faces and interface roles in one place. Mounted applications reach that manager with `useFonts()`, and resolvers you write receive it explicitly. When the imported font library changes, readers are called again, and a selection that isn't installed yet keeps using its fallback. Catalogue metadata on its own doesn't mean the glyphs are ready.

`NSELayoutManager` measures logical layout in the browser and invalidates only what changed. Shaped geometry comes from TextFX projections into containers and exclusions that you supply. The two report different capabilities, and neither promises pixel-identical output in the DOM and in a PDF.

## Web content

`NSEWebView` shows external web content in a sandboxed frame. `useWebContent()` returns a client whose `createSession(request)` opens a session with a declared navigation policy. Pass the session to the view as its `session` prop.

A session reports a snapshot with its `title`, its `state` (`loading`, `ready`, `suspended`, `failed` or `closed`), the frame's source, the expected origin and the sandbox in force. It has `navigate`, `postMessage` and `openExternal`, each resolving to whether the host allowed it, and `dispose` to release the frame.

The view rejects navigation and messages outside the session's declared policy. Show a clear message when content is blocked or fails to load, and give the frame a descriptive title.

## Accessibility

The text view exposes a labelled native text region, keyboard selection and visible focus. A custom surface should expose one accessible source for its text in reading order and hide any duplicate text drawn on a canvas. Automated tests simulate input-method composition and run in browsers, but they don't replace testing with real input methods and screen readers such as NVDA and VoiceOver; treat untested combinations as experimental.
