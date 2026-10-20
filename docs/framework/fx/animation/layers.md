# AnimationFX layers

This page covers the layer tree of AnimationFX: `AFXLayer` and its geometry, appearance and contents, the delegate, `AFXTransform3D`, and the three layers that draw their own content, `AFXShapeLayer`, `AFXGradientLayer` and `AFXTextLayer`. The animation values that drive layers are on the [AnimationFX page](../animation.md). Replication, particles, tiles and the renderer are on [Effects and rendering](effects.md).

```ts
import { AFXLayer, AFXShapeLayer, AFXTransform3D } from "@syndromatic/syncloudos/fx/animation";
```

## At a glance

| | |
| --- | --- |
| Analogue | `CALayer`, `CAShapeLayer`, `CAGradientLayer`, `CATextLayer`, `CATransform3D`, `CALayerDelegate` |
| Obtained from | `NSEViewController.view.layer`, `new AFXLayer()` added to an attached layer, or the session's `bind*` methods |
| Model and presentation | `layer.model` holds what you set, `layer.presentation` holds what is on screen now |
| Limits | 256 layers in one composition, 64 live layers and renderers per session |

Native view controllers start from `view.layer` and add layers constructed with `new AFXLayer()` or its subclasses. `bindLayer(element)` explicitly binds an `AFXLayer` to a page element, and `createRenderer(canvas)` returns a renderer whose `makeLayer()`, `makeReplicatorLayer()` and `makeParticleLayer()` create layers that draw to a canvas. These return the same layer classes, so the layer API on this page applies to each. The surfaces differ in what they can show:

| | Bound to an element | Owned by a renderer |
| --- | --- | --- |
| Content kinds | image, shape, gradient, text, emitter, tiled | video, image, emitter |
| Animatable key paths | `frame`, `opacity`, `transform`, `backgroundColour`, `boxShadow`, `scrollPosition`, plus `path` and `gradient` on shape and gradient layers | `frame`, `opacity`, `transform`, `sublayerTransform` |
| Layer classes | every class | `AFXLayer`, `AFXReplicatorLayer`, `AFXParticleLayer` |
| Draws through | the element's CSS and inline SVG | a canvas (WebGL 2, with a 2D canvas fallback) |

Bind shape, gradient, text and tiled layers to elements. Use a renderer for large sets of moving sprites, video and particles.

## The layer model

A layer is a rectangle with a position, an anchor and a transform, in the coordinate space of its *superlayer*. It draws a background, a border and a shadow, then its *contents*, and then its *sublayers* in order.

| Property | Meaning |
| --- | --- |
| `bounds` | The layer's own rectangle, in its own coordinates. Its `x` and `y` set the origin that sublayers measure from, and its size is the layer's size. |
| `position` | Where the anchor point sits in the superlayer's coordinates. |
| `anchorPoint` | The anchor as a fraction of the bounds, from 0 to 1 on each axis. The default `(0.5, 0.5)` is the centre. Transforms rotate and scale around it. |
| `frame` | The rectangle the layer covers in its superlayer. It derives from `position`, `anchorPoint` and the size, so `frame.x = position.x - anchorPoint.x * width`. Setting it moves and resizes the layer together. |
| `transform` | An `AFXTransform3D` applied around the anchor point. |
| `sublayerTransform` | An `AFXTransform3D` applied to every sublayer, around the layer's origin. Useful for perspective. |
| `zPosition`, `anchorPointZ` | Depth, from -1e9 to 1e9. Sublayers sort by `zPosition` for hit testing. |

**Model and presentation.** Setting a property changes the *model*. When an animation is running, the layer shows a different value, the *presentation*, and the two meet when the animation finishes. `layer.model` and `layer.presentation` return frozen snapshots of each: geometry, appearance, content and a `values` record of the animated properties. Read `presentation` when you need what the eye sees, for example to retarget a gesture from the visible position, and `model` for the value the layer is heading to.

The property getters (`layer.transform`, `layer.frame` and the rest) return the last value you assigned. An animation you start with `addAnimation` does not write its end value back to them, apart from `opacity`. Its end value shows up in `model.values` and in the `model` and `presentation` snapshots, so read those after an explicit animation. Assigning a property, which is what an implicit action animates, updates both at once.

## AFXLayer

```ts
const layer = new AFXLayer();
view.layer.addSublayer(layer);
```

`new AFXLayer()` creates a detached layer. Adding it below an attached layer adopts that parent's
surface and scheduler; layers added beneath a detached parent stay detached until that parent is
attached. Writes made before attachment are applied when the layer joins the tree. Applications
usually start from `NSEViewController.view.layer`. Hosts that provide a surface and scheduler create
a root with `createAFXLayer(surface, scheduler)` from `sdk/animation-host`.

The native view's backing layer keeps the managed outlet's CSS position and dimensions. Its bounds
follow the outlet's layout and resize automatically, including sublayer autoresizing masks; opacity
and transforms still run through AnimationFX. Size the outlet with `NSEViewControllerView`'s
`className`, rather than assigning a frame to the backing layer. Unmounting the view disposes its
backing layer, sublayers and resize observation. Explicit `bindLayer(element)` retains layer-owned
frame geometry by default.

### Geometry

| Member | Type | Description |
| --- | --- | --- |
| `bounds` | `GFXRect` | Default `(0, 0, 0, 0)`. Width and height must be finite and not negative. Changing the size resizes sublayers that have an `autoresizingMask`. |
| `frame` | `GFXRect` | Implicitly animatable through the `"frame"` action. |
| `position` | `GFXPoint` | Default `(0, 0)`. Both values must be finite. |
| `anchorPoint` | `GFXPoint` | Default `(0.5, 0.5)`. Each value from 0 to 1, else `RangeError`. |
| `zPosition`, `anchorPointZ` | `number` | Default 0. Finite, within plus or minus 1e9. |
| `transform` | `AFXTransform3D` | Default identity. Implicitly animatable through `"transform"`. |
| `sublayerTransform` | `AFXTransform3D` | Default identity. Implicitly animatable through `"sublayerTransform"` on renderer-owned layers. |
| `clipsToBounds` | `boolean` | Default `false`. Clips sublayers and content to the bounds. |
| `hidden` | `boolean` | Hides the layer and its sublayers. Hidden layers are skipped by hit testing. |
| `doubleSided` | `boolean` | Default `true`. When false, the layer disappears while its back faces the viewer after a 3D rotation. |
| `autoresizingMask` | `AFXAutoresizingMask[]` | Default empty. See below. |

Assigning a value of the wrong type throws `TypeError`, and a value outside its range throws `RangeError`.

**Autoresizing.** When a layer's size changes, each sublayer with an `autoresizingMask` adjusts. `AFXAutoresizingMask` values are `"min-x-margin"`, `"width"`, `"max-x-margin"`, `"min-y-margin"`, `"height"` and `"max-y-margin"`. Each axis takes the change in the superlayer's size and divides it evenly among the flexible parts you list on that axis, so `["width", "height"]` fills a resizing parent and `["min-x-margin", "min-y-margin"]` pins a sublayer to the bottom right corner. The array has at most six entries and no duplicates.

### Appearance

| Member | Type | Default | Description |
| --- | --- | --- | --- |
| `backgroundColour` | `GFXColour \| null` | `null` | Fills the bounds. Implicitly animatable through `"backgroundColour"`. |
| `borderColour` | `GFXColour \| null` | `null` | Border colour. |
| `borderWidth` | `number` | 0 | Finite, at least 0. |
| `cornerRadius` | `number` | 0 | Finite, at least 0. |
| `maskedCorners` | `AFXLayerCorner[]` | all four | The corners that round: `"top-left"`, `"top-right"`, `"bottom-left"`, `"bottom-right"`, without duplicates. |
| `shadowColour` | `GFXColour \| null` | `null` | Shadow colour. |
| `shadowOpacity` | `number` | 0 | From 0 to 1. A shadow shows only above 0. |
| `shadowRadius` | `number` | 3 | Blur radius, at least 0. |
| `shadowOffset` | `GFXPoint` | `(0, -3)` | Offset in layer coordinates. |
| `allowsEdgeAntialiasing` | `boolean` | `false` | Antialiases the layer's edges when it is transformed. |
| `edgeAntialiasingMask` | `number` | 15 | Which edges antialias, a combination of the `AFXEdgeAntialiasingMask` flags. An integer from 0 to 15. |

`AFXEdgeAntialiasingMask` is a frozen object of the four flags: `layerLeftEdge` (1), `layerRightEdge` (2), `layerBottomEdge` (4) and `layerTopEdge` (8). Combine them with `|`. Every colour must be a `GFXColour` or `null` (see [GraphicsFX](../graphics.md)), and anything else throws `TypeError`.

`AFXLayerStyle` is the read-only record of these appearance values that `model.style` and `presentation.style` carry.

### Contents

| Member | Type | Default | Description |
| --- | --- | --- | --- |
| `contents` | `GFXImage \| VFXFrame \| null` | `null` | An image, or a decoded video frame, that fills the layer. Reading it returns the value you set, and `null` when the layer draws other content (a shape, gradient, text or particles). A closed `VFXFrame` throws `DOMException` `InvalidStateError`. |
| `contentsGravity` | `AFXContentsGravity` | `"resize"` | How the content fits: `"resize"`, `"resize-aspect"`, `"resize-aspect-fill"`, `"center"`, `"top"`, `"bottom"`, `"left"`, `"right"`, `"top-left"`, `"top-right"`, `"bottom-left"` or `"bottom-right"`. |
| `contentsRect` | `GFXRect` | `(0, 0, 1, 1)` | The part of the content to show, as fractions of it. Width and height must be positive and no value may exceed 8 in magnitude. |
| `contentsCenter` | `GFXRect` | `(0, 0, 1, 1)` | The stretchable centre of the content, as fractions. It must lie inside the unit square with positive size. Set a smaller rectangle to stretch only the middle of an image, as a nine-part image. |

A layer accepts content only if its surface supports the kind (see the table above). A video frame therefore works on renderer-owned layers and is rejected on element-bound ones, and assigning content the surface cannot show throws `Error`.

### Sublayers and masks

| Member | Description |
| --- | --- |
| `sublayers` | The children, a frozen array in back-to-front order. |
| `superlayer` | The parent, or `null`. |
| `addSublayer(child, options?)` | Appends a child. A child with a different parent moves. |
| `insertSublayer(child, index, options?)` | Inserts at an index from 0 to `sublayers.length`. Throws `RangeError` outside it. |
| `replaceSublayer(previous, next)` | Puts `next` where `previous` was and removes `previous`. |
| `removeFromSuperlayer()` | Detaches the layer. |
| `mask`, `setMask(mask)` | An independent layer whose alpha clips this layer. A mask has no parent and cannot also be a sublayer. `null` removes it. |

`options.preservePresentation` recomputes the child's geometry so it stays where it currently appears after moving to a new parent. A running frame or transform animation on the child is interrupted at its visible value, so you can retarget from the exact pose.

A tree cannot contain a cycle, so inserting a layer under its own descendant throws `Error`. A composition holds at most 256 layers, counting masks. The limits apply while walking the tree, and exceeding them throws `RangeError`.

### Animations

| Member | Description |
| --- | --- |
| `addAnimation(animation, key?)` | Starts an `AFXBasicAnimation`, `AFXKeyframeAnimation` or `AFXSpringAnimation` (or any `AFXSampledAnimation`) and returns its handle. The `key` defaults to the animation's key path, and a new animation under a key that is in use interrupts the old one. If an animation is already running on the same property, the new one retargets from the visible value. |
| `animationKeys()` | The keys of the running animations. |
| `animationForKey(key)` | The running animation's handle, or `null`. |
| `removeAnimation(key)`, `removeAllAnimations()` | Cancels animations, leaving the presentation where it was. |
| `actions`, `actionForKey(key)`, `delegate` | Implicit actions. See [AnimationFX](../animation.md#transactions). |

Animation rules, in one place:

- The key path must be one the surface supports, and `"path"` and `"gradient"` only work on `AFXShapeLayer` and `AFXGradientLayer`. Otherwise `addAnimation` throws `Error`.
- A `"transform"` or `"sublayerTransform"` animation must carry CSS transform strings that `AFXTransform3D.fromCSS` parses. `AFXTransform3D.toCSS()` produces a `matrix3d(...)` string, which interpolates component by component. That is fine for translations and scales, but a rotation between two matrices takes the straight path through matrix space. Animate rotations with `rotate(...)` strings so they sweep through the angle.
- An `"opacity"` animation must end between 0 and 1.
- A duration of zero, reduced motion or a suspended page completes the animation at once.

### Display and layout

| Member | Description |
| --- | --- |
| `setNeedsDisplay(rect?)`, `needsDisplay()`, `displayIfNeeded()`, `display()` | Mark the layer as needing to be projected, ask whether it does, and project it now. Property changes display automatically, so these matter mainly for delegates and tiled content. |
| `setNeedsLayout()`, `needsLayout()`, `layoutIfNeeded()`, `layoutSublayers()` | Schedule and run layout. `layoutSublayers` calls the delegate. Re-entering it from inside the delegate throws `Error`. |

Invalidation is coalesced into one pass on the next frame.

### Hit testing and conversion

| Member | Description |
| --- | --- |
| `contains(point)` | Whether a point, in the layer's own coordinates, lies inside `bounds`. |
| `hitTest(point)` | The deepest visible layer at a point given in the *superlayer's* coordinates, using model geometry. Sublayers are tried highest `zPosition` first, then latest first. Returns `null` when nothing is hit. |
| `presentationHitTest(point)` | The same test against the presentation, so it follows a layer that is mid animation. Layers with zero presentation opacity do not hit. |
| `convertPoint(point, to)` | Converts an `AFXPoint3D` from this layer's coordinates to another layer's, or to the root when `to` is `null`. Throws `AFXSingularTransformError` for a transform that cannot be inverted. |
| `convertRect(rect, to)` | The bounding rectangle of the converted corners. |

### Rendering to an image

`layer.render(bounds, scale?, signal?)` returns a `Promise<GFXImage>` of the layer subtree at its current presentation, so you can capture a layer to a bitmap. `scale` defaults to 1 and multiplies the pixel size. The capture refuses trees it cannot draw faithfully: layers on a surface with unmanaged content, dashed shape strokes, replication and layers with `doubleSided` off each make it reject with `TypeError`. `compositionCapability` reports `{ state: "portable-owned" }` when the layer's own surface can be captured and `{ state: "unsupported", reason }` otherwise. A capture holds at most 256 layers.

### Lifetime

`dispose()` releases the layer, its animations and its surface. A disposed layer throws `Error` from every method except `dispose` itself. An `AbortSignal` passed when binding disposes the layer when it aborts. Layers the session created are disposed for you when the application closes.

## AFXLayerDelegate

An object you assign to `layer.delegate` to observe and customise a layer. Every member is optional and receives the layer.

| Member | Called |
| --- | --- |
| `willDisplay(layer)` | Before the layer projects to its surface. |
| `didDisplay(layer)` | After it projects. |
| `layoutSublayers(layer)` | During `layoutSublayers`. Resize sublayers here. |
| `actionForKey(layer, key)` | When a property changes and the layer's own `actions` map has no entry for that key. Return an `AFXLayerAction` to animate it, `null` to disable animation for it, or `undefined` to defer to the default (no animation). |

Errors thrown by `willDisplay` and `didDisplay` are swallowed so a broken delegate cannot stop a layer from drawing.

## AFXTransform3D

An immutable 4 by 4 matrix, stored column-major in 16 numbers, following the affine convention of GraphicsFX. `multiply` applies `right` first and then the receiver, so `a.multiply(b)` transforms points as `a(b(p))`.

```text
new AFXTransform3D(values?: readonly number[])        // 16 finite numbers, default identity
```

| Member | Description |
| --- | --- |
| `values` | The 16 components, frozen. |
| `multiply(right)` | The product. |
| `inverse()` | The inverse. Throws `AFXSingularTransformError` (a `RangeError`) for a matrix that cannot be inverted. |
| `transformPoint(point)` | Applies the matrix to an `AFXPoint3D` and divides by the perspective term. Throws `RangeError` for non-finite input and `AFXSingularTransformError` when the point projects to infinity. |
| `toAffine()` | A `GFXAffineTransform`. Throws `RangeError` when the matrix has depth or perspective components. |
| `toCSS()` | A `matrix3d(...)` string. |

| Factory | Description |
| --- | --- |
| `AFXTransform3D.translation(x, y, z = 0)` | A translation. |
| `AFXTransform3D.scale(x, y = x, z = 1)` | A scale. |
| `AFXTransform3D.rotation(radians, x = 0, y = 0, z = 1)` | A rotation about an axis (default the z axis). Throws `RangeError` for a zero axis or a non-finite angle. |
| `AFXTransform3D.perspective(distance)` | A perspective projection, `distance` above 0. Set it on a parent's `sublayerTransform` for 3D depth. |
| `AFXTransform3D.fromAffine(value)` | From a `GFXAffineTransform`. |
| `AFXTransform3D.fromCSS(css, size?)` | Parses a CSS transform list: `none`, `matrix`, `matrix3d`, `translate`, `translate3d`, `translateX`, `translateY`, `translateZ`, `scale`, `scale3d`, `scaleX`, `scaleY`, `scaleZ`, `rotate`, `rotateX`, `rotateY`, `rotateZ`, `rotate3d` and `perspective`. Lengths take `px`, angles take `deg`, `rad` and `turn`, and a percentage in `translate` resolves against `size`. Anything else throws `TypeError`. |

`AFXPoint3D` is `{ x, y, z }`. `AFXSingularTransformError` extends `RangeError`.

## AFXShapeLayer

A layer that draws a `GFXPath`. Everything on `AFXLayer` applies, and the shape adds the properties below. Each change redraws the shape.

| Member | Type | Default | Description |
| --- | --- | --- | --- |
| `path` | `GFXPath \| null` | `null` | The outline, in layer coordinates. Animatable through the `"path"` key path when both paths have the same commands. |
| `fillColour` | `GFXColour \| null` | opaque black | The fill. `null` draws no fill. |
| `strokeColour` | `GFXColour \| null` | `null` | The stroke. `null` draws no stroke. |
| `fillRule` | `"nonzero" \| "evenodd"` | `"nonzero"` | How overlapping subpaths fill. |
| `lineWidth` | `number` | 1 | Stroke width, at least 0. |
| `lineCap` | `"butt" \| "round" \| "square"` | `"butt"` | The stroke's end caps. |
| `lineJoin` | `"miter" \| "round" \| "bevel"` | `"miter"` | The stroke's corners. |
| `miterLimit` | `number` | 10 | At least 1. |
| `lineDashPattern` | `number[]` | `[]` | Alternating dash and gap lengths, at most 64, each at least 0, with one above 0. |
| `lineDashPhase` | `number` | 0 | Where in the pattern the stroke begins. |
| `strokeStart`, `strokeEnd` | `number` | 0 and 1 | The part of the path to stroke, as fractions of its length. Values from 0 to 1. Animate `strokeEnd` from 0 to 1 to draw a line. |

Note that `strokeStart` and `strokeEnd` are static properties. To animate them, drive them from your own timeline, as they are not key paths.

## AFXGradientLayer

A layer that draws a `GFXGradient`. It offers the gradient directly, and the Core Animation style pieces for the common linear case.

| Member | Type | Description |
| --- | --- | --- |
| `gradient` | `GFXGradient \| null` | The paint. Any kind of `GFXGradient` (linear, radial and so on) and animatable through `"gradient"` when both gradients have the same number of stops, kind and units. |
| `colours` | `GFXColour[]` | The stop colours, 1 to 64. Setting them keeps the current stop offsets, so the count must match the current stops, and with no gradient yet it spaces the stops evenly along a horizontal linear gradient. |
| `locations` | `number[]` | The stop offsets, one per colour, from 0 to 1 and not decreasing. Throws `Error` with no gradient, and `RangeError` for a count that does not match. |
| `startPoint`, `endPoint` | `GFXPoint \| null` | The ends of a *linear* gradient, in the gradient's units. They read `null` for other kinds, and setting them without a linear gradient throws `TypeError`. |

## AFXTextLayer

A layer that draws one shaped line of text. Shaping and layout stay with [TextFX](../text.md): create a `TFXLine` and hand it to the layer.

| Member | Type | Default | Description |
| --- | --- | --- | --- |
| `line` | `TFXLine \| null` | `null` | The shaped line. Other values throw `TypeError`. |
| `baselineOrigin` | `GFXPoint` | `(0, 0)` | Where the baseline begins, in layer coordinates. |
| `foregroundColour` | `GFXColour` | black | The text colour. |
| `glyphOutlines` | `TFXGlyphOutline[]` | `[]` | The glyph paths the layer draws, derived from the line and origin. |

## Example

A card with rounded corners, a shadow and a progress ring that draws itself. The function takes layers a session already bound, so it runs in a component effect.

```ts
import {
  AFXAnimation,
  AFXBasicAnimation,
  AFXTransform3D,
  type AFXLayer,
  type AFXShapeLayer,
} from "@syndromatic/syncloudos/fx/animation";
import { GFXColour, GFXPath } from "@syndromatic/syncloudos/fx/graphics";

export function styleCard(card: AFXLayer, ring: AFXShapeLayer) {
  card.bounds = { x: 0, y: 0, width: 240, height: 160 };
  card.position = { x: 120, y: 80 };
  card.backgroundColour = GFXColour.rgba(1, 1, 1);
  card.cornerRadius = 16;
  card.shadowColour = GFXColour.rgba(0, 0, 0);
  card.shadowOpacity = 0.25;
  card.shadowRadius = 12;
  card.shadowOffset = { x: 0, y: 4 };

  ring.bounds = { x: 0, y: 0, width: 64, height: 64 };
  ring.position = { x: 120, y: 80 };
  ring.path = GFXPath.ellipse({ x: 4, y: 4, width: 56, height: 56 });
  ring.fillColour = null;
  ring.strokeColour = GFXColour.rgba(0.1, 0.5, 1);
  ring.lineWidth = 6;
  ring.lineCap = "round";
  ring.strokeEnd = 0.75;
  card.addSublayer(ring);

  // Tilt the card in perspective.
  card.sublayerTransform = AFXTransform3D.perspective(600);
  card.addAnimation(
    new AFXBasicAnimation({
      targetId: "card",
      keyPath: "transform",
      from: "rotateY(-25deg)",
      to: "rotateY(0deg)",
      animation: new AFXAnimation({ duration: 0.5, timing: "ease-out" }),
    }),
  );
}
```

## Errors

| Situation | Error |
| --- | --- |
| A value of the wrong type, an unknown option string, a colour that is not a `GFXColour` | `TypeError` |
| A number that is not finite or out of range, a `contentsRect` or `contentsCenter` outside its bounds, an anchor point outside 0 to 1 | `RangeError` |
| Using a disposed layer | `Error` |
| A composition cycle, a mask that is also a sublayer, a layer that is not a child in `replaceSublayer` | `Error` |
| A composition over 256 layers | `RangeError` |
| A closed `VFXFrame` as contents | `DOMException` (`InvalidStateError`) |
| Content the surface cannot show, a key path the surface does not support | `Error` |
| A matrix that cannot be inverted | `AFXSingularTransformError` |

## Related

- [AnimationFX](../animation.md)
- [Effects and rendering](effects.md)
- [GraphicsFX](../graphics.md), for `GFXColour`, `GFXPath`, `GFXGradient` and `GFXImage`
- [TextFX](../text.md), for `TFXLine`
- [VideoFX](../video.md), for `VFXFrame`
