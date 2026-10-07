# NSEPage

`NSEPage` is a neutral NSE surface for turning any React content like a sheet of paper. It is not tied to a SynWare route. Use it for page transitions, peel-to-settings panels, inside/reverse app surfaces, card flips, and tear-away interactions.

## Basic Use

```tsx
import { NSEPage } from "@syndromatic/syncloudos/nse/page";

<NSEPage inside={<SettingsPanel />}>
  <MainContent />
</NSEPage>
```

The default preset for curl surfaces is `settingsPeel`: the page rests with a small real fold in the bottom-right corner (the dog-ear), hover gives a pre-curl peek, click/tap peels the page back toward the top-left, and click-and-drag lets the fold follow the cursor before settling open or closed.

```tsx
<NSEPage
  preset="settingsPeel"
  front={<AppScreen />}
  inside={<SettingsPanel />}
  interactive
/>
```

## Controlled Turn

```tsx
<NSEPage
  preset="paperTurn"
  progress={turnProgress}
  front={<PageOne />}
  back={<PageOneReverse />}
  inside={<PageTwo />}
  onProgressChange={setTurnProgress}
/>
```

## Imperative Control

```tsx
const pageRef = useRef<NSEPageHandle>(null);

pageRef.current?.open();
pageRef.current?.close();
pageRef.current?.tear();
pageRef.current?.setProgress(0.42);
```

## API Shape

- `front` is the visible sheet face. If omitted, `children` becomes the front face.
- `inside` is the content revealed behind the page as it curls, turns or tears away.
- `back` is the reverse side of the sheet. In curl mode it renders inside the flap; if omitted, the flap shows the preset's paper underside. The front subtree is never mounted twice.
- `curlUnderside` picks what a 3D curl shows on the paper's underside: `"print-through"` (the default, the page's own print read faintly through blank paper) or `"back"` (the `back` content, for the reverse page of a spread).
- `progress` is controlled `0..1`; `defaultProgress` is uncontrolled.
- `open` is a boolean shortcut for controlled `0` or the preset's `openProgress`.
- `NSEPageHandle.turnTo(progress, { durationMs })` animates to a pose; `setProgress(progress)` jumps directly.
- `preset` can be a built-in preset or a full `NSEPagePreset`.
- `presetOverrides` lets an app tune motion, material, and interaction without forking the component.
- `interactive` enables pointer-driven page turns from one or more edges.
- `dogEar` / `dogEarLabel` control the built-in corner trigger — an invisible, accessible hit-area over the page's real resting fold (`motion.restProgress`). There is no painted triangle; the fold itself is the affordance.
- `backGhost` (default `false`) shows a faint mirrored ghost of the front content through the flap's paper underside, like the iOS Maps curl. The ghost mounts once and stays display-gated until the page actually curls, so heavy front content (e.g. WebGL) does not run twice at rest — but it *does* run twice while curling. For fronts hosting WebGL/video/canvases, pass a ReactNode as `backGhost`: a static stand-in rendered with the same ghost styling, so the translucent-paper read survives without a second heavy subtree. The highest-fidelity stand-in is a frame snapshot: capture the front's canvases into one static canvas when the curl starts after the scoped renderer submits a fresh frame and layer crisp replica chrome on top.
- While curling past the hover peek, the root gets `data-curling="true"` and elevates via `z-index: var(--nse-page-curl-z, 80)` so the peeled paper passes over surrounding chrome; tune or lower `--nse-page-curl-z` (e.g. below a tab bar's z-index) to control what it may cover.

## Curl Model

Curl mode models a physical paper fold in `nsePageGeometry.ts` (pure math, no React):

- At progress `p` the page corner travels along a peel direction that rotates from the page diagonal toward vertical as the page comes over, so the corner sweeps an arc toward the far corner and the fold line ends up crossing the side and top edges with the whole bottom edge lifted.
- During a drag the fold tracks the pointer instead: the curled corner rides under the finger (direction and distance), then snaps open or back to rest on release.
- The fold line is the perpendicular bisector between the resting corner and the curled corner. The front face is clipped at the fold; the flap is the region beyond it, mirrored across the fold line with a real reflection matrix.
- The flap's crease edge is bulged outward along a quadratic arc so the silhouette reads as a cylindrical roll, and fold-aligned gradients supply rim light, crease shadow, and the roll highlight.
- A fold-aligned gradient paints the cast shadow on the layer underneath, and a silhouette `drop-shadow` grounds the flap.
- Geometry is computed in measured layout pixels (`ResizeObserver`), so fold angles stay true at any aspect ratio.
- `prefers-reduced-motion` (or the `reducedMotion` prop) skips the curl entirely and crossfades front/back content instead.

Curls are drawn in 3D where WebGL 2 is available: the page is drawn into a texture as it rests and rolled round the fold in a WebGL canvas, with soft shadows and its own print showing through the underside. Each curl is owned by one renderer from start to finish (`data-curl-renderer` is `webgl` or `css`); the 2D fold above stands in only where the 3D roll can't run, and reduced motion crossfades instead.

Built-in presets: `nseSheet`, `paperTurn`, `bookTurn`, `bookCurl`, `settingsPeel`, `insideReveal`, `tearAway`, `cardFlip`.

## Tear

`tearAway` tears a sheet off a pad. `edge` is the edge the sheet is bound along (`"top"` by default) and `corner` the corner it is torn from (`"bottom-right"` by default). The corner curls up and over towards the opposite corner, exactly as a curl does, until the sheet has folded over onto the far half of the page; pulled on, the paper gives along a ragged line just below the binding, the rip running from the end the fold reaches first to the other, and the free sheet flies on along the pull and out of sight. Each tear leaves its ragged stub at the binding over the sheets beneath, as a pad does (`tearStubs={false}` leaves none).

```tsx
const padRef = useRef<NSEPageHandle>(null);

<NSEPage
  ref={padRef}
  preset="tearAway"
  interactive
  front={<Note note={notes[index]} />}
  inside={<Note note={notes[index + 1]} />}
  onTear={() => {
    // The sheet has gone: the next note is now on top.
    setIndex((value) => value + 1);
    requestAnimationFrame(() => padRef.current?.reset());
  }}
/>;

padRef.current?.tear(); // tears the sheet off without a finger
```

A finger takes the sheet near its corner. The corner rides under it, the rip never closes again once it has opened, and the sheet comes away on its own once the rip reaches the far end; let go once the corner has come well over and it tears away, let go sooner and it settles back. A rip, once opened, always runs on. The 3D sheet and its shadows are drawn by the curl's renderer; the 2D stand-in folds the page's own layers and slides the sheet away.

## Book Turns

`bookTurn` is the opt-in spine turn. Its motion uses `hinge: "opposite-edge"`
and `projection: "spread"`: a right-edge forward turn rotates from the left
spine toward `-180deg`, while a left-edge backward turn rotates from the right
spine toward `+180deg`. The preset uses square paper and does not reuse the
destination layer as an implicit reverse face.

The rigid single-sheet fallback works with the normal `front` and `back` props.
For a flexible leaf, supply static data-URL snapshots while keeping the live
semantic trees in those props:

```tsx
<NSEPage
  preset="bookTurn"
  front={<CurrentPage />}
  back={<CurrentPageReverse />}
  inside={<NextPage />}
  turnSurface={{ front: frontPngDataUrl, back: backPngDataUrl }}
/>
```

During `0 < progress < 1`, the live sheet remains mounted once but is visually
replaced by 32 inert, length-preserving image strips. `turnSurface.strips` may
tune that count. The strips use `motion.rollWidth` for the traveling curl width and disappear at
the exact flat endpoints. Controlled progress and rAF-driven turns bypass CSS
transitions, so the supplied progress maps directly to the rendered pose.


## Live book-corner curl

`bookCurl` reuses the live DOM corner-peel renderer with `motion.curlPath: "book"` and `projection: "spread"`. Its corner travels horizontally across twice the leaf width, landing on the opposite side of the binding. Right and left corners mirror the trajectory. The consumer owns pagination and supplies the stationary `inside` page and the physical leaf's `back`.

For a spread, place two independent NSEPage leaves on the left and right. Activate only the leaf being turned. A supplied reverse page needs horizontal mirroring inside the fold because the fold itself reflects that face; portrait can instead use the default faint front ghost. This path requires no snapshots. The existing Settings peel trajectory is unchanged.
