# Route picker

`NSERoutePickerView`, from `@syndromatic/syncloudos/nse/controls`, is a button that lets the user send a video to another playback device. It's a standard Atmo `NSEButton` that opens the browser's Remote Playback chooser straight from the click, so the browser sees the user's gesture. Its default title is "Choose playback device"; pass a localised `title` if you need one.

```tsx
import { useVideoPresentation } from "@syndromatic/syncloudos/sdk";
import { NSERoutePickerView } from "@syndromatic/syncloudos/nse/controls";

const presentation = useVideoPresentation();
// Create once per video element, and dispose with its owner.
const routeDetector = presentation.createRouteDetector(videoElement, signal);
<NSERoutePickerView routeDetector={routeDetector} onError={report} />
```

Pass a `VFXRouteDetector` from your session's video presentation client as `routeDetector`. The button shows whether a device is connected through `aria-pressed`, and disables itself when Remote Playback isn't available. It never starts looking for devices when it mounts: call the detector's `startDiscovery()` when your application wants availability updates, and dispose the detector with the component or mount that created it. If the chooser fails, the error goes to `onError`.

The browser owns the chooser and decides which devices it supports. Remote Playback in Chromium doesn't include AirPlay, although Safari may offer it. The control never keeps its own list of devices or reports a selection the browser didn't make.
