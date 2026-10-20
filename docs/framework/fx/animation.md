# AnimationFX

Retained layers also present `IFXShader` image generators, filter their content and sublayer tree, and composite with normal or additive blending. See [image shaders in retained layers](image/shaders.md) for pass order, straight-alpha output, bounds, budgets and adapter support.

AnimationFX (`AFX`) is the web-native analogue of Core Animation. It models visual content as a tree of layers, gives each layer geometry and appearance properties, and animates those properties over time with timing curves, keyframes and springs. Because it describes animation as data, every animation can be sampled at any moment, retargeted while it runs, paused, seeked, or played on a compositor thread when the browser allows.

Two ideas shape the whole framework.

- **A layer has a model and a presentation.** The model holds the value you set, and the presentation holds the value on screen right now. Set `layer.opacity = 0` and the model changes at once, while the presentation fades over the animation's duration. Hit testing, reading and retargeting can use either. This is the same split Core Animation makes, and it is what lets an interrupted animation continue from where the eye last saw it.
- **Animations are pure values.** `AFXBasicAnimation`, `AFXKeyframeAnimation` and `AFXSpringAnimation` describe what changes and how long it takes. `sample(seconds)` returns the value at a time, with no clock and no side effects, so the same animation runs in a layer, in a group, on the compositor, in a test and in a preview scrubber.

The framework has three groups of parts.

| Part | Where |
| --- | --- |
| Animation values: timing, basic, keyframe and spring animations, groups, transactions and the animation handle | This page |
| Layers: `AFXLayer`, its appearance and geometry, `AFXTransform3D` and the shape, gradient and text layers | [Layers](animation/layers.md) |
| Effects and rendering: replication, particles, tiled content and the canvas renderer | [Effects and rendering](animation/effects.md) |

```ts
import { AFXBasicAnimation, AFXAnimation } from "@syndromatic/syncloudos/fx/animation";
```

## At a glance

| | |
| --- | --- |
| Prefix | `AFX` |
| Entry | `@syndromatic/syncloudos/fx/animation` |
| Hook | `useAnimations`, from `@syndromatic/syncloudos/sdk` |
| Permissions | None |
| Analogue | Core Animation (`CALayer`, `CAAnimation`, `CABasicAnimation`, `CAKeyframeAnimation`, `CASpringAnimation`, `CAAnimationGroup`, `CATransaction`, `CAMediaTimingFunction`, `CATransform3D`, `CAShapeLayer`, `CAGradientLayer`, `CATextLayer`, `CAReplicatorLayer`, `CAEmitterLayer`, `CATiledLayer`) |

## What the entry exports

| Area | Symbols |
| --- | --- |
| Animations | `AFXAnimation`, `AFXAnimationOptions`, `AFXBasicAnimation`, `AFXKeyframeAnimation`, `AFXSpringAnimation`, `AFXAnimationGroup`, `AFXSampledAnimation`, `AFXAnimationExecutor` |
| Timing | `AFXTimingFunction`, `AFXAnimationTiming`, `AFXAnimationFill`, `AFXReducedMotionPolicy` |
| Values and results | `AFXAnimationKeyPath`, `AFXAnimationScalar`, `AFXPropertyAnimation`, `AFXAnimationDefinition`, `AFXAnimationHandle`, `AFXAnimationSettlement`, `AFXAnimationSettlementState` |
| Transactions and actions | `AFXTransaction`, `AFXAnimatableTarget`, `AFXTransactionOptions`, `AFXTransactionActionContext`, `AFXLayerAction`, `AFXLayerActionKey`, `AFXLayerActionMap`, `normaliseAFXLayerAction`, `normaliseAFXLayerActions` |
| Layers | `AFXLayer`, `AFXShapeLayer`, `AFXGradientLayer`, `AFXTextLayer`, `AFXReplicatorLayer`, `AFXEmitterLayer`, `AFXParticleLayer`, `AFXTiledLayer` and their supporting types |
| Geometry | `AFXTransform3D`, `AFXPoint3D`, `AFXSingularTransformError` |
| Rendering | `AFXRenderer`, `AFXRendererViewport` |

## The key paths

An animation targets one property of one target, named by an `AFXAnimationKeyPath`. The value type depends on the property.

| Key path | Value | Notes |
| --- | --- | --- |
| `"opacity"` | A number from 0 to 1 | A layer rejects an animation that ends outside the range. |
| `"frame"` | `{ x, y, width, height }` | The layer's frame in its superlayer. |
| `"transform"` | A CSS transform string | For example `"rotate(45deg)"` or the `AFXTransform3D.toCSS()` form. A layer parses both ends with `AFXTransform3D.fromCSS` and throws `TypeError` for a value that is not a string or does not parse. |
| `"sublayerTransform"` | A CSS transform string | Applied to the layer's children. Renderer-owned layers only. |
| `"backgroundColour"` | A CSS colour string | For example `layer.backgroundColour.toCSS()`. |
| `"boxShadow"` | A CSS `box-shadow` string | For view animations. |
| `"scrollPosition"` | `{ x, y }` | For scrolling views. |
| `"path"` | A `GFXPath` | Shape layers only. Both paths need the same number and kinds of commands. |
| `"gradient"` | A `GFXGradient` | Gradient layers only. Both gradients need the same number of stops, geometry kind and units. |
| `"filter"`, `"height"` | CSS strings | Element animation definitions only. Layers reject them. |

Which key paths an animation may use depends on the surface that plays it. A layer bound to a page element animates `"frame"`, `"opacity"`, `"transform"`, `"backgroundColour"`, `"boxShadow"` and `"scrollPosition"`, plus `"path"` on a shape layer and `"gradient"` on a gradient layer. A layer that a renderer owns animates `"frame"`, `"opacity"`, `"transform"` and `"sublayerTransform"`. `"filter"` and `"height"` appear only in the definitions that the client's `animate` method plays on page elements, and `AFXBasicAnimation` rejects them with `TypeError`. A layer rejects a key path its surface does not support with an `Error`.

`AFXAnimationScalar` is the union of the value types: a number, a string, a `GFXPath`, a `GFXGradient`, a point `{ x, y }`, a rectangle `{ x, y, width, height }`, or a record of at most eight numbers and short strings.

**How values interpolate.**

- Numbers interpolate linearly.
- Records with the same keys interpolate each numeric field, so rectangles and points animate smoothly.
- Strings that share a template, meaning the same text around the same number of numeric parts, interpolate each number. `"translate(0px, 0px)"` to `"translate(100px, 40px)"` glides. Strings with different templates switch at the end of the animation, so keep the two ends in the same shape. A transform written as `matrix3d(...)` and one written as `rotate(...)` do not share a template.
- Paths interpolate point by point. Gradients interpolate stop offsets, stop colours and geometry, with colours mixed in premultiplied sRGB so translucent stops never fringe.

## Timing

### `AFXAnimation`

The timing of an animation: how long it runs, when it starts, how often it repeats, how it eases and what it does outside its active interval. It carries no property and no values, so one `AFXAnimation` can time several animations.

```text
new AFXAnimation({ duration, delay?, iterations?, speed?, repeatDuration?, autoreverses?, fill?, timing?, reducedMotion? })
```

| Option | Range | Default | Meaning |
| --- | --- | --- | --- |
| `duration` | 0 to 600 seconds | required | The length of one cycle at normal speed. |
| `delay` | 0 to 60 seconds | 0 | Time before the first cycle starts. |
| `iterations` | 0.00001 to 1,000 | 1 | How many cycles play. Fractions are allowed, so `1.5` plays a cycle and a half. |
| `speed` | 0.001 to 1,000 | 1 | Scales time. A speed of 2 halves the cycle. The scaled cycle cannot exceed 600 seconds. |
| `repeatDuration` | 0.00001 to 600,000 seconds | none | Repeats for a total time instead of a number of cycles. Cannot be combined with `iterations`, and needs a non-zero duration. |
| `autoreverses` | boolean | `false` | Plays each cycle forward and then backward. |
| `fill` | `"none"`, `"forwards"`, `"backwards"`, `"both"` | `"forwards"` | What the property shows before the start (`"backwards"` and `"both"` hold the first value) and after the end (`"forwards"` and `"both"` hold the last value). With `"none"`, the animation contributes nothing outside its active interval. |
| `timing` | see below | `"ease"` | The easing curve. |
| `reducedMotion` | `"system"`, `"always"`, `"never"` | `"system"` | How a host that plays the animation treats the user's reduced motion setting. `"system"` follows it, `"always"` reduces regardless, and `"never"` plays in full. |

The constructor throws `RangeError` for a value outside its range and `TypeError` for an unknown option.

| Member | Description |
| --- | --- |
| `duration`, `delay`, `iterations`, `speed`, `autoreverses`, `fill`, `timing`, `reducedMotion` | The validated options. |
| `cycleDuration` | `duration / speed`, the time one cycle takes. |
| `totalDuration` | `delay + cycleDuration * iterations`, doubled for the cycles when `autoreverses` is on. |
| `progressAt(seconds)` | The eased progress from 0 to 1 at a time, or `null` when the animation contributes no value then (before the delay with no backwards fill, or after the end with no forwards fill). |
| `definition()` | A plain object of the timing values, for handing to a host. |

### `AFXTimingFunction` and timing values

`AFXAnimationTiming` is one of:

| Value | Curve |
| --- | --- |
| `"linear"` | Constant speed. |
| `"ease"` | The default curve: starts gently, speeds up and ends gently. Cubic Bézier `(0.25, 0.1, 0.25, 1)`. |
| `"ease-in"` | Starts slowly. `(0.42, 0, 1, 1)`. |
| `"ease-out"` | Ends slowly. `(0, 0, 0.58, 1)`. |
| `"ease-in-out"` | Slow at both ends. `(0.42, 0, 0.58, 1)`. |
| `{ kind: "cubic-bezier", x1, y1, x2, y2 }` | A custom curve. `x1` and `x2` are from 0 to 1, and `y1` and `y2` may go beyond that range, which makes the value overshoot. |
| `{ kind: "spring", stiffness, damping, mass }` | The step response of a damped spring. Stiffness and damping are from 0.01 to 10,000 and mass from 0.01 to 100. |

`AFXTimingFunction` evaluates a timing value.

```text
new AFXTimingFunction(value?: AFXAnimationTiming)   // default "ease"
timing.sample(progress, duration?): number
```

`value` returns the validated timing. `sample` maps a progress from 0 to 1 to an eased value. Progress outside the range clamps. A spring needs the animation's `duration` (in seconds, default 1) to convert progress to time. Bézier curves can return values below 0 or above 1.

```ts
import { AFXAnimation, AFXTimingFunction } from "@syndromatic/syncloudos/fx/animation";

const overshoot = new AFXTimingFunction({ kind: "cubic-bezier", x1: 0.3, y1: 1.6, x2: 0.5, y2: 1 });
export const curve = [0, 0.25, 0.5, 0.75, 1].map((progress) => overshoot.sample(progress)); // rises above 1, then settles

const timing = new AFXAnimation({ duration: 1, delay: 0.5, iterations: 2, autoreverses: true, fill: "both" });
export const total = timing.totalDuration; // 0.5 + 1 * 2 * 2 = 4.5 seconds
export const beforeStart = timing.progressAt(0.25); // 0, held by the backwards fill
```

## Animations

Every animation takes a `targetId` (a name of 1 to 512 characters that identifies what it animates, used to group and look up animations), a `keyPath`, values, and an `AFXAnimation` for timing. All three classes share these members:

| Member | Description |
| --- | --- |
| `targetId`, `keyPath` | The target and property. |
| `animation` | The `AFXAnimation` that times it. A spring builds its own. |
| `sample(seconds)` | The value at a time, or `null` when the animation contributes nothing then. Exactly the first value at progress 0 and exactly the last value at progress 1. |
| `toRuntime()` | The animation as an `AFXAnimationDefinition`, the plain data a host plays. |
| `retarget(from)` | A copy that starts from a new value and ends at the same place. Use it to redirect an animation from its current presentation value without a jump. |

### `AFXBasicAnimation`

A property moving from one value to another.

```text
new AFXBasicAnimation({ targetId, keyPath, from, to, animation })
```

For `"path"` and `"gradient"` animations, the constructor checks that the two ends can interpolate and throws `TypeError` if they cannot. Extra fields are rejected.

### `AFXKeyframeAnimation`

A property passing through a list of values.

```text
new AFXKeyframeAnimation({ targetId, keyPath, values, keyTimes?, timingFunctions?, animation })
```

| Field | Description |
| --- | --- |
| `values` | 2 to 1,000 values. |
| `keyTimes` | One time from 0 to 1 for each value. They start at 0, end at 1 and strictly increase. Default: evenly spaced. |
| `timingFunctions` | One timing value for each gap between values. Default: `"linear"` for each. |

The `animation`'s own `timing` applies to the whole animation first, and each segment then eases by its own function. `toRuntime()` samples the animation at 121 evenly spaced offsets (every 1/120 of the cycle) plus your key times, and sets the definition's timing to `"linear"`, so a host that only understands linear keyframes plays the same motion.

### `AFXSpringAnimation`

A property that moves as a damped spring settles toward its end value.

```text
new AFXSpringAnimation({ targetId, keyPath, from, to, mass?, stiffness?, damping?, initialVelocity?, options? })
```

| Field | Range | Default | Meaning |
| --- | --- | --- | --- |
| `mass` | 0.01 to 100 | 1 | Heavier springs respond more slowly. |
| `stiffness` | 0.01 to 10,000 | 100 | How hard the spring pulls. |
| `damping` | 0.01 to 10,000 | 10 | Friction. Low damping oscillates, and high damping settles without overshoot. |
| `initialVelocity` | -10,000 to 10,000 | 0 | The starting velocity in progress units per second. Pass the velocity of a gesture so motion continues smoothly from a drag. |
| `options` | `Partial<AFXAnimationOptions>` | none | Timing options such as `delay`, `fill` and `reducedMotion`. |

The spring computes `settlingDuration`, the time it takes to come to rest, from these values, and uses it as the duration unless `options.duration` is set. It also exposes `mass`, `stiffness`, `damping`, `initialVelocity` and the `animation` it built (with linear easing, because the spring is the easing). Springs can overshoot, so an opacity spring clamps to the valid range when it plays.

```ts
import { AFXBasicAnimation, AFXAnimation, AFXKeyframeAnimation, AFXSpringAnimation } from "@syndromatic/syncloudos/fx/animation";

const fade = new AFXBasicAnimation({
  targetId: "card",
  keyPath: "opacity",
  from: 0,
  to: 1,
  animation: new AFXAnimation({ duration: 0.3, timing: "ease-out" }),
});
export const halfway = fade.sample(0.15); // a number between 0 and 1

const pulse = new AFXKeyframeAnimation({
  targetId: "card",
  keyPath: "opacity",
  values: [1, 0.4, 1],
  keyTimes: [0, 0.3, 1],
  timingFunctions: ["ease-in", "ease-out"],
  animation: new AFXAnimation({ duration: 0.8, iterations: 2 }),
});
export const atPeak = pulse.sample(0.24);

const drop = new AFXSpringAnimation({
  targetId: "card",
  keyPath: "frame",
  from: { x: 0, y: -80, width: 200, height: 120 },
  to: { x: 0, y: 0, width: 200, height: 120 },
  stiffness: 220,
  damping: 14,
});
export const settles = drop.settlingDuration; // seconds until the motion is imperceptible
export const redirected = drop.retarget({ x: 0, y: -30, width: 200, height: 120 }); // continue from the visible position
```

## Groups and handles

### `AFXAnimationGroup`

Plays several animations as one. It suits a move-and-fade or several layers that should start together.

```text
new AFXAnimationGroup(animations: readonly AFXSampledAnimation[])
```

A group holds 1 to 64 children. A child is any object that has `targetId`, `keyPath`, `animation.totalDuration`, `sample`, `toRuntime` and optionally `retarget`, which all three animation classes do. `AFXSampledAnimation` is that shape.

| Member | Description |
| --- | --- |
| `animations` | The children. |
| `duration` | The longest child's total duration. |
| `sample(seconds)` | A record from `"<targetId>:<keyPath>"` to each child's value at that time. Children that share a target and key path share an entry, and the last one wins. |
| `play(target, execute)` | Starts every child by calling `execute(target, definition)`, an `AFXAnimationExecutor`, and returns one combined handle. If starting any child throws, the ones already started are cancelled. |

The combined handle finishes when every child has, reports the first non-completed state, and forwards `cancel`, `pause`, `resume` and `seek` to all of them. Its `progress` is the average.

### `AFXAnimationHandle` and settlement

A handle controls one running animation.

| Member | Description |
| --- | --- |
| `id` | A unique identifier. |
| `state` | `"running"`, `"paused"`, `"completed"`, `"cancelled"`, `"interrupted"` or `"failed"`. |
| `progress` | From 0 to 1. |
| `finished` | A promise that resolves once with an `AFXAnimationSettlement`. It never rejects. |
| `cancel(reason?)` | Stops the animation and leaves the property at its current presentation value. |
| `pause()`, `resume()` | Freeze and continue. |
| `seek(seconds)` | Jumps to a time between 0 and the animation's duration. Throws `RangeError` outside it. |

`AFXAnimationSettlement` holds `state` (`"completed"`, `"cancelled"`, `"interrupted"` or `"failed"`), `reduced` (true when reduced motion or a suspended page made the animation finish at once), and an optional `reason`. An animation is `"interrupted"` when another animation on the same property replaces it.

`AFXPropertyAnimation` (`targetId`, `keyPath`, `from`, `to`, optional `keyframes`) and `AFXAnimationDefinition` (a list of property animations with `duration`, `delay`, `iterations`, `autoreverses`, `fill`, `timing`, `reducedMotion`) are the data a host plays.

## Transactions

A transaction groups property changes so they share a duration and timing, and lets you observe when they finish. AnimationFX has two forms, because two kinds of target need them.

### Layer transactions

Static methods on `AFXTransaction`, in the manner of `CATransaction`. They work with layers.

| Method | Description |
| --- | --- |
| `AFXTransaction.begin()` | Opens a transaction. Transactions nest and inherit from their parent. |
| `AFXTransaction.commit()` | Closes it. The outermost commit publishes every layer change and starts every animation together. |
| `AFXTransaction.flush()` | Publishes pending changes now, inside an open transaction. |
| `AFXTransaction.setAnimationDuration(seconds)` | Sets the duration for implicit animations in this transaction. Non-negative. Default 0.25. |
| `AFXTransaction.animationDuration()` | Reads it. |
| `AFXTransaction.setDisableActions(disable)` | When true, property changes apply immediately with no animation, and running animations on changed properties are interrupted. |
| `AFXTransaction.disableActions()` | Reads it. |
| `AFXTransaction.setCompletionBlock(callback)` | Calls back after the animations started in the transaction have all settled. |

**Implicit animation.** Changing a layer property animates when the layer has an *action* for that property, whether or not a transaction is open. Outside a transaction the action supplies the duration, delay and timing. Inside one, the transaction supplies them. Inside a transaction the animations wait for the outermost `commit()`, so a group of changes starts together. An action is a small animation description: `AFXLayerAction` is `{ duration, delay?, timing?, reducedMotion? }`. Give a layer actions with its `actions` map (keys `AFXLayerActionKey`: `"frame"`, `"transform"`, `"sublayerTransform"`, `"opacity"`, `"backgroundColour"`, `"boxShadow"` and `"scrollPosition"`), or answer `actionForKey` from its delegate. A `null` action turns animation off for that key. A transaction's duration, delay and timing take precedence over the action's, and `reducedMotion` comes from the action.

Every static method other than `begin` throws `Error` when no transaction is open. A completion block registered in a nested transaction runs after the outermost commit, together with the blocks of its parents, once every animation started inside has settled. An error thrown from the block is swallowed. `AFXLayerActionMap` is the map type, and `normaliseAFXLayerAction` and `normaliseAFXLayerActions` validate them.

`AFXTransactionActionContext` (`disableActions`, `duration`, `delay`, `timing`) is the state layers read from the current transaction.

```ts
import { AFXTransaction, type AFXLayer } from "@syndromatic/syncloudos/fx/animation";

export function dim(layer: AFXLayer): Promise<void> {
  layer.actions = { opacity: { duration: 0.25, timing: "ease-in-out" } };

  return new Promise((resolve) => {
    AFXTransaction.begin();
    AFXTransaction.setAnimationDuration(0.4);
    AFXTransaction.setCompletionBlock(resolve); // runs once the fade has settled
    layer.opacity = 0.35; // animates over 0.4 s, from the current presentation value
    AFXTransaction.commit();
  });
}
```

### Element transactions

For animating page elements (views) through a host executor, an instance of `AFXTransaction` records writes and plays them as one animation.

```text
new AFXTransaction(execute: AFXAnimationExecutor, release?: () => void)
transaction.run(options, changes): AFXAnimationHandle
transaction.animator(target): { opacity, frame, transform, backgroundColour, boxShadow, scrollPosition }
transaction.dispose()
```

Inside `run`'s `changes` callback, call `animator(target)` with an `AFXAnimatableTarget` (`id`, `target`, the current `frame` and `opacity`, and optional current `transform`, `backgroundColour`, `boxShadow` and `scrollPosition`) and assign to the returned object's properties. Each assignment records a from-and-to pair, and when `changes` returns, `run` plays them all through the executor as one animation and returns its handle. One transaction targets one surface: `animator` called with a target from a different surface throws `Error`, and so does calling `animator` or assigning to its properties once `run` has returned.

`AFXTransactionOptions`: `duration` (default 0.25), `timing` (default `"ease"`), `delay`, `disableActions` (plays instantly) and `completion` (called with the settlement). Nested `run` calls inherit their parent's options. A `run` that records no changes returns an already completed handle.

## In a SynWare

`useAnimations()` returns the session's animation client. The session owns every layer and renderer it hands out and releases them when the application closes, and you can dispose of any earlier.

| Method | Returns | Description |
| --- | --- | --- |
| `bindLayer(element, signal?, options?)` | `AFXLayer` | Binds a layer to a page element. Each element takes one binding. The layer owns frame geometry by default; `{ layout: "css" }` instead measures the element's CSS size without replacing its position or dimensions. Native `view.layer` selects CSS layout automatically. Disposing restores the original inline style. |
| `bindShapeLayer(element, signal?)` | `AFXShapeLayer` | A layer that draws a `GFXPath`. |
| `bindGradientLayer(element, signal?)` | `AFXGradientLayer` | A layer that draws a `GFXGradient`. |
| `bindTextLayer(element, signal?)` | `AFXTextLayer` | A layer that draws a shaped line of text. |
| `bindReplicatorLayer(element, signal?)` | `AFXReplicatorLayer` | A layer that repeats its sublayers. |
| `bindEmitterLayer(element, signal?)` | `AFXEmitterLayer` | A particle emitter. |
| `bindTiledLayer(element, signal?)` | `AFXTiledLayer` | A layer that draws large content in tiles. |
| `createRenderer(canvas, options?, signal?)` | `AFXRenderer` | A renderer that draws a layer tree to a canvas. `options.maximumQuads` limits the scene. See [Effects and rendering](animation/effects.md). |
| `acquireOwner(viewId)` | An owner handle | Registers a view as the owner of element animations. |
| `animate(element, definition, owner)` | An animation handle | Plays an `AFXAnimationDefinition` on a page element. |

```tsx
import { useEffect, useRef } from "react";
import { AFXAnimation, AFXBasicAnimation, AFXTransform3D } from "@syndromatic/syncloudos/fx/animation";
import { useAnimations } from "@syndromatic/syncloudos/sdk";

export function SlideIn({ children }: { children: React.ReactNode }) {
  const animations = useAnimations();
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = element.current;
    if (!host) return;
    const layer = animations.bindLayer(host);
    layer.opacity = 0; // no action yet, so this applies at once
    layer.addAnimation(
      new AFXBasicAnimation({
        targetId: "slide",
        keyPath: "transform",
        from: AFXTransform3D.translation(0, 24).toCSS(),
        to: AFXTransform3D.translation(0, 0).toCSS(),
        animation: new AFXAnimation({ duration: 0.35, timing: "ease-out" }),
      }),
    );
    layer.actions = { opacity: { duration: 0.35 } };
    layer.opacity = 1;
    return () => layer.dispose();
  }, [animations]);

  return <div ref={element}>{children}</div>;
}
```

**Ownership.** A bound layer owns its element's children. Sublayers attach as child elements, and layer content draws into an element the layer manages. Adding your own child nodes or a CSS background image to a bound element leaves the layer's `compositionCapability` at `"unsupported"` (reason `"unmanaged-dom"` or `"unmanaged-dom-background-image"`), and `render()` refuses such a layer. Bind leaf elements, or elements whose children are all layers. Disposing a layer restores the element's original `style` attribute.

**Compositor playback.** Where the browser allows, an `AFXBasicAnimation` on `"opacity"` or `"transform"` runs through `Element.animate()`, so it progresses on the compositor even when JavaScript is busy. The layer keeps its model and presentation values, retargeting, cancellation and completion. The animation qualifies with one iteration, a speed of 1, no autoreverse, the default `"forwards"` fill and a named or cubic-Bézier timing, and only while no frame animation is running on the layer. Keyframe animations, springs, spring timing and every other key path use frame sampling.

**Reduced motion and suspension.** When the host reports reduced motion, or the page is suspended, a layer animation completes at once in its final state and the settlement's `reduced` flag is true. A zero duration also completes at once. The `reducedMotion` policy on `AFXAnimation` applies to element animations started with `animate`. Content that carries meaning through motion should also present that meaning statically.

**Limits and errors.** One session holds at most 64 live layers and renderers at a time, and releases a slot when you dispose one. `bind*` throws `TypeError` for a target that is not an element of the app's own document, and `createRenderer` throws `TypeError` unless the target is a canvas of that document. Binding an element or canvas that already has a live binding throws `DOMException` `InvalidStateError`. A host without animation layer support throws `DOMException` `NotSupportedError`. Every method takes an optional `AbortSignal` that disposes the layer when it aborts.

## Errors

| Situation | Error |
| --- | --- |
| An option or value outside its range, key times that are not strictly increasing | `RangeError` |
| A wrong type, an unknown option, a path or gradient pair that cannot interpolate | `TypeError` |
| An animation on a property the surface does not support | `Error` |
| A static `AFXTransaction` method other than `begin` with no transaction open | `Error` |
| A negative or non-finite transaction duration | `RangeError` |
| Binding an element that is already bound, or a session over its layer limit | `DOMException` (`InvalidStateError`, `QuotaExceededError`) |
| Retargeting an animation that has no `retarget` method | `TypeError` |
| A transform that cannot be inverted | `AFXSingularTransformError` (a `RangeError`) |
| Using a disposed layer or transaction, or assigning outside `run` | `Error` |
| Seeking outside an animation | `RangeError` |

## Related

- [FX overview](README.md)
- [Layers](animation/layers.md)
- [Effects and rendering](animation/effects.md)
- [GraphicsFX](graphics.md), for the paths, colours and gradients that animations carry
- [MediaFX](media.md), for timebases that can drive animation from a media clock
