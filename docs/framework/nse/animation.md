# Animation objects

This page covers the NSE objects that animate views: the animation context, view animators, presentation animators and view controller transitions. They all respect the user's reduced-motion setting for you.

## Animation context

`NSEAnimationContext` holds the settings that view changes animate with. `duration` is in seconds (0 to 600), `timingFunction` holds cubic Bézier control points, and `allowsImplicitAnimation` controls implicit layer actions. `runAnimationGroup(changes, completionHandler?)` applies those settings to the synchronous changes you make inside it. A nested group inherits the enclosing values, the enclosing context is restored even if your changes throw, and the completion handler runs once the group's view and layer animations have settled. The framework and the theme own the default durations and curves; there's no public export for them.

```ts
import { NSEAnimationContext } from "@syndromatic/syncloudos/nse";

NSEAnimationContext.runAnimationGroup(context => {
  context.duration = 0.22;
  controller.view.animator().alphaValue = 0.5;
}, () => { /* the change has settled */ });
```

## View animators

A view controller's `view.animator()`, or an HTML outlet's `animator()`, returns an animator for that view. Set `alphaValue` or `frame` on it, or call `setFrameOrigin` or `setFrameSize`. A frame change updates the final layout once and animates the backing layer from its old position and size. With reduced motion, geometry changes apply at once and opacity changes last at most 120 ms. For richer artwork, animate the view's or outlet's `AFXLayer` with AnimationFX; for canvas drawing, use `controller.fx.animation.manageRenderer(outlet)` and its managed frame callbacks.

## Reduced motion

View controllers read `traitCollection.reducedMotion` and hear about changes in `traitCollectionDidChange`. Function views read the same setting with `useNSETraitCollection().reducedMotion`. It reflects the system setting and is read-only: an application can't turn reduced motion on or off for part of its interface. To test the reduced path in a browser, use `page.emulateMedia({ reducedMotion: "reduce" })`.

## Presenting with an animator

`present(viewController, animator)` presents a view controller with your own animation. An `NSEViewControllerPresentationAnimator` implements `animatePresentation(of, from)` and `animateDismissal(of, from)`. Before calling either method, the framework mounts the presented view above the presenter, in the presenter's coordinate space. Either method can return a promise. On dismissal, the view and controller stay alive until that promise settles and are then disposed. Dismissing twice does nothing, a failed animation still completes the dismissal, and disposing the presenter releases everything it owns at once.

## Transitions between children

`transition(from, to, options, completionHandler?)` replaces one child view controller's view with another's in the same place. Both controllers must be live children of the controller you call it on, and the outgoing one stays a child so you can use it again. Render the first child's view once in the parent's view (`<first.view />`); each transition replaces whatever view is currently in that place.

The effects in `NSEViewController.TransitionOptions` (also exported as `NSEViewControllerTransitionOptions`) are `crossfade`, `slideUp`, `slideDown`, `slideLeft`, `slideRight`, `slideForward` and `slideBackward`. `slideForward` and `slideBackward` follow the writing direction. Pick one effect, optionally combined with `allowUserInteraction` using `|`; without it, the moving content ignores input during the transition. Reduced motion replaces the effect with a short crossfade. The completion handler runs once, and a transition that starts while another is running is refused.

The framework's internal presence, layout and presentation helpers drive the system's own animations. They aren't a model for structuring your application.
