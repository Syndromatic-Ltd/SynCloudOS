# Animation objects

`NSEAnimationContext` follows `NSAnimationContext`: `duration` is in seconds, `timingFunction` contains cubic Bézier control points, and `allowsImplicitAnimation` controls implicit layer actions. `runAnimationGroup(changes, completionHandler?)` scopes synchronous changes, inherits enclosing values, restores the enclosing context even after an exception, and completes when the group's view and layer animations settle. Atmo supplies additional curves through `atmoMotion`.

```ts
NSEAnimationContext.runAnimationGroup(context => {
  context.duration = 0.22;
  controller.view.animator().alphaValue = 0.5;
}, () => { /* presentation has settled */ });
```

A controller's `view.animator()` and an HTML outlet's `animator()` return the `NSView` animator proxy. Assign `alphaValue` or `frame`, or call `setFrameOrigin` / `setFrameSize`. Frame changes update the final layout once and animate the backing layer from its previous position and size. Reduced motion applies geometry immediately and limits alpha transitions to 120 ms. More elaborate artwork uses the view/outlet's `AFXLayer` and Core Animation objects; canvas artwork uses `controller.fx.animation.manageRenderer(outlet)` and its managed frame callbacks.

Controllers read `traitCollection.reducedMotion`, with updates through `traitCollectionDidChange`. Function views and shell recipes read the same setting through `useNSETraitCollection().reducedMotion`. This uses the existing host/controller trait propagation rather than introducing a second workspace singleton and a new notification facility. It is a read-only projection of the system setting. The animation environment provider is a framework host/testing detail; apps cannot set reduced motion on a subtree. Browser evidence uses `page.emulateMedia({ reducedMotion: "reduce" })`.

`present(viewController, animator)` is `NSViewController.present(_:animator:)`. An `NSEViewControllerPresentationAnimator` implements `animatePresentation(of, from)` and `animateDismissal(of, from)`. The framework mounts the presented view above its retained presenter in the presenter's coordinate space before calling either method. A method may return a promise; dismissal retains the view and controller until it settles, then disposes it. Repeated dismissal is harmless. Failed animation still completes dismissal. Disposal of the presenter immediately releases everything it owns.

`transition(from, to, options, completionHandler?)` replaces one child's view in its existing slot. Both controllers must be live children of the receiver; the outgoing controller remains owned for later reuse. Keep the original `<first.view />` slot in the parent's view; subsequent transitions replace the current view in that slot. Effects are `NSEViewController.TransitionOptions.crossfade`, `slideUp`, `slideDown`, `slideLeft`, `slideRight`, `slideForward` and `slideBackward`. Forward/backward respect writing direction. Combine one effect with `allowUserInteraction` using `|`; otherwise the moving slot is inert. Reduced motion substitutes a short crossfade. Completion runs once, and overlapping transitions are refused.

The framework's presence, layout and presentation helpers implement host choreography internally. They are not application architecture.
