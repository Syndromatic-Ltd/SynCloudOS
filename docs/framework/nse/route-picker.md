# Route picker

`NSERoutePickerView` is the AVRoutePickerView analogue. It uses the standard
Atmo `NSEButton` and opens the browser's Remote Playback chooser directly from
the click, preserving user activation. Its default title is “Choose playback
device”; pass a localised `title` when needed.

Pass a session-issued `VFXRouteDetector` as `routeDetector`. The control reports
the connection state through `aria-pressed` and disables itself when Remote
Playback is unavailable. It never starts device discovery on mount. Use the
detector's explicit `startDiscovery()` when your application needs availability
updates, and dispose it with its component or mount. Handle a rejected chooser
through `onError`.

The browser owns the chooser and supported routes. Chromium's Remote Playback
API does not imply AirPlay support; Safari may offer AirPlay. This control
does not create a private device list or substitute a successful selection.
