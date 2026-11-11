# NetworkFX phase 4 report

Implemented standalone NWFX family, injected browser adapter, mounted client, component-scoped useNetwork hook, and framework guide. Public records are worker-safe and immutable; browser online state is explicitly a hint. Unknown cost/constrained/type remain null; Save-Data is separate. Construction is passive; monitor cancellation, owner/caller abort, and reauthorization remove subscriptions.

## Verification

- TDD initial focused run failed because the new adapter module did not yet exist.
- Final focused run: `npx.cmd vitest run tests/runtime/fx/networkPaths.test.ts`: 7/7 passed.
- `npm.cmd run typecheck:authoring`: passed.
- `npm.cmd run typecheck`: failed on expected shared integration `SCOSFacade.network` and unrelated BrowserContactsAdapter string[] typing. No other NetworkFX diagnostics.
- `npm.cmd run boundaries:architecture`: initial result identified new app-sdk mountedResourceScope exception required, browser-global boundary access, and unrelated WindowManagementFixture public-entry import. Browser globals were then removed entirely; adapter defaults to {} and requires injected host references. Root owns shared boundary registration.

## Root integration

- Environment `networkPaths: NWFXNetworkPathAdapter` from FX/NetworkFX/NWFXPathMonitor.
- Instantiate `new BrowserNetworkPathAdapter({navigator: browserNavigator, eventTarget: browserWindow})`; unavailable host fallback `new BrowserNetworkPathAdapter()`.
- `createMountedNetworkClient(environment.networkPaths, mountSignal, permissions, authorise)` with authorise callback for `network.read`.
- SCOSFacade/context `network: NWFXPathClient`; export `useNetwork` through the SDK hook entry.
- SDK family `NetworkFX`, public entry `fx/network` -> `src/FX/NetworkFX/public.ts`.
- Register network.read capability/manifest entitlement and docs index/appkit-counterparts.
- Add mountedNetworkClient.ts to same architecture allowed host seam source group as mountedLocationClient.ts. Do not expose adapter port publicly.

No site UI or shared registries modified by this agent. Node adapter tests do not claim browser/human acceptance.
