# Text and editing

NSE provides portable attributed text, owner-backed storage, per-view editing sessions, a bounded text view and custom-surface input cooperation. [TextFX](fx/text.md) supplies optional shaping; browser DOM layout and shaped layout declare separate geometry capabilities.

## Text ownership and presentation

Use `@syndromatic/syncloudos/nse/text`. Application contracts contain no backend editor, plugins or selection classes. The ordinary text view uses its own private DOM adapter.

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
    const session = new TextEditingSession({ id: "note-view", owner, history: owner.history });
    setBinding({ owner, session });
    return () => { session.dispose(); owner.dispose(); };
  }, []);
  return binding ? <NSETextView session={binding.session} label="Note body" /> : null;
}
```

`NSETextOwner` is the sole canonical authority. `NSETextStorage` delegates immutable snapshots, range operations and notifications to it. Multiple sessions may share an owner and history while keeping separate selections, typing attributes and marked input. Use `session.setEditable(false)` for a read-only presentation; the owner separately enforces native write authority.

The bounded view supports paragraphs, inline attributes and semantic attachment placeholders. It uses a private fixed browser grammar, with no compulsory toolbar or native persistence. Applications assemble menus, utility panels and inspectors through ordinary NSE controls and commands. Attachment placeholders are accessible descriptions, not an image decoding or page layout promise.

### Sessions, commands and inspectors

`TextEditingSession` (also exported as `NSETextEditingController`) keeps semantic selection, typing and composition state. Retained targets include document/flow identity, model revision, owner generation and selection lineage; asynchronous actions revalidate them after resource acquisition. Disposing an owner revokes its attached sessions.

`NSETextCommands` supplies reusable insertion, deletion, clipboard, formatting and history intents. Clipboard interchange is bounded attributed JSON plus plain text; application-native fragments use application-private codecs. `NSETextInspectorBinding` uses the existing `NSEObjectController` for field drafts, then commits through the canonical text owner without another content undo registration. Typography adapters supply character, colour and paragraph-ruler actions; named styles and page margins remain application policy.

### Document structure

These follow NSParagraphStyle, NSTextList, NSTextAttachment and NSAttributedString's custom keys. All of them are attributes in the v1 grammar, so storage, clipboard, history and the text view carry them without anything extra.

| Attribute | Level | Meaning |
| --- | --- | --- |
| `headerLevel` (0–6) | paragraph | `NSParagraphStyle.headerLevel`. The view renders levels 1–6 as `h1`–`h6`; 0 is body text. |
| `textLists` | paragraph | `NSParagraphStyle.textLists`, outermost first, up to 8 deep. Each `{ id, marker, start? }` uses one of the markers `disc`, `circle`, `square`, `decimal`, `lower-alpha`, `upper-alpha`, `lower-roman` or `upper-roman`. Consecutive paragraphs containing a list id number continuously; a paragraph without it ends that run. |
| `paragraphSpacing`, `paragraphSpacingBefore` | paragraph | Space after and before a paragraph, in CSS px. |
| `bounds` | attachment | `NSTextAttachment.bounds`: the displayed width and height, in CSS px. |
| `placement` | attachment | How text wraps the attachment, as Pages' Arrange pane: `wrap` is `inline` (the default, a character in the line), `above-and-below` (alone on its lines) or `around` (text flows beside it). `alignment` is `start`, `centre` or `end`; `around` cannot be centred. `textFit` `shape` wraps the image's own outline rather than its rectangle, at `alphaThreshold` (0–1); `spacing` (0–200 px) keeps text off it. |
| `appearance` | attachment | How the picture is drawn, as Pages' Style pane: `border` (a solid, dashed or dotted line, or a picture frame), `shadow` (`drop`, `contact` or `curved`, with blur, offset, opacity, angle and colour), `reflection`, `opacity`, `rotation`, `flipHorizontal`, `flipVertical`, `exposure` and `saturation`. A picture with no appearance is drawn exactly as it is: no frame and no shadow. |
| `custom` | character, paragraph | Application keys. They are namespaced (`app.key`), with up to 16 per set; values are a string (up to 256 units), a number, a boolean or null. The view never renders them. |

List markers are drawn by the view in the indent gutter. They are not characters, so copying, find and word counts never see them. In a list, Tab and Shift-Tab change the level, and Backspace at an item's start outdents it. Enter on an empty item ends that level.

```ts
const session = new TextEditingSession({
  id: "post-body", owner, history,
  // A comment anchor does not grow when typing at its edge; a style id does not follow Enter.
  customAttributePolicies: { "journal.comment": { extendsWhenTyping: false }, "journal.style": { carriesAcrossParagraphSplit: false } },
  // Pages' "Following paragraph style": a heading is followed by body text.
  nextParagraphAttributes: previous => previous.headerLevel
    ? { paragraph: { custom: { "journal.style": "body" } }, typingAttributes: {} }
    : previous,
});
const commands = new NSETextCommands({ session });
await commands.execute("text.toggleList", "decimal");   // also text.headerLevel, text.listLevel, text.restartNumbering
```

Operations merge `custom` key by key. Use `customKeys` (character) or `removeCustom` (paragraph) to remove individual keys. Pure helpers produce the same operations for custom surfaces: `nseToggleListOperations`, `nseListLevelOperations`, `nseRestartNumberingOperations`, `nseHeaderLevelOperations`, `selectedNSETextAttachment`, `nseAttachmentBoundsOperations` and `nseAttachmentUpdateOperations`. The last changes any of an attachment's size, placement, appearance, description, caption or source as one operation that keeps the attachment's identity and paragraph; pass null to clear placement, appearance or caption. `effectiveNSETextCustomAttribute` and `effectiveNSEParagraphCustomAttribute` aggregate a key across a selection, the way inspectors read any attribute.

Give `NSETextView` a `fontResolver` to draw font descriptors through the host's catalogue. It maps `{ familyId, face, size }` to `{ family, weight?, style? }`, so a face such as a condensed light cut keeps its CSS family and weight; explicit bold and italic still win. Without a resolver, the descriptor's `familyId` is used as the family name.

Give `NSETextView` an `attachmentResolver` to show attachment images. It maps a run to `{ src, naturalWidth?, naturalHeight? }`, or null to keep the accessible placeholder. A load failure also falls back to the placeholder. Only http(s), blob, `data:image` and relative URLs are shown.

In editable text a selected image shows eight handles, and dragging any of them resizes it in proportion; it is never stretched. Dragging the image itself moves it through the text, which re-wraps around it as it goes; the move is one undoable action. Give `NSETextView` an `onDropFiles(files, location)` handler to accept files dropped or pasted into the text, as NSTextView's delegate accepts drag types. Return true when the files were taken; otherwise the text view handles the event as usual. The shaped TextFX projection refuses lists, headings and paragraph spacing (`NSEUnsupportedShapedTextError`), so print structured documents from the DOM view.

### In a SynWare

`createSynWareNSETextOwner` adapts admitted document transactions to an identified semantic flow. The app supplies `readContent` and `writeContent` for its native model. `bindSynWareNSETextEditingSession` registers a scoped Save/Close participant and automatically unregisters when its session is disposed. Give document-bound sessions the document's history capability; standalone owners can compose the existing generic undo manager with `createUndoableNSETextOwner`.

```tsx
// The application supplies its native model mapping.
const owner = createSynWareNSETextOwner({ documents, documentId, flowId: "body", readContent: model => model.body, writeContent: (model, body) => ({ ...model, body }) });
const session = new TextEditingSession({ id: "body-view", documentId, owner, history: documents.getUndoManager(documentId) });
const participant = bindSynWareNSETextEditingSession({ documents, documentId, session });
// Dispose the participant/session/owner when this view's scope ends.
```

### Content helpers

`@syndromatic/syncloudos/nse/content` provides portable v1 attributed paragraph/run interchange for servers, workers and browsers:

| Function | Purpose |
| --- | --- |
| `parseAttributedContent`, `attributedContent`, `paragraph`, `textRun`, `attachmentRun` | Validate/build bounded semantic content. |
| `attributedContentText`, `attributedContentLayoutText` | Accessible/plain text or UTF-16 layout text with U+FFFC attachments. |
| `exportAttributedContent`, `importAttributedContent` | Bounded attributed clipboard serialization. |

Ranges use UTF-16 offsets; surrogate interiors are rejected. User deletion/movement uses grapheme boundaries. Content validation rejects executable properties, malformed links and oversized structures before admission. The v1 grammar is an interchange format; it does not replace an application's native document model.

### Custom surfaces and output

`NSETextInputClient` and `NSETextInputHost` cooperate with an application-owned custom surface. A single stable accessible input host owns marked input, reading order and native events. Supply revisioned geometry with explicit coordinate transforms for candidate/caret positions. Pending geometry stays pending or explicitly provisional. Active composition refuses explicit lifecycle settlement until it finishes or is canceled; autosave captures committed canonical content.

`createSynWareDocumentOutputPreparation` settles editing, captures one immutable model/revision and retains engine-declared dependencies. The application supplies page geometry and drawing callbacks. Output does not paginate, define native Pages structures, or mark native content saved. Print receipts distinguish preparation and dialog request from physical completion. See [custom document engines](custom-document-engines.md) and [geometry](text-geometry.md).

## Typography

`NSEFontManager` and `NSEFontPanel` provide font selection in the manner of `NSFontManager`, including families, sizes, weights and paragraph styles. Applications reach the shared panel through the session, and choose fonts by `TFXFontDescriptor`. `NSERuler` draws a text ruler with tab stops and indents.

Font choices belong to the host. A manager has no built-in family catalogue: supply family metadata when constructing it, or offer fonts registered in its font library. The framework packages no site font files, and its chrome inherits the host's typography. Portable font descriptors retain requested intent; font acquisition and resolution use the caller's resources.

[Managed fonts](managed-fonts.md) capture resources, stable named faces and semantic UI roles in one declaration. Mounted apps access that manager with `useFonts()`; ordinary resolvers receive it explicitly. Imported-library snapshot changes refresh reader callbacks, while unknown or not-yet-installed selections retain fallback behavior. Catalogue metadata alone does not provide ready glyph data.

`NSELayoutManager` retains browser logical measurement and scoped invalidation. Shaped geometry uses explicit TextFX projections and supplied containers/exclusions. Their capability declarations distinguish logical DOM measurement from shaped glyph/caret geometry; they do not imply DOM/PDF pixel equality.

## Web content

`NSEWebContentView` hosts external web content in a sandboxed frame. `useWebContent()` returns a client whose `createSession(request)` opens a session with a declared navigation policy. Pass the session to the view as its `session` prop.

A session reports a snapshot with its `title`, its `state` (`loading`, `ready`, `suspended`, `failed` or `closed`), the frame's source, the expected origin and the sandbox in force. It offers `navigate`, `postMessage` and `openExternal`, each of which resolves to whether the host allowed it, and `dispose` to release the frame.

The view rejects navigation and messages that fall outside the policy the session declared. Show a clear message when content is blocked or a load fails, and give the frame a descriptive title.

## Accessibility

The bounded view exposes a labelled native text region, keyboard selection and visible focus. Custom surfaces should expose one accessible logical reading source and hide duplicate decorative canvas text. Synthetic composition and browser checks supplement real OS IME/NVDA/VoiceOver acceptance; untested combinations remain explicitly experimental.
