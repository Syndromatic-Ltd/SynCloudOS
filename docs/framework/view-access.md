# Scroll and image view access

`NSEScrollView` and `NSEImageView` give you a handle through their React ref, so your code can read the visible area, follow scrolling and animate the view. This page describes both handles.

## Scroll view

The ref of an `NSEScrollView` is an `NSEScrollViewHandle`:

```tsx
import { useRef } from "react";
import { NSEScrollView, type NSEScrollViewHandle } from "@syndromatic/syncloudos/nse/scroll";

const scroll = useRef<NSEScrollViewHandle>(null);
<NSEScrollView ref={scroll}>Document content</NSEScrollView>
```

The handle is set in a layout effect, before the owning view controller appears. Its `contentView` describes the clip view: `element` is the scrolling viewport and `bounds` is the visible rectangle in document coordinates. `documentVisibleRect` gives you the same rectangle. `scrollRectToVisible(rect, behavior?)` scrolls a rectangle into view and takes the content insets into account.

To follow scrolling and viewport resizes, set `contentView.postsBoundsChangedNotifications = true` and call `contentView.observeBoundsChanges(bounds => ...)`, which returns a function that stops the observation. Your callback runs during the scroll event itself, so a redraw you schedule from it lands no later than before, and it doesn't run when the bounds haven't changed. Unmounting disconnects every scroll and resize observation, and a disposed clip view refuses new ones. This is a callback on the clip view, not a separate notification centre. The `controllerRef` prop still works and also runs during layout.

## Image view

The ref of an `NSEImageView` is an `NSEImageViewHandle` (from `@syndromatic/syncloudos/nse/controls`), with `element`, the image view's element, and `layer`, an AnimationFX layer for the whole view. Set `wantsLayer` to ask for that layer; without it, `layer` is `null`. With it, the first read of `layer` creates one CSS-layout layer from the mounted animation environment, before the parent appears. A layer-backed image view needs that environment and throws if there's no layer client. Unmounting, turning `wantsLayer` off or a change of layer client aborts the old layer and disposes it. The layer animates the whole image view, while fitting and panning still happen inside the image's own viewport.

Like managed outlets, the layer survives React StrictMode's immediate unmount and remount. A real detach releases it in the next microtask, and a detached handle can't create another layer. When the backing setting or the layer client changes, the old layer is retired before the new one is exposed.

Neither handle draws anything: Atmo still draws the scroll and image views.
