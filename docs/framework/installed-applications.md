# Installed applications, declarations and system services

This page covers what lets a SynCloudOS site or application be installed from the browser, and the system services that come with installation: file and link handling, sharing, background tasks, push notifications and badges. SynCloudOS runs one service worker per deployment, and applications never register their own. The Vite plugin reads the site's Webspring `Contents/Info.ts` and each selected application's `Info.ts`; a bundle without `webApp` isn't installable. Installation doesn't depend on authentication.

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

For a single application, or a host that runs only one application, use its route for `scope` and `startURL`, for example `/notes/`. You always set the scope yourself; it isn't worked out from the hosting mode. The plugin adds any deployment prefix. A manifest scope is a URL prefix, not a security boundary, so end it with a slash to stop at a directory. A site can offer several application manifests, and the current route picks the most specific.

The plugin serves `syncloudos-<bundleIdentifier>.webmanifest` and `syncloudos-sw.js`. Production builds precache the public HTML shell and the built assets, and the cache version combines the SDK receipt with the application build. A new worker waits until the old one's pages close, so an open page is never switched to a different SDK underneath it. The install command is `webspring.install`, also available in System Preferences > Capabilities, but the browser decides whether to offer installation. Installed sites request persistent storage, which the browser can refuse.

In development, the worker also keeps the Vite modules it fetches so you can test offline; reload once while online after the worker first activates, so it sees those requests. A production build precaches its bundles instead. API responses, authentication endpoints, document writes and responses from other origins are never cached, so server data and a new sign-in still need a connection. Having the shell offline doesn't give access to protected applications.

## Info.ts declarations and delivery

`documentTypes` entries accept `mimeTypes` as well as `id`, `extensions` and `displayName`, and a type needs both MIME types and extensions to become a file handler. When the user opens a file with the installed application, it launches and then calls the document controller's `openDocument({ withContentsOf: file, typeId, applicationId })`. Implement `DocumentType.readFromData(data, context)` to decode the bytes, which arrive as an `NSEData`. The result is an unsaved document; opening a file never grants permission to write back to it.

```ts
urlTypes: [{ name: "Notes", schemes: ["web+note"] }],
linkCapture: { paths: ["/notes/"], clientMode: "navigate-existing" },
shortcutItems: [{ type: "new", title: "New note", url: "/notes/new" }],
shareTarget: {
  action: "/notes/share", method: "POST", enctype: "multipart/form-data",
  params: { title: "title", text: "text", url: "url", files: [{ name: "files", accept: [".note"] }] },
},
```

Declare an application route for each shortcut URL and share action, and use `match: "prefix"` only where the application owns everything under that path. The system removes its own launch parameters before route query validation, and the delegate still receives the original URL.

These declarations become the manifest's `protocol_handlers`, `launch_handler`, `shortcuts` and `share_target`. Only schemes the browser allows can be registered (`web+…`, `mailto` and `tel`), and the browser and operating system still decide how links and file types are handled. Shortcuts also appear in the application's Webspring menu, next to the menu returned by `NSEApplicationDelegate.applicationDockMenu(application)`.

To receive these, assign `NSEApplication.delegate` and implement `applicationOpen(application, urls, context)`. `context.shortcutItemType` identifies a shortcut, and `context.sharedItems` carries a shared title, text, URL and files. GET shares arrive as URL parameters. POST shares wait in the service worker's IndexedDB until the application acknowledges them, and shared files can total at most 32 MiB. Your application decides whether an attachment becomes a document. Deliveries arrive one at a time and stop when the runtime closes.

A web app manifest has only one share target. If several applications accept shares, declare the target on Webspring's `Info.ts`, or make the receiving applications installable on their own. The build rejects a site with more than one candidate.

## BackgroundTasks

Declare `background: { enabled: true, tasks: ["com.example.notes.refresh"] }` in `Info.ts`, then use `application.backgroundTaskScheduler`:

```ts
await application.backgroundTaskScheduler.submit({
  identifier: "com.example.notes.refresh",
  url: "/api/notes/refresh",
  method: "POST",
  body: JSON.stringify({ cursor }),
});
```

`capabilities()` reports Background Sync and Background Fetch support separately. `getPendingTaskRequests()` and `cancel(identifier)` manage pending sync requests. A request is saved before sync is registered, retried while responses fail, and deleted only after a successful response. Requests must stay on the site's origin and deployment path, and their task identifiers must be declared. Your server must authenticate each request, check authorisation and deduplicate on the `X-SynCloudOS-Task` header, because browser retries can deliver a request more than once. The worker only sends the request; no application class, React or NSE code runs there.

`submitDownload({ identifier, urls, title, downloadTotal? })` uses Background Fetch and returns the browser's download identifier and `abort()`. Finished responses are kept in the system download cache, and `downloadedData(identifier, url)` reads one as `NSEData` with its MIME type, or returns `null` if it isn't available. Background work is best effort: a browser can delay it indefinitely, and one without support rejects with `NotSupportedError`.

## UserNotifications and push server contract

Local notifications work as before. `application.userNotificationCenter` provides `getNotificationSettings()`, `requestAuthorization()` and `setNotificationCategories(categories)`, and needs the `notifications.post` entitlement. Authorisation goes through the browser's notification permission and the per-application [privacy](privacy.md) store, so request it from a user action. `application.registerForRemoteNotifications()` registers the site's Web Push subscription with your server. `unregisterForRemoteNotifications()` removes only that application's link to it, because every installed application on the site shares one subscription.

Pass public configuration to `mountSynCloudOS`:

```ts
push: {
  applicationServerKey: import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY,
  subscriptionURL: "/api/push/subscriptions",
},
```

Leave out `push` if you have no push server. The key must be your VAPID public P-256 key; the framework supplies no example or generated key. Keep the private VAPID key and the contact subject in your server's secret configuration.

The server contract is:

- `POST subscriptionURL`: JSON `{ version: 1, appId, subscription }`, where `subscription` is the browser's `PushSubscriptionJSON`. Store the link between the signed-in user, the application and the subscription, then return a 2xx response.
- `DELETE subscriptionURL`: JSON `{ version: 1, appId, endpoint }`. Remove that link and return 2xx. Apply session checks, CSRF protection, endpoint validation, rate limits and expiry on the server.
- Send encrypted Web Push to the saved endpoint with your VAPID private key. Remove endpoints that return HTTP 404 or 410, and let the client subscribe again when it needs to. A subscription endpoint is never proof of identity or access.
- Standard payload: `{ version: 1, appId, identifier, title, body, url, categoryIdentifier?, badge? }`. URLs must stay within an installed scope. The application configures categories, and the worker supports up to two actions. Clicking a notification opens the application through its delegate, with a `scos-notification` URL parameter and, for an action, `scos-action`.
- Declarative payload: `{ web_push: 8030, notification: { title, body, navigate, app_badge? } }`, the declarative Web Push format. Chromium delivers it through the worker instead, with the same result.

The worker copies received pushes into the open runtime's notification centre without showing a second browser notification. Push only works once you've configured the public key, the matching private key and the server endpoints. When a user revokes access, mutes an application or changes account, your server must also remove or pause the matching links, because a closed page can't apply access rules.

## Badges and shell

Set `application.dockTile.badgeLabel` to text or a number written as a string, or to `""` to show the notification count again. Webspring draws it with Atmo's badge. The installed application's browser badge combines the notification centre's badge count with application labels: a numeric label adds to the count, and a text label adds a single attention mark. The operating system may show only an attention mark. Labels can be up to 64 characters, and stop updating once the application closes.

The browser adapter detects Window Controls Overlay and reads the title bar area from the browser; the operating system draws its own window buttons. Title bar placement in installed windows hasn't yet been checked on real devices.

`NSEViewController.transition(from, to, options, completionHandler)` swaps two child view controllers. With `NSEViewControllerTransitionOptions.crossfade`, it uses the browser's View Transitions where available, timed by the current animation context. Other effects, browsers without View Transitions, and reduced motion use AnimationFX. The transition removes its temporary snapshot styles when it finishes.

System Preferences > Capabilities reports installation, worker and storage status, what the browser supports, and the results of FX capability checks. Opening it never requests device access, and an API being supported doesn't mean access was granted or that a device works.
