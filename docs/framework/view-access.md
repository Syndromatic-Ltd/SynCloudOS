# Scroll and image view access

`NSEScrollView` is NSScrollView. Its React ref is an `NSEScrollViewHandle`:

```tsx
const scroll = useRef<NSEScrollViewHandle>(null);
<NSEScrollView ref={scroll}>Document content</NSEScrollView>
```

The handle is committed in a layout effect, before the owning view controller's appearance. `contentView` is the NSClipView counterpart: `element` is the physical scroll viewport and `bounds` is its rectangle in document coordinates. `documentVisibleRect` supplies the same currently visible document rectangle. `scrollRectToVisible` retains the existing inset-aware scrolling behaviour.

To observe scrolling and viewport resizing, set `contentView.postsBoundsChangedNotifications = true` and call `contentView.observeBoundsChanges(bounds => ...)`. The returned function removes the observation. Scroll delivery is coalesced to the next frame; unchanged bounds do not notify. Unmount disconnects scroll and resize observations, and a disposed clip refuses new observations. The callback API represents NSView's bounds-change notification in JavaScript; it is not a second notification centre. The pre-existing `controllerRef` also runs during layout and remains available.

`NSEImageView` is NSImageView. Its React ref is an `NSEImageViewHandle`, with `element` identifying the image view and `layer` corresponding to NSView.layer. Set `wantsLayer` to opt into backing. Without it, `layer` is null. With it, reading `layer` lazily acquires one CSS-layout AnimationFX layer from the mounted animation environment, before parent appearance. A layer-backed view requires that environment; an absent layer client throws explicitly. Unmount, a backing-policy change or a layer-client change aborts and disposes the old backing. The layer animates the whole image view, independently of its stationary parent anchor; fitting and panning remain in the image's viewport.

Both handles are view access contracts, not new drawn controls. Atmo continues to draw the scroll and image surfaces.
