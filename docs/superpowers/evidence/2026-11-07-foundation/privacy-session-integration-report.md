# Mounted privacy integration regressions

`tests/runtime/privacy-session-integration.test.ts` uses real canonical bundles, AppRegistry registration, mounted appRuntimeFacade/context creation, the runtime configuration evaluator and runtime-owned privacy store. Hardware boundaries use the ordinary deterministic location/MIDI environment and the Motion adapter fixture. It never replaces the evaluator or grants raw FX capabilities to roles.

Eight scenarios pass:

1. An entitled app can request Location, Motion and normal/SysEx MIDI while its role has none of those FX capabilities; records use the correct app, authenticated subject and service.
2. A second app does not inherit the origin's device permission or another app's local choice.
3. Local denial blocks native requests, and revocation stops an existing location watch.
4. A user switch revokes previously issued scopes and leaves the former user's saved choice intact.
5. Logout revokes previously issued scopes and leaves the former user's saved choice intact.
6. Switching authenticated subject with the same displayed email revokes old scopes and does not transfer consent to a fresh mount.
7. Replacing a session for the same principal revokes old scopes while a fresh mount retains that principal's saved consent.
8. A real managed app restriction stops active device use without rewriting privacy consent.

The first run found a real failure: an authenticated subject change with the same displayed email left the old location watch delivering. `privacy-session-integration-first.log` records six passing tests and that failing assertion. Root changed the device owner to use canonical `identity:<subjectId>` keys and canonical session identity fencing; the final run records eight passing tests in `privacy-session-integration-green.log`.

The framework TypeScript build also passes (`npx tsc -b --pretty false`); its log is privacy-session-integration-typecheck.log.

This is deterministic runtime integration evidence. It does not prove physical sensor/MIDI behaviour, browser permission prompt rendering, server identity verification or live UI acceptance. The root session owns the source fix, site adoption and the final full-suite run. This slice changes only the new test and its evidence.
