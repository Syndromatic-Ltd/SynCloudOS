# Data views

Data views present collections: tables, outlines, grids, browsers and long lists. Each one reads its items from a controller, so selection, sorting and editing live in one place while the view handles drawing, keyboard navigation and assistive technology. Every data view is virtualised. It draws the rows in and near the viewport, so a collection of tens of thousands of items scrolls as smoothly as a short one.

All components come from `@syndromatic/syncloudos/nse`.

## Adapters

A data view connects to its controller through an adapter, a small object that tells the view how to identify and label an item:

```ts
import { NSEArrayController } from "@syndromatic/syncloudos/nse";

export interface Track {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly seconds: number;
}

export const tracks = new NSEArrayController<Track, string>({
  id: "tracks",
  getId: (track) => track.id,
  content: [
    { id: "1", title: "Overture", artist: "Ensemble", seconds: 214 },
    { id: "2", title: "Interlude", artist: "Ensemble", seconds: 96 },
  ],
  selection: { mode: "multiple", allowsEmpty: true },
});

export const adapter = {
  controller: tracks,
  idForItem: (track: Track) => track.id,
  labelForItem: (track: Track) => track.title,
};
```

The controller handles the data. The [controllers guide](controllers.md) describes filtering, sorting, selection and edit transactions, and each of them reaches every view that uses the controller.

A view keeps its state, such as keyboard focus and an edit in progress, for as long as `adapter.controller` stays the same. The adapter object itself may be new on every render, so an inline `adapter={{ controller, idForItem, labelForItem }}` is fine: the view reads `idForItem`, `labelForItem` and `isItemDisabled` from the latest adapter. It projects the items again only when `idForItem` or `isItemDisabled` is a different function, so define them outside the component, or memoise them, when the collection is large. Giving the view a different controller starts it afresh.

## Table

`NSETableView` shows items as rows with typed columns. A column says how to read its value, how wide it may be, and optionally how to format, sort, render and edit it.

```tsx
import { NSETableView } from "@syndromatic/syncloudos/nse";
import { adapter, type Track } from "./tracks";

export function TrackTable() {
  return (
    <NSETableView<Track, string>
      aria-label="Tracks"
      adapter={adapter}
      selectionMode="multiple"
      rowHeight={28}
      columns={[
        { id: "title", title: "Title", value: (track) => track.title, width: { min: 120, ideal: 220, max: 480 } },
        { id: "artist", title: "Artist", value: (track) => track.artist, width: { min: 100, ideal: 160, max: 320 } },
        {
          id: "length",
          title: "Length",
          value: (track) => track.seconds,
          width: { min: 60, ideal: 80, max: 120 },
          alignment: "end",
          render: (value) => {
            const seconds = Number(value);
            return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
          },
        },
      ]}
    />
  );
}
```

Table features:

- Columns resize, reorder and hide. Persist the layout through `onColumnConfigurationChange`, and restore it with `columnWidths`, `columnOrder` and `columnVisibility`.
- Give a column a `sort` comparator and users can sort by clicking its header. `onSortDescriptorsChange` reports the result.
- Set `editable` on a column and supply an `editor` to edit in place. `onEditCommit` receives the change.
- Selection reports through `onSelectionChange`, and `onDoubleAction` fires when a row is activated.
- Drag and drop works through `dragBinding`, `onValidateDrop` and `onAcceptDrop`. See [drag and pasteboard](drag-and-pasteboard.md).
- The rows scroll inside a viewport 460 px tall by default. Set `viewportBlockSize` to a pixel height, or to `"fill"` to take the container's height and follow it as it resizes. Use `"fill"` for a table that fills a pane, such as a source list between a pane header and footer.

## View states

Every data view accepts a `state` that replaces its content with a message when there is nothing to show. The kinds are `ready`, `loading`, `empty`, `disabled`, `read-only`, `invalid`, `denied`, `interrupted` and `error`. The last three can carry a `retry` or `resume` callback, which the view presents as an action.

```tsx
import { NSETableView } from "@syndromatic/syncloudos/nse";
import { adapter, type Track } from "./tracks";

export function EmptyTable() {
  return <NSETableView<Track, string> adapter={adapter} columns={[]} state={{ kind: "empty", message: "No tracks yet." }} />;
}
```

## Controller lifetime

A data view never owns its controller. The module, the component or the application session that created it does, as the [controllers guide](controllers.md#controller-lifetimes) describes. In a component, create the controller with `useNSEArrayController` or `useNSETreeController` so it survives React StrictMode and is disposed when the component unmounts.

If the controller is disposed while a view still shows it, the view keeps its last rows on screen and turns inert. It presents the `disabled` state with the message "This content is no longer available.", sets `aria-disabled` on the view and its items, and leaves the tab order. Pointer and keyboard selection, activation, context menus and editing are ignored rather than thrown from an event handler, and development builds log one `console.warn` per view that starts with `[NSE_CONTROLLER_DISPOSED]` and names the controller and the reason it was disposed. Calling the controller's own methods still throws `SynCloudOSLifecycleError`. Give the view a live controller to make it interactive again.

## Outline

`NSEOutlineView` presents a hierarchy with expandable rows, driven by an `NSETreeController`. It supports keyboard expansion and collapse, drop proposals for moving nodes, and lazy loading through the controller's `loadChildren`.

A sidebar is an `NSEOutlineView` with `selectionHighlightStyle="sourceList"`. The delegate's `isGroupItem` marks section headers, `shouldShowOutlineCell` hides a section's disclosure arrow, and `shouldSelect` decides what can be selected (by default, everything but group items). The theme draws group rows and the source-list background; see [Source-list application chrome](nse/source-list-chrome.md). `viewportBlockSize="fill"` takes the container's height.

## Collection view

`NSECollectionView` lays items out in a grid or a list. `createAdaptiveCollectionLayout` picks the number of columns from the available width, and `createListCollectionLayout` makes a single column. Items render through `NSETableCellView`, which arranges an image, a primary and secondary line and a badge.

### Cover Flow

`createCoverFlowCollectionLayout` gives the collection view a Cover Flow layout, after a custom `NSCollectionViewLayout` (AppKit's own Cover Flow was the private `IKImageFlowView`). The selected item faces the viewer, the others turn inward on either side, and every item is mirrored on the floor. AnimationFX draws the view: each item is a layer, and the mirrors sit under an `AFXReplicatorLayer` that darkens them with its instance colour, while a fade mask on each mirror fades it out. Items and mirrors are drawn in depth order, so a nearer item hides a farther one and its mirror.

```tsx
const showcase = createCoverFlowCollectionLayout({ isWrapped: true });

<NSECollectionView
  aria-label="Showcase"
  adapter={adapter}
  layout={showcase}
  imageForItem={(item) => pictures.get(item.id)}   // an ImageFX IFXImageResource, from useImages().load
  subtitleForItem={(item) => item.caption}
  onActivate={(id, item) => open(item)}
/>
```

| Layout property | Default | Meaning |
| --- | --- | --- |
| `cameraDistance` | `4` | The camera's distance from the selected item, in item widths. Nearer is more dramatic. |
| `cameraPitch` | `0.335` | How far the camera looks down on the items, in radians. `0` is a level camera. |
| `itemAspectRatio` | `16 / 10` | Every item's width over its height; pictures are cropped to it. |
| `itemHeightFraction` | `0.62` | The selected item's height as a fraction of the view's height. |
| `itemCentreFraction` | `0.47` | Where the selected item's centre sits, from the top of the view. |
| `isWrapped` | `false` | The items form an endless ring. |
| `visibleItemsEachSide` | `4` | Items at full opacity on each side before the fan fades out. |

The defaults are AnimationFX's showcase camera. Software uses `{ cameraDistance: 3, cameraPitch: 0.04 }`, a level camera a little nearer.

The selection is the array controller's: the selected item is the centre one, and selecting an item on the controller scrolls to it. The arrow keys, Home and End, a click on a side item, a drag and a horizontal wheel select. A drag moves the items under the pointer, and on release the scroll settles on the nearest item, carried on by the drag's speed. Enter or a click on the centre item activates it, calling `onActivate`. The title under the centre item is the adapter's label; `subtitleForItem` supplies the line beneath it, after `IKImageBrowserItem.imageSubtitle`, and `showsTitles` and `showsReflections` turn either off.

`coverFlowItemAttributes` and `coverFlowLayoutAttributes` give the same geometry to a scene of your own, as AnimationFX's showcase uses it.

## Browser

`NSEBrowser` is the multi column view familiar from the Finder. It reads its hierarchy from an `NSEBrowserDataSource`, and it loads each column on demand.

## Lists

A list is a single-column `NSETableView` with `headerHidden`, as in AppKit, where a list is a view-based `NSTableView` without a header view. The table draws only the rows in view, so a list of thousands of rows costs no more than one that fits on screen.

```tsx
import { NSETableCellView, NSETableView, useNSEArrayController } from "@syndromatic/syncloudos/nse";

const columns = [{
  id: "name", title: "Name", value: (item: Reminder) => item.title, width: { min: 120, ideal: 320, max: 2000 },
  render: (_value: string, item: Reminder) => <NSETableCellView primary={item.title} secondary={item.due} />,
}];

export function Reminders({ reminders }: { readonly reminders: readonly Reminder[] }) {
  const controller = useNSEArrayController<Reminder, string>({ id: "reminders", getId: (item) => item.id });
  useEffect(() => { controller.setContent(reminders); }, [controller, reminders]);
  return <NSETableView aria-label="Reminders" headerHidden rowHeight={40} viewportBlockSize="fill"
    adapter={{ controller, idForItem: (item) => item.id, labelForItem: (item) => item.title }} columns={columns} />;
}
```

## Rule and predicate editors

`NSERuleEditor` and `NSEPredicateEditor` let users build filters from rows of conditions, in the style of Mail's smart mailboxes. They produce a structured rule, which you evaluate against your own data.

## Accessibility

Data views expose list, grid, tree and row semantics with stable labels and selection state. Keyboard navigation and visible focus continue to work inside the virtual window, and rows scroll into view as focus moves. On compact layouts, keep commands reachable through the responder chain and never rely on hover alone.
