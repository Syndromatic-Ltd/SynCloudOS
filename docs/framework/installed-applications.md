# Installed applications, declarations and system services

SynCloudOS owns one service worker for a deployment. Applications do not register workers. The Vite plugin reads the site's Webspring `Contents/Info.ts` and the selected apps' `Info.ts` files. Omission of `webApp` leaves that bundle uninstalled. Authentication remains an independent, optional host decision.

## Installation

Declare a whole desktop on Webspring's `Info.ts`, or declare an individual application on that app's `Info.ts`:

```ts
webApp: {
  scope: "/",
  startURL: "/",
  shortName: "My desktop",
  icons: [
    { src: "/icons/app-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/app-512.png", sizes: "512x512", type: "image/png" },
  ],
}
```

For a chosen app or an application-only host, use its declared route for `scope` and `startURL`, for example `/notes/`. Scope is explicit and is not inferred from the hosting mode. Deployment prefixes are applied by the plugin. Browser manifest scopes are URL prefixes, not security boundaries; use a trailing slash for a directory boundary. A site may expose several app manifests; the current route selects the most specific one.

The plugin serves `syncloudos-<bundleIdentifier>.webmanifest` and `syncloudos-sw.js`. Production builds precache the public HTML shell and emitted assets. The cache version incorporates the installed SDK receipt and the application build. A replacement worker waits for its predecessor's clients to close; it never forces an active document through an SDK replacement. The install command is `webspring.install`, also reached through Preferences > Capabilities. Browsers decide whether to offer a prompt. Installed hosts request storage persistence, which the browser can refuse.

Development also retains fetched Vite modules for offline inspection. Reload online after the worker first activates, so the worker sees those requests. A production build precaches its emitted bundles instead. API responses, authentication endpoints, document writes and foreign-origin responses are outside this shell cache. Server data and a fresh server sign-in still need a connection. Offline shell availability does not grant access to protected applications.

## Info.ts declarations and delivery

`documentTypes` accepts `mimeTypes` alongside its existing `id`, `extensions` and `displayName`. A type needs both MIME types and extensions to generate a file handler. The installed file handler launches the app before calling the document controller's `openDocument({ withContentsOf: file, typeId, applicationId })`. Register `DocumentType.readFromData(data, context)` to decode bytes; `data` is Foundation's `NSEData`. The result is an unsaved document. File-system write access is never inferred from an incoming file.

```ts
urlTypes: [{ name: "Notes", schemes: ["web+note"] }],
linkCapture: { paths: ["/notes/"], clientMode: "navigate-existing" },
shortcutItems: [{ type: "new", title: "New note", url: "/notes/new" }],
shareTarget: {
  action: "/notes/share", method: "POST", enctype: "multipart/form-data",
  params: { title: "title", text: "text", url: "url", files: [{ name: "files", accept: [".note"] }] },
},
```

These declarations project to `protocol_handlers`, `launch_handler`, `shortcuts` and `share_target`. Protocol registration is limited to browser-supported schemes (`web+…`, `mailto`, `tel`). Browser/OS link-capture and file-association policies remain authoritative. Shortcut entries also appear in the application's Webspring menu, beside the menu returned by `NSEApplicationDelegate.applicationDockMenu(application)`.

Assign `NSEApplication.delegate` and implement `applicationOpen(application, urls, context)`. `context.shortcutItemType` identifies a shortcut. `context.sharedItems` carries shared title, text, URL and files. GET sharing uses URL parameters. POST sharing is retained in the system worker's IndexedDB until delivery is acknowledged. Incoming shared files are limited to 32 MiB. The receiver decides whether to turn an attachment into a document. Delivery is serialised and aborted when the runtime closes.

A web app manifest has one share target. When several apps receive shares, declare the chosen target on Webspring's `Info.ts`, or install the receiving apps independently. The build rejects an ambiguous desktop target.

## BackgroundTasks

Declare `background: { enabled: true, tasks: ["com.example.notes.refresh"] }`. Use `application.backgroundTaskScheduler`:

```ts
await application.backgroundTaskScheduler.submit({
  identifier: "com.example.notes.refresh",
  url: "/api/notes/refresh",
  method: "POST",
  body: JSON.stringify({ cursor }),
});
```

`capabilities()` reports Background Sync and Background Fetch separately. `getPendingTaskRequests()` and `cancel(identifier)` manage pending sync requests. Requests are stored durably before sync registration. The worker retries unsuccessful responses and deletes a request only after a successful response. Requests must stay on the site's origin and deployment path, and task identifiers must be declared. The server must authenticate each request, enforce authorisation and deduplicate `X-SynCloudOS-Task`; browser retries do not provide exactly-once execution. A task does not execute an application class, React or NSE inside the worker.

`submitDownload({ identifier, urls, title, downloadTotal? })` uses Background Fetch and returns its browser download identifier and `abort()`. Completed responses are retained in the system download cache. `downloadedData(identifier, url)` reads a completed response as `NSEData` with its MIME type, or returns `null` while it is unavailable. Background scheduling is best effort: browsers may delay work indefinitely, and unsupported hosts reject with `NotSupportedError`.

## UserNotifications and push server contract

The notification centre's existing local posting and browser delivery remain available. `application.userNotificationCenter` supplies `getNotificationSettings()`, `requestAuthorization()` and `setNotificationCategories(categories)`. Declare the `notifications.post` entitlement. Authorisation uses the runtime's existing notification permission and per-app privacy services. Request it from a user action. `application.registerForRemoteNotifications()` registers the origin's Web Push subscription with the site's server; `unregisterForRemoteNotifications()` removes only that application's server association, because installed apps share the origin subscription.

Pass public configuration to `mountSynCloudOS`:

```ts
push: {
  applicationServerKey: import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY,
  subscriptionURL: "/api/push/subscriptions",
},
```

Omit `push` when no push server is configured. The key must be the owner's VAPID public P-256 key. No example private key, generated substitute or committed secret is supplied. Private VAPID keys and the contact subject belong only in the application server's secret configuration.

The server contract is:

- `POST subscriptionURL`: JSON `{ version: 1, appId, subscription }`, where `subscription` is the browser's `PushSubscriptionJSON`. Return a 2xx response after storing the authenticated user's app association.
- `DELETE subscriptionURL`: JSON `{ version: 1, appId, endpoint }`. Remove that app association and return 2xx. Apply session authorisation, CSRF protection, endpoint validation, rate limits and expiry on the server.
- Send encrypted Web Push to the saved endpoint using the owner's VAPID private key. Remove expired endpoints on HTTP 404/410; resubscribe from the client when required. Do not treat a subscription endpoint as proof of identity or app access.
- Standard payload: `{ version: 1, appId, identifier, title, body, url, categoryIdentifier?, badge? }`. URLs must remain within an installed scope. Categories are configured by the application; the portable worker supports up to two actions. Notification clicks route into the app delegate with `scos-notification` and optional `scos-action` URL parameters.
- Declarative payload: `{ web_push: 8030, notification: { title, body, navigate, app_badge? } }`. This is the declarative Web Push alert envelope; Chromium uses the worker's equivalent delivery path. Native browser support is reported separately from worker fallback.

The worker mirrors received pushes into the open runtime's NotificationCenter and never sends a duplicate browser notification from that mirror. No live push transport can be accepted until the owner configures a public key, the matching private key and server endpoints. Revocation, per-app mute and account changes must also remove or suspend server associations; a closed page cannot run page-level access policy.

## Badges and shell

`application.dockTile.badgeLabel` is `NSDockTile.badgeLabel`: set text or a number as a string; set `""` to reveal the notification count again. Webspring uses the existing Atmo Badge renderer. The browser's installed-app badge combines NotificationCenter's badge snapshot with app labels. Numeric labels supply a count; textual labels contribute one attention mark. The OS may choose to display only an attention mark. Labels are bounded to 64 characters and stop accepting updates after the application closes.

Installed desktop windows that expose Window Controls Overlay use the real `NSEWindowTitleBar` renderer in the browser's reported draggable title area. Atmo supplies the appearance. Native window controls stay with the browser/OS. Ordinary browser tabs draw no extra title bar.

`NSEViewController.transition(from, to, crossfade, completion)` can use native View Transitions. The native backend uses the animation context's duration and completion lifetime; unsupported hosts, reduced motion and other effects retain AFX. The temporary snapshot styling is owned and removed by the transition.

Preferences > Capabilities reports installation, worker and storage status, browser platform support and available passive FX capability queries. Opening it does not request device access. A supported API is not evidence of an authorisation grant or successful device operation.
