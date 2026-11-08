# DispatchFX in-realm core execution

Owner scope: Tasks 1–6 only, after option A, followed immediately by Network/Speech/Contacts/Pass/NFC/Bluetooth/XR and final acceptance. The immutable specifications are `docs/superpowers/reviews/2026-11-08-dispatchfx-design.md` and `docs/superpowers/plans/2026-11-08-dispatchfx-plan.md`; both have been read in full. The owner's positional/default-options correction governs all arguments. No ambient app context, worker pool, closure conversion, Tier 2, benchmarks, App Nap or framework adoption.

- [x] Task 1: value types, public re-export entry, package/counterpart/developer metadata; first commit includes both owner documents unchanged.
- [ ] Task 2: root scheduler/DFXObject/async queues, pinned scheduling and synchronous-work tests.
- [ ] Task 3: sync/deadlock/QoS override.
- [ ] Task 4: work items/groups/semaphores and non-blocking/main-thread wait rules.
- [ ] Task 5: asyncAfter/source protocols, no-drift and leeway timer tests.
- [ ] Task 6: per-app binding/lifetime, internal system queues and installed consumer.

One code commit per task; test-first. Each records tests, typechecks, member mappings and browser limits here. Owner questions do not pause work; decisions preserving Apple semantics and privacy are recorded. Only the three explicit stop conditions in the latest owner instruction apply.

## Member mapping

Task 1 exports exactly twelve runtime values and their associated enum/generic types. Full mapping and members: `docs/framework/fx/dispatch.md`. Developer MCP lookup is supplied by `docs/framework/appkit-counterparts.json`; the installed lookup reads that canonical map and package declarations, so no separate generated lookup data is edited.

- `DFXTime` / `DFXWallTime` / `DFXTimeInterval` / `DFXTimeoutResult` map to the same `Dispatch*` names.
- `DFXQoS` -> `DispatchQoS`; `DFXQoSClass` -> `DispatchQoS.QoSClass`.
- `DFXQueueAttributes` -> `DispatchQueue.Attributes`; `DFXQueueAutoreleaseFrequency` -> `DispatchQueue.AutoreleaseFrequency`.
- `DFXWorkItemFlags` -> `DispatchWorkItemFlags`; `DFXSpecificKey<T>` -> `DispatchSpecificKey<T>`.
- `DFXSourceTimerFlags` -> `DispatchSource.TimerFlags`; `DFXSourceMemoryPressureEvent` -> `DispatchSource.MemoryPressureEvent`.

The canonical `sdk-entries.mjs` produces both the package export map and SDK entry list. The export policy adds DispatchFX to `requiredFxFamilies`; source TypeScript aliases and architecture aliases register the same entry. `public.ts` contains twelve explicit named re-exports only. No time payload or helper is exported by that entry.

## Decisions and omissions

- `dispatchPrecondition` keeps Apple's unprefixed name.
- Omit fd/Mach/POSIX-signal/process sources, DispatchIO, DispatchData, DispatchWorkloop, Combine's SchedulerTimeType and DispatchWallTime(timespec:).
- SFSpeechRecognizer.queue uses OperationQueue, not DispatchQueue; omit its absent Foundation counterpart and record that decision in the fidelity report.
- Worker/performance features in Tasks 7 onwards and App Nap remain a separate job. No worker performance improvement is claimed by Tier 0.

## Task 1 verification and implementation decisions

- Commit subject: `FX: add DispatchFX value types and entry` (SHA recorded by the next task).
- Approved design SHA256: `F96AD9D404D7052B8BC888A05F68DF37CE16CC56E90333AD120AB9BA81C0BC46`; approved plan SHA256: `6609821C3E1F4035DFBC1E6908CCB171424D681B2EB736AB7CE12EFD6F1C67BD`. Both are committed unchanged in this first Dispatch commit.
- Initial RED: both pinned value/counterpart suites fail because `../public` does not exist (`task-1-red.log`). Initial GREEN: 11 tests pass (`task-1-green.log`). Final focused run: 15 tests across two files pass, including TypeScript exports and emitted declaration checks (`task-1-focused.log`).
- Counterpart tests belong in `tests/runtime/fx/dispatch-counterparts.test.ts`, following existing tooling tests. An initial src placement exposed production-to-build-tool architecture edges and Node typings; relocation resolved both. The pinned values test remains `src/FX/DispatchFX/__tests__/values.test.ts`; Vitest's include adds only this family's tests.
- A wall-range boundary test first failed with a negative unsigned raw encoding for a host date beyond UInt64 nanoseconds (`task-1-wall-boundary-red.log`); now samples beyond the supported range return distantFuture.
- Framework and sibling-site `npx tsc -b --pretty false` pass. Architecture check passes: 1,634 files, 7,365 edges. `git diff --check` passes. No full suite or SDK build was needed for canonical entry correctness; packed/lifetime acceptance remains Task 6.
- Wall `rawValue` uses unsigned 64-bit negative-epoch `bigint` encoding with `2^64 - 1` future sentinel, explicitly departing from the design's general number shorthand. The owner's Apple correction takes precedence over the task's same-shape wording. No public wall constructor, timespec initializer or uptime property is introduced. Exact wall subtraction happens before projecting into safe-number interval units. Samples have millisecond resolution; arithmetic retains nanoseconds.
- Uptime remains number/MAX_SAFE_INTEGER, with finite now samples capped below future. Advancing an out-of-range uptime clamps to zero/future. Wall finite lower bound is epoch ns 2, upper bound `2^62 - 2`; overflow advances to future. Finite wall distances saturate safely at signed MAX_SAFE_INTEGER; future-to-finite is negative MAX_SAFE_INTEGER, finite-to-future is never, future-to-future is zero. Full rationale and documented behaviour are in the developer reference.
- Private `internal/time.ts` provides interval payload access through `nanoseconds(interval)`, validation and safe bigint distance projection. It is absent from public exports and public declaration imports. No scheduler, queues, ambient context or Tasks 2+ placeholders were added.
- Seven tracked metadata/config edits preserve original LF formatting. New sources are verified UTF-8. C: remains above the 20 GB floor. No protected port, preview configuration, server, branch, worktree or Fusion operation occurred.

## Task 1 review correction

- Independently checked Apple's primary `src/shims/time.h`: `DISPATCH_WALLTIME_MASK = 1ULL << 62`, `DISPATCH_TIME_MAX_VALUE = mask - 1`; `_dispatch_clock_and_value_to_time` returns forever at or above that maximum. The unsigned wall encoding requires top bits `11`.
- RED (`task-1-clock-tag-red.log`): two regressions fail before correction: host date 5,000,000,000,000 ms incorrectly stays finite, and exact boundary date 4,611,686,018,427 ms advanced by 387,903 ns incorrectly stays finite. The preceding 387,902 ns is finite and retains top bits `11`.
- Corrected both wall `now()` and `advanced()` guards to the tagged 62-bit clock limit. Finite epochs end at `2^62 - 2`; future raw remains `2^64 - 1`. Updated the developer reference and placed the Dispatch README row inside its existing table.
- Focused Dispatch/counterpart verification now has 15 passing tests across two files. Framework/site typechecks pass; architecture passes (1,634 files and 7,365 edges); staged diff checks pass before amending the single Task 1 commit. No public API or unrelated paths changed; approved owner document hashes remain unchanged.
