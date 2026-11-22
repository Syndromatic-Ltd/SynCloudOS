# Chronosphere

Chronosphere is the version browser. Any SynWare can show a history through it: Chronosphere takes over the screen above the application, shows the versions in the view the application chose, and returns when the user is done. Your application supplies the content and decides whether a past version can be restored.

Chronosphere handles everything around the archive: capturing the present, the wait bezel while it prepares, the overlay, focus and the return to the application. A view draws the archive itself. The framework ships two views, and you can write your own.

Import it from `@syndromatic/syncloudos/chronosphere`, which connects the archive to the presenting application's images, animation, scheduling and media queries. Saving and restoring stay with your document code, through the restore action you supply.

| View | What it draws |
| --- | --- |
| `ChronosphereVortexView` (default) | The history recedes into the Vortex, a timeline runs down the edge and the present flies in from the window. A subject with the `versions` layout shows the present page beside its past versions instead. |
| `ChronosphereGridView` | Every version at once, as a grid of pages over the application. Arrow keys choose, Return restores, Escape returns. |

```tsx
import { Chronosphere, ChronosphereGridView, createChronosphereAppSubject } from "@syndromatic/syncloudos/chronosphere";
```

Import its styles once, beside NSE's, in each SynWare that presents an archive:

```ts
import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/chronosphere/styles.css";
```

## Present a history

Describe the subject, then render `Chronosphere` while the archive is open:

```tsx
import type { ChronosphereVersion } from "@syndromatic/syncloudos/chronosphere";

type PageDetail = { readonly page: SavedPage; readonly author: string };
const entries: ChronosphereVersion<PageDetail>[] = savedPages.map(saved => ({
  id: saved.id,
  sequence: saved.sequence,
  savedAt: saved.timestamp,
  title: saved.title,
  displayLabel: `Version ${saved.sequence}`,
  dateLabel: formatSavedDate(saved.timestamp),
  detail: { page: saved.page, author: saved.author },
}));

const subject = createChronosphereAppSubject(`post:${post.id}`, post.title, entries, {
  layout: "versions",
  card: { aspectRatio: 1 / Math.SQRT2, cornerRadius: 0, material: "paper", faceWidth: 720 },
});

{open ? <Chronosphere
  subject={subject}
  capturePresent={signal => capturePage(signal)}
  onRestore={entry => restore(entry.id)}
  onReturn={() => setOpen(false)}
  renderFace={(entry, { detail }) => entry.detail ? <VersionPage page={entry.detail.page} detail={detail} /> : null}
/> : null}
```

`ChronosphereVersion<TDetail>` needs a stable `id`, a finite numeric `sequence`, a `title` and a `dateLabel` you've already formatted. `sequence` gives the chronological order, increasing from oldest to newest. A time-ordered source can use epoch milliseconds, as long as every record in the subject uses the same unit. The optional `savedAt`, in epoch milliseconds, breaks ties in `sequence`, and versions still tied keep their input order. Neither `displayLabel` nor `dateLabel` is parsed, so labels such as `1.9`, `1.10` and `First draft` don't affect the order.

Mark the live record with `isCurrent: true`. It sorts first whatever its sequence, can't be restored, and supplies the present page in the `versions` layout; saved records leave the marker out. Your code owns the records and their order, and Chronosphere never saves or invents versions.

The optional `summary`, `screenshotSrc` and RGB `tint` (each channel 0 to 1) control how a version is shown; leave out `tint` for the default. `detail` carries your own typed data, which Chronosphere never looks inside. The optional `changeMagnitude` lets the views jump between significant changes. Put descriptions, lists, categories and tags in `detail`.

| Property | Meaning |
| --- | --- |
| `subject` | What is browsed and its typed history (`ChronosphereVersion<TDetail>[]`, any order; views receive current first, then source sequence descending). |
| `view` | The view to draw with. Defaults to `ChronosphereVortexView`. |
| `capturePresent` | Draws the live subject to an image, for the present card. Optional: a view that shows no present can do without. |
| `captureForeground` | The whole launching window, which the Vortex view sends away as the archive arrives. Defaults to `capturePresent`. |
| `presentOrigin` | A function returning where the subject's page sits on screen, in viewport pixels, so the present lifts off from there. Leave the page out of `captureForeground` so it isn't drawn twice. |
| `onRestore` | Restores a past version. Leave it out for a read-only history; views then offer no Restore. |
| `onReturn` | Called once the archive has gone. |
| `renderFace` | Draws a version's own page on its card, laid out at the card's `faceWidth` and scaled. Return null to use the entry's screenshot. |
| `renderDetail` | Draws application detail content inside Vortex's existing modal and focus scope. Receives the typed record and accessible `titleId`/`bodyId`; attach those IDs to its heading and body. Without it, the modal shows the neutral title, display/date labels and summary. |
| `renderPreparation` | Replaces the wait bezel, for an application that shows progress in its own control. |
| `labels` | Chronosphere's words, for localisation. |

Preparation runs once each time the archive opens. Re-rendering with new inline capture callbacks doesn't restart it, and it uses whichever callbacks are current when it runs. If capture or preparation fails, the application stays in view with Cancel and Retry.

## Write a view

A view is a function component (or a `memo`/`forwardRef` wrapper) that receives a model, the actions and the face/detail renderers:

```tsx
import type { ChronosphereViewComponent } from "@syndromatic/syncloudos/chronosphere";

export const TimelineView: ChronosphereViewComponent = ({ model, actions, renderFace }) => (
  <MyTimeline
    title={model.subject.label}
    versions={model.entries}
    onRestore={actions.restore ? entry => { actions.restore!(entry); actions.exit(); } : undefined}
    onDone={actions.exit}
  />
);
```

| Model field | Meaning |
| --- | --- |
| `subject`, `entries` | The subject and its history, newest first. |
| `presentImage`, `foregroundImage`, `presentRect` | The captures and where the present sat, or null when the application captured none. |
| `labels` | The resolved words. |
| `prepared` | Whatever the view's `prepare` returned. |

Call `actions.exit()` once the view's own leaving animation has finished; Chronosphere then unmounts it and calls `onReturn`. `actions.restore` is absent when the archive cannot restore.

A view that needs work done before it appears, such as decoding artwork, declares `prepare` on the component. It runs during the wait with the application's image client and an abort signal, and its result arrives as `model.prepared`:

```tsx
export const StarfieldView: ChronosphereViewComponent<Starfield> = Object.assign(
  (props: ChronosphereViewProps<Starfield>) => <Stars field={props.model.prepared} {...props} />,
  { prepare: ({ images, signal }: ChronospherePreparationContext) => loadStarfield(images, signal) },
);
```

You can keep views with different prepared types in one variable and choose between them at run time. `ChronosphereProps<TPrepared, TDetail>`, `ChronosphereViewComponent<TPrepared, TDetail>`, `ChronosphereViewModel<TPrepared, TDetail>` and `ChronosphereViewProps<TPrepared, TDetail>` type the prepared value and your detail separately. `ChronosphereSubject<TDetail>`, `ChronosphereViewActions<TDetail>`, `ChronosphereFaceRenderer<TDetail>` and `ChronosphereDetailRenderer<TDetail>` carry your detail type through custom views, faces and restore callbacks. Both built-in views accept any detail type.

## The Vortex

`VortexEffect` is the Vortex on its own: nebula, stars, a spinning cloud and a warm core, drawn with AnimationFX layers. Any application can use it, for example as a screensaver or a backdrop:

```tsx
<VortexEffect active preset="screensaver" maxDpr={1.25} />
```

It decodes its four images through the application's image client, or takes them already decoded (`preparedImages`, from `loadVortexImages`). It follows the reduced-motion setting unless you set `reducedMotion`. If the device can't draw a frame, it stops and shows the still nebula image.
