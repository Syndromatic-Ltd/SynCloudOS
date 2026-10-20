# AnimationFX effects and rendering

This page covers the layers that generate or stream content, and the renderer that draws layers to a canvas: `AFXReplicatorLayer`, `AFXEmitterLayer` with `AFXEmitterCell`, `AFXParticleLayer`, `AFXTiledLayer` and `AFXRenderer`. They build on the layer API described in [Layers](layers.md).

```ts
import { AFXEmitterCell, AFXEmitterLayer, AFXReplicatorLayer } from "@syndromatic/syncloudos/fx/animation";
```

## At a glance

| Class | Analogue | Use it for | Bound to |
| --- | --- | --- | --- |
| `AFXReplicatorLayer` | `CAReplicatorLayer` | Repeating sublayers with a cumulative transform, colour and delay | An element (`bindReplicatorLayer`) or a renderer (`makeReplicatorLayer`) |
| `AFXEmitterLayer` and `AFXEmitterCell` | `CAEmitterLayer` and `CAEmitterCell` | Particle effects driven by rules | An element (`bindEmitterLayer`) |
| `AFXParticleLayer` | (none) | Drawing particles that your own simulation computes | A renderer (`makeParticleLayer`) |
| `AFXTiledLayer` | `CATiledLayer` | Very large content drawn in tiles on demand | An element (`bindTiledLayer`) |
| `AFXRenderer` | (none) | Drawing a layer tree of images, video and particles to a canvas | A canvas (`createRenderer`) |

Every class here is a subclass of `AFXLayer`, apart from the renderer, so it has all the geometry, appearance, sublayer and animation members from [Layers](layers.md). This page lists only what each class adds.

## AFXReplicatorLayer

Draws its sublayers several times. Each copy, or *instance*, applies the `instanceTransform` once more than the copy before it, and so a single transform makes a row, a ring or a spiral. Instance colour and alpha shift step by step, and each instance can start its animation later than the last.

The layer's own content and style draw once. Only its sublayers repeat.

| Member | Type | Default | Description |
| --- | --- | --- | --- |
| `instanceCount` | `number` | 1 | An integer from 0 to 64. With 0 the sublayers do not draw. |
| `instanceTransform` | `AFXTransform3D` | identity | Applied cumulatively: instance *n* uses the transform multiplied *n* times, around the layer's bounds origin. |
| `instanceColour` | `GFXColour` | opaque white | Multiplies the colour of every instance. |
| `instanceRedOffset`, `instanceGreenOffset`, `instanceBlueOffset`, `instanceAlphaOffset` | `number` | 0 | Each from -1 to 1. Instance *n* adds *n* times the offset to that channel. |
| `instanceDelay` | `number` | 0 | Seconds from 0 to 4 between successive instances' animations. The total delay, `instanceDelay * (instanceCount - 1)`, must not exceed 4 seconds. |
| `projectionMode` | `"planar" \| "projective"` | `"planar"` | `"projective"` keeps depth so instances that rotate in 3D sort correctly. Both kinds of surface support it. |
| `preservesDepth` | `boolean` (read only) | `false` | Whether the layer is in projective mode on a surface that keeps depth. |
| `playInstances(animation)` | `AFXAnimationHandle` | | Plays an animation once on every instance, each offset by `instanceDelay`. |

Changing any property interrupts an instance animation that is playing. An `instanceCount` outside 0 to 64 throws `RangeError`, as does a total delay above 4 seconds.

**`playInstances`.** It takes an `AFXBasicAnimation`, `AFXKeyframeAnimation` or `AFXSpringAnimation` whose key path is `"opacity"` or `"transform"` (`TypeError` for any other). Instance *n* plays the animation delayed by *n* times `instanceDelay`, so a fade with an `instanceDelay` of 0.1 sweeps across the instances. The animation runs for its own duration plus the last instance's delay. The handle it returns behaves like any other. If instances were already animating, the new animation retargets from each instance's visible value. Reduced motion or a suspended page completes it at once. A `seek` outside 0 to the total duration throws `RangeError`.

```ts
import { AFXAnimation, AFXBasicAnimation, AFXTransform3D, type AFXLayer, type AFXReplicatorLayer } from "@syndromatic/syncloudos/fx/animation";
import { GFXColour } from "@syndromatic/syncloudos/fx/graphics";

/** A ring of twelve dots that pulse in turn. `dot` is a small layer already added as a sublayer. */
export function pulsingRing(ring: AFXReplicatorLayer, dot: AFXLayer) {
  ring.bounds = { x: 0, y: 0, width: 120, height: 120 };
  ring.position = { x: 60, y: 60 };
  dot.bounds = { x: 0, y: 0, width: 12, height: 12 };
  dot.position = { x: 60, y: 8 };
  dot.cornerRadius = 6;
  dot.backgroundColour = GFXColour.rgba(0.2, 0.6, 1);

  ring.instanceCount = 12;
  ring.instanceTransform = AFXTransform3D.translation(60, 60)
    .multiply(AFXTransform3D.rotation((Math.PI * 2) / 12))
    .multiply(AFXTransform3D.translation(-60, -60)); // rotate each copy by 30 degrees about the ring's centre
  ring.instanceDelay = 0.08;

  return ring.playInstances(
    new AFXBasicAnimation({
      targetId: "dots",
      keyPath: "opacity",
      from: 1,
      to: 0.15,
      animation: new AFXAnimation({ duration: 0.6, autoreverses: true }),
    }),
  );
}
```

## AFXEmitterCell

The recipe for one kind of particle. A cell is immutable: build it, hand it to an emitter, and build a new one to change it. Angles are in radians, distances in layer points and times in seconds.

```text
new AFXEmitterCell(options: AFXEmitterCellOptions)
```

`contents` is the only required option. The constructor throws `TypeError` for a wrong type and `RangeError` for a number outside its range.

| Option | Type | Default | Range | Description |
| --- | --- | --- | --- | --- |
| `contents` | `GFXImage` | required | | The image every particle draws. |
| `name` | `string` | `""` | | A label for your own use. |
| `enabled` | `boolean` | `true` | | A disabled cell emits nothing. |
| `childCells` | `AFXEmitterCell[]` | `[]` | | Cells that each particle of this cell emits in turn, for trails and fireworks. |
| `birthRate` | `number` | 0 | 0 to 100,000 | Particles per second. The layer's own `birthRate` multiplies it. |
| `lifetime` | `number` | 0 | 0 to 3,600 | Seconds a particle lives. A cell with no lifetime emits nothing. |
| `lifetimeRange` | `number` | 0 | 0 to 3,600 | Each particle's lifetime varies by up to plus or minus half this. |
| `velocity` | `number` | 0 | plus or minus 1,000,000 | Initial speed, in points per second. |
| `velocityRange` | `number` | 0 | 0 to 1,000,000 | Random spread, plus or minus half. |
| `emissionLongitude` | `number` | 0 | | Direction in the layer's plane, in radians. 0 points right and positive angles turn towards +y. |
| `emissionRange` | `number` | 0 | at least 0 | Spread around the longitude, plus or minus half. A value of `2 * Math.PI` emits in every direction. |
| `emissionLatitude`, `emissionLatitudeRange` | `number` | 0 | range at least 0 | Tilt out of the plane, for projective depth. |
| `xAcceleration`, `yAcceleration`, `zAcceleration` | `number` | 0 | plus or minus 1,000,000 | Constant acceleration in points per second squared. A positive `yAcceleration` pulls particles down the screen. |
| `renderOrder` | `number` | 0 | integer, plus or minus 1,000,000 | Tie-break when sorting particles. |
| `colour` | `GFXColour` | opaque white | | The starting colour and alpha. |
| `redRange`, `greenRange`, `blueRange`, `alphaRange` | `number` | 0 | 0 to 2 | Random variation of each starting channel, plus or minus half. |
| `redSpeed`, `greenSpeed`, `blueSpeed`, `alphaSpeed` | `number` | 0 | plus or minus 100 | Change of each channel per second. A negative `alphaSpeed` fades a particle out. Channels clamp to 0 to 1. |
| `scale` | `number` | 1 | 0 to 1,024 | Starting size as a multiple of the image's pixel size. |
| `scaleRange` | `number` | 0 | 0 to 2,048 | Random variation, plus or minus half. |
| `scaleSpeed` | `number` | 0 | plus or minus 1,024 | Change of scale per second. Scale never goes below 0. |
| `spin`, `spinRange` | `number` | 0 | 1,024 and 0 to 2,048 | Rotation in radians per second, with random variation. |

Every option is also a read-only property of the cell.

## AFXEmitterLayer

Emits particles from a shape according to a list of cells, and animates them with its own clock, so it needs no `addAnimation` calls. Emission is deterministic: the same `seed`, settings and timing produce the same particles, which makes an effect reproducible in tests.

| Member | Type | Default | Description |
| --- | --- | --- | --- |
| `emitterCells` | `AFXEmitterCell[]` | `[]` | The root cells. The hierarchy, counting child cells, holds at most 64 cells and 8 levels, and the distinct images total at most 8 MiB. Otherwise `RangeError`. |
| `emitterPosition` | `GFXPoint` | `(0, 0)` | The centre of the emission shape, in layer coordinates. |
| `emitterSize` | `GFXSize` | `(0, 0)` | The size of the shape. |
| `emitterShape` | `AFXEmitterShape` | `"point"` | `"point"`, `"line"` (horizontal, of the given width), `"rectangle"` or `"circle"` (an ellipse of the given size). |
| `emitterMode` | `AFXEmitterMode` | `"volume"` | Where on the shape particles appear. `"points"` always starts at the position. `"volume"` fills the shape. `"surface"` and `"outline"` use its edge. |
| `renderMode` | `AFXEmitterRenderMode` | `"unordered"` | Draw order: `"unordered"`, `"oldestFirst"`, `"oldestLast"` or `"backToFront"` (by depth). |
| `projectionMode` | `"planar" \| "projective"` | `"planar"` | `"projective"` runs each particle position through `projectionTransform`. |
| `projectionTransform` | `AFXTransform3D` | identity | Used with projective mode. |
| `seed` | `number` | 1 | An integer from 0 to 4,294,967,295. |
| `birthRate` | `number` | 1 | A multiplier on every cell's `birthRate`, from 0 to 1,024. |
| `lifetime` | `number` | 1 | A multiplier on lifetimes, from 0 to 16. |
| `velocity` | `number` | 1 | A multiplier on speeds, plus or minus 1,024. |
| `scale` | `number` | 1 | A multiplier on scales, from 0 to 1,024. |
| `maxParticles` | `number` | 512 | The cap on live particles, an integer from 0 to 2,048. |
| `particleCount` | `number` | | Live particles now. |
| `isEmitting` | `boolean` | | Whether emission is running. |
| `diagnostics` | | | `particleCount`, `spawnedThisFrame`, `maximumParticles` and `maximumSpawnPerFrame` (128). |
| `startEmitting()` | `void` | | Starts a run from time zero. |
| `stopEmitting()` | `void` | | Stops and clears every particle at once. |

The layer spawns at most 128 particles a frame and never more than `maxParticles` alive. Changing any of the properties above restarts the run and clears the particles, and emission continues if it was running. Reduced motion clears the particles and pauses emission until the setting changes. A suspended page pauses emission.

An emitter layer needs an element surface, so bind it with `bindEmitterLayer(element)`. For a renderer, compute particles yourself and use `AFXParticleLayer`.

```ts
import { AFXEmitterCell, type AFXEmitterLayer } from "@syndromatic/syncloudos/fx/animation";
import { GFXColour, GFXImage } from "@syndromatic/syncloudos/fx/graphics";

function softDot(size: number): GFXImage {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre) / centre;
      const alpha = Math.max(0, 1 - distance);
      data.set([255, 255, 255, Math.round(alpha * 255)], (y * size + x) * 4);
    }
  }
  return new GFXImage({ width: size, height: size, alpha: "straight", colourSpace: "srgb", data });
}

/** A fountain: sparks rise, spread and fall under gravity while fading. */
export function fountain(emitter: AFXEmitterLayer) {
  emitter.bounds = { x: 0, y: 0, width: 240, height: 320 };
  emitter.position = { x: 120, y: 160 };
  emitter.emitterShape = "point";
  emitter.emitterPosition = { x: 120, y: 300 };
  emitter.seed = 7;
  emitter.emitterCells = [
    new AFXEmitterCell({
      name: "spark",
      contents: softDot(16),
      birthRate: 90,
      lifetime: 1.6,
      lifetimeRange: 0.6,
      velocity: 260,
      velocityRange: 80,
      emissionLongitude: -Math.PI / 2, // straight up
      emissionRange: 0.6,
      yAcceleration: 380,
      colour: GFXColour.rgba(1, 0.75, 0.25),
      greenRange: 0.3,
      alphaSpeed: -0.6,
      scale: 0.8,
      scaleRange: 0.4,
    }),
  ];
  emitter.maxParticles = 400;
  emitter.startEmitting();
}
```

## AFXParticleLayer

Draws a batch of particles that you compute. Use it on a renderer when you already run a simulation (a physics step, a shader-like timeline) and want the layer to draw the result. It adds no simulation of its own and no clock.

| Member | Description |
| --- | --- |
| `setParticles(particles)` | Replaces the batch with up to 8,192 `AFXEmitterParticle` values, and publishes one layer update for the batch. Each particle needs a unique integer `id`, `contents` (a `GFXImage`), `colour` (a `GFXColour`), `position`, `zPosition`, `renderOrder`, `scale` and `rotation`. All numbers must be finite and `scale` at least 0. The images are borrowed, so keep them alive while the layer uses them. |

`AFXEmitterParticle`: `id`, `contents`, `position: GFXPoint`, `zPosition`, `renderOrder`, `colour`, `scale` (a multiple of the image's pixel size), `rotation` (radians). Positions, colours, rotations and scales are local to the layer. More than 8,192 particles, or a duplicate id, throws `RangeError`, and a wrong type throws `TypeError`.

Call `setParticles` once a frame from your own loop. The layer rebuilds nothing else, so a frame costs one snapshot however many particles it holds.

## AFXTiledLayer

Draws content that is too large or too detailed to render whole. The layer works out which tiles the visible region needs, asks your callback to draw them, caches the results and fades them in. Tiles cover the layer's `bounds`, so set the bounds to the full size of the content, then tell the layer what part is visible.

| Member | Type | Default | Description |
| --- | --- | --- | --- |
| `drawTile` | `AFXTileDraw \| null` | `null` | `(request, signal) => GFXImage \| IFXImage \| Promise<...>`. Draws one tile. Setting it clears the cache. |
| `tileImageContext` | `IFXContext \| null` | `null` | Required when `drawTile` returns an `IFXImage`. The layer renders it to pixels with this context. |
| `tileSize` | `GFXSize` | 256 by 256 | In layer points. Each side greater than 0 and at most 4,096. |
| `levelsOfDetail` | `number` | 1 | An integer from 1 to 16. How many zoomed-out levels exist. |
| `levelsOfDetailBias` | `number` | 0 | An integer from 0 to 8. How many zoomed-in levels exist. |
| `contentsScale` | `number` | 1 | Pixels per point at level 0, from 0.25 to 8. Use the display's pixel ratio for sharp tiles. |
| `fadeDuration` | `number` | 0.25 | Seconds a new tile takes to fade in, from 0 to 2. Zero under reduced motion. |
| `maximumCacheBytes` | `number` | 32 MiB | From 1 MiB to 64 MiB. Least recently used tiles drop first. |
| `setVisibleRect(rect, zoomScale = 1)` | `void` | | Tells the layer which region is on screen, in layer coordinates, and the zoom (from 1/256 to 256). It chooses the level from the zoom, works out the tiles and queues them. |
| `invalidate(rect?)` | `void` | | Redraws the tiles that overlap the rectangle (default all). `setNeedsDisplay` does the same. |
| `waitForIdle()` | `Promise<void>` | | Resolves when nothing is queued or drawing. Rejects with the last drawing error, if a tile failed. |
| `diagnostics` | | | `visibleTiles`, `queuedTiles`, `pendingTiles`, `cachedTiles`, `cacheBytes`, `trackedVersions`, `level`, and the limits `maximumVisibleTiles` (256) and `maximumConcurrentRenders` (4). |

**The draw callback.** `AFXTileRenderRequest` gives `rect` (the tile in layer points), `pixelWidth` and `pixelHeight` (the exact size of the image to return), `scale` (pixels per point), `level` and `generation`. Return an image of exactly that pixel size, or `RangeError` follows and the tile is dropped. The `AbortSignal` aborts when the tile is no longer wanted, because the view moved, the region was invalidated or the layer disposed. Check it during long draws. At most four tiles draw at once.

**Levels.** The level is `round(log2(zoomScale))`, held between `-(levelsOfDetail - 1)` and `levelsOfDetailBias`, and the tile scale is `contentsScale * 2^level`. While the tiles for the new level draw, tiles from another level that overlap the view stay on screen as a stand-in.

**Limits.** The visible region needs at most 256 tiles, a tile at most 4,096 pixels a side and 4 Mi pixels, and the visible tiles together must fit in `maximumCacheBytes`. When a call would break these, `setVisibleRect` or `maximumCacheBytes` throws `RangeError`, and the layer keeps its previous state. Errors thrown by your draw callback do not throw at the caller. They surface from `waitForIdle`.

```ts
import type { AFXTiledLayer } from "@syndromatic/syncloudos/fx/animation";
import { GFXImage } from "@syndromatic/syncloudos/fx/graphics";

/** A 20,000 by 20,000 point grid, drawn only where it is on screen. */
export async function showGrid(layer: AFXTiledLayer, visible: { x: number; y: number; width: number; height: number }) {
  layer.bounds = { x: 0, y: 0, width: 20000, height: 20000 };
  layer.tileSize = { width: 256, height: 256 };
  layer.contentsScale = 2;
  layer.drawTile = ({ pixelWidth, pixelHeight, rect }, signal) => {
    const data = new Uint8Array(pixelWidth * pixelHeight * 4);
    const cell = 32 * (pixelWidth / rect.width);
    for (let y = 0; y < pixelHeight; y += 1) {
      if (signal.aborted) throw signal.reason;
      for (let x = 0; x < pixelWidth; x += 1) {
        const line = x % cell < 1 || y % cell < 1;
        data.set(line ? [70, 90, 120, 255] : [245, 247, 250, 255], (y * pixelWidth + x) * 4);
      }
    }
    return new GFXImage({ width: pixelWidth, height: pixelHeight, alpha: "opaque", colourSpace: "srgb", data });
  };
  layer.setVisibleRect(visible, 1);
  await layer.waitForIdle();
  return layer.diagnostics.cachedTiles;
}
```

## AFXRenderer

Draws a tree of layers to a canvas as textured rectangles. It suits scenes with many images, video frames and particles, where element layers would be heavy. The renderer owns the layers it creates, keeps a presentation snapshot of each, and submits the scene to the canvas on the next frame after anything changes.

You create one with `useAnimations().createRenderer(canvas, options?, signal?)`. The canvas draws through WebGL 2 with a 2D canvas fallback. A canvas takes one renderer at a time, and the renderer counts towards the session's live layer limit.

| Member | Description |
| --- | --- |
| `layer` | The root layer. Its frame always matches the viewport. Add content under it. |
| `makeLayer(parent?)` | Creates an `AFXLayer` under the parent (default the root) and returns it. |
| `makeReplicatorLayer(parent?)` | Creates an `AFXReplicatorLayer`. |
| `makeParticleLayer(parent?)` | Creates an `AFXParticleLayer`. |
| `setViewport({ width, height, pixelRatio })` | Sets the size in CSS points and the device pixel ratio, and redraws. Width and height are positive integers, `pixelRatio` is above 0, and the backing size must be a safe integer. Throws `RangeError` and restores the old viewport on failure. Call it when the canvas resizes. |
| `setPickable(layer, eligible)` | Includes a layer in `hitTest`. Layers do not pick by default, so decoration never captures the pointer. Throws `TypeError` for the root or a layer outside the scene. |
| `hitTest(point)` | The topmost pickable layer under a point in viewport coordinates, from the last scene the canvas accepted, or `null`. Honours depth, opacity and transforms. |
| `render()` | Draws now. The renderer also draws on its own after changes, so this matters mainly for tests and one-off captures. |
| `disposed`, `dispose()` | Whether the renderer is finished, and the way to finish it. Disposing releases the layers it made and the canvas. |

`AFXRendererViewport` is `{ width, height, pixelRatio }`.

**Options.** `createRenderer` accepts `{ maximumQuads }`, an integer from 1 to 16,384 (default 4,096). It bounds the number of rectangles and particles in one scene, and a scene over the budget makes `render()` throw `RangeError`. `onRenderError` receives an error thrown by a render the renderer scheduled itself, after a layer changed; without it, that error escapes to the frame callback. Use it to end a scene the device cannot draw and show a still instead.

**What a renderer draws.** Only content. Image, video and particle layers draw as textured rectangles, with the layer's opacity, transform, sublayer transform, hidden flag, replication and image mask applied. Backgrounds, borders, corner radii and shadows have no effect here. Use element layers for those.

The renderer refuses some settings on layers with image or video content, and `render()` throws `DOMException` `NotSupportedError` for them: a `contentsGravity` other than `"resize"`, a `contentsCenter` other than the whole content, and `clipsToBounds`. A mask must be a layer with image content and positive bounds. A closed `VFXFrame` draws nothing.

```ts
import type { AFXRenderer } from "@syndromatic/syncloudos/fx/animation";
import { GFXImage } from "@syndromatic/syncloudos/fx/graphics";

/** Puts a draggable sprite on a canvas renderer. */
export function addSprite(renderer: AFXRenderer, image: GFXImage) {
  const sprite = renderer.makeLayer();
  sprite.bounds = { x: 0, y: 0, width: image.width, height: image.height };
  sprite.position = { x: 100, y: 100 };
  sprite.contents = image;
  renderer.setPickable(sprite, true);

  return {
    sprite,
    pick: (x: number, y: number) => renderer.hitTest({ x, y }) === sprite,
    moveTo: (x: number, y: number) => {
      sprite.position = { x, y };
    },
  };
}
```

## Errors

| Situation | Error |
| --- | --- |
| A wrong type for an option or property | `TypeError` |
| A number outside its documented range, too many cells, particles or tiles, a tile image of the wrong size | `RangeError` |
| A scene over `maximumQuads`, a viewport that is not positive integers | `RangeError` |
| Renderer content settings it cannot draw | `DOMException` (`NotSupportedError`) |
| Projective replication on a surface without depth | `Error` |
| An animation key path other than `"opacity"` or `"transform"` in `playInstances` | `TypeError` |
| Using a disposed layer or renderer | `Error` |
| A parent that does not belong to the renderer | `TypeError` |
| A tile draw that fails | rejects `waitForIdle` with the failure |

## Related

- [AnimationFX](../animation.md)
- [Layers](layers.md)
- [GraphicsFX](../graphics.md), for `GFXImage`, `GFXColour` and `GFXPath`
- [ImageFX](../image.md), for the `IFXContext` and `IFXImage` a tile callback can return
- [VideoFX](../video.md), for `VFXFrame` content
