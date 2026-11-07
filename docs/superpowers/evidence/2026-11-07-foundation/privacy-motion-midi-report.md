# Motion and MIDI privacy integration

Public additions:

- `MFXMotionAuthorization.authorizationStatus` (and therefore `MFXMotionManager.authorizationStatus`) reports `MFXAvailability`.
- `MIFXAccess.authorizationStatus` reports `MIFXAuthorizationState`; separate SysEx status remains in `getCapabilities().sysexAuthorization`.
- `useMotion` and `useMIDI` preserve these live getters across component mount/unmount.

Root integration uses the optional last argument of `createMountedMotionClient(..., privacyPort)` and `createMountedMIDIClient(..., sysex => privacyPort)`. Supply distinct `motion`, `midi` and `midi.sysex` app/user scopes. Existing declaration callbacks and private MIDI capability decisions remain in place. Without a privacy port, direct host clients retain their prior behaviour.

Motion creation and status inspection remain passive. A fresh app requires explicit authorisation even when native motion is available. With privacy installed, starting updates/recording requires a granted app gate and available native sensor. Only a native `available` authorisation result records a grant. The manager is bound when an active request begins, so revocation stops streams, clears cached samples and prevents late results from restoring consent. Denied owners may still be created and inspected.

MIDI keeps normal and SysEx consent separate. A SysEx-first request explicitly completes normal access before requesting SysEx. Native denial/unavailability never records a grant. Both scopes bind a SysEx-enabled owner, so revoking normal consent closes its SysEx resources too. Resetting normal consent also removes its effective SysEx grant. Input delivery checks live privacy/owner state and output sends remain guarded after acquisition. A SysEx withdrawal closes the affected access object; an ordinary access object that never requested SysEx has no SysEx binding.

Verification: 41 tests pass across the new privacy regression file and existing motion-authority, motion-client, motion-hook and midi-access files. The earlier mounted authority batch had 28 passing and one failure where the root-owned test host/facade still read the removed Info declaration key. Framework typecheck and architecture logs explicitly retain remaining root-owned integration and concurrent diagnostics; no owned source diagnostic remained after the descriptor-map typing correction. Actual devices, native browser prompts and hardware MIDI/motion delivery were not verified in this slice. No UI was added.
