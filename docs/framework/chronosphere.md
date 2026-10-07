# Chronosphere

Chronosphere is the version browser. Any SynWare presents its history through it: the browser takes over the screen above the application, shows the subject's versions in the view the application chose, and returns when the person is done. Applications supply their own content and decide whether a past version can be restored.

Chronosphere owns everything around the archive: capturing the present, the wait bezel while it prepares, the overlay, focus and the return to the application. A **view** draws the archive itself. The framework ships two views, and an application can write its own, in the same way Webspring is composed of views.

NSE owns the archive presentation and its narrow image, animation, scheduling and media-query contracts. The permanent AppSDK `/chronosphere` entry supplies those capabilities from the presenting app's mount; NSE does not depend on app context. Document services retain persistence and restoration authority through the application's restore action. Raw NSE presentation modules are internal framework composition points, while applications use the public entry below.

| View | What it draws |
| --- | --- |
| `ChronosphereVortexView` (default) | Time Machine's archive: the history recedes into the Vortex, a timeline runs down the edge and the present flies in from the window. A subject with the `versions` layout gets Lion's Versions instead: the present page beside its past. |
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

`ChronosphereVersion<TDetail>` requires a stable `id`, finite numeric `sequence`, `title`, and caller-formatted `dateLabel`. `sequence` is the source's chronological order, increasing from oldest to newest. A time-ordered source can use epoch milliseconds as its sequence; every record in that subject must use the same unit. Optional `savedAt` is epoch milliseconds and breaks equal-sequence ties. Fully tied versions keep input order. Neither `displayLabel` nor `dateLabel` is parsed: labels such as `1.9`, `1.10`, and `First draft` have no effect on ordering.

Mark the live record with `isCurrent: true`: it sorts first regardless of sequence, cannot be restored, and supplies the present pane in the `versions` layout. Saved records simply omit the marker. The source owns record identity and chronology; Chronosphere neither saves nor fabricates document versions.

Optional `summary`, `screenshotSrc`, and RGB `tint` in 0..1 supply neutral presentation. Omit `tint` for the built-in default. `detail` carries typed application data; Chronosphere does not interpret its properties. `changeMagnitude` remains optional for significant-change navigation. Narrative descriptions, lists, availability categories and tags belong to the application payload.

| Property | Meaning |
| --- | --- |
| `subject` | What is browsed and its typed history (`ChronosphereVersion<TDetail>[]`, any order; views receive current first, then source sequence descending). |
| `view` | The view to draw with. Defaults to `ChronosphereVortexView`. |
| `capturePresent` | Draws the live subject to an image, for the present card. Optional: a view that shows no present can do without. |
| `captureForeground` | The whole launching window, which the Vortex view sends away as the archive arrives. Defaults to `capturePresent`. |
| `presentOrigin` | Where the subject's page sits on screen, so the present lifts off from there. Leave the page out of `captureForeground`. |
| `onRestore` | Restores a past version. Leave it out for a read-only history; views then offer no Restore. |
| `onReturn` | Called once the archive has gone. |
| `renderFace` | Draws a version's own page on its card, laid out at the card's `faceWidth` and scaled. Return null to use the entry's screenshot. |
| `renderDetail` | Draws application detail content inside Vortex's existing modal and focus scope. Receives the typed record and accessible `titleId`/`bodyId`; attach those IDs to its heading and body. Without it, the modal shows the neutral title, display/date labels and summary. |
| `renderPreparation` | Replaces the wait bezel, for an application that shows progress in its own control. |
| `labels` | Chronosphere's words, for localisation. |

Preparation runs once per opening. Re-rendering with new inline capture callbacks does not restart it; the latest callbacks are used when it runs. A failed capture or failed preparation leaves the application in view with Cancel and Retry.

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

A view that needs work done before it appears, such as decoding artwork, declares `prepare` on the component. It runs during the wait, receives the application's image client and an abort signal, and its result arrives as `model.prepared`:

```tsx
export const StarfieldView: ChronosphereViewComponent<Starfield> = Object.assign(
  (props: ChronosphereViewProps<Starfield>) => <Stars field={props.model.prepared} {...props} />,
  { prepare: ({ images, signal }: ChronospherePreparationContext) => loadStarfield(images, signal) },
);
```

Views of different prepared types can be held in one variable and chosen at run time. `ChronosphereProps<TPrepared, TDetail>`, `ChronosphereViewComponent<TPrepared, TDetail>`, `ChronosphereViewModel<TPrepared, TDetail>`, and `ChronosphereViewProps<TPrepared, TDetail>` keep preparation and application details independently typed. `ChronosphereSubject<TDetail>`, `ChronosphereViewActions<TDetail>`, `ChronosphereFaceRenderer<TDetail>`, and `ChronosphereDetailRenderer<TDetail>` preserve the payload through custom views, faces and restore callbacks. Both built-in views accept any payload.

## The Vortex

`VortexEffect` is the Time Machine vortex on its own: nebula, stars, a spinning cloud and the warm core, drawn with AnimationFX layers. Any application can stage it, as a screensaver or a backdrop:

```tsx
<VortexEffect active preset="screensaver" maxDpr={1.25} />
```

It decodes its four plates through the application's image client, or takes them already decoded (`preparedImages`, from `loadVortexImages`). It follows the reduced-motion preference unless told otherwise (`reducedMotion`). If the device cannot draw a frame it stops and shows the still nebula plate.
