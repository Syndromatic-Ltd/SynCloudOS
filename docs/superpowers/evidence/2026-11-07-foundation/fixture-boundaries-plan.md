# Development fixture boundary repair

Baseline: `54a9970268a05fa9e63059e7ed0d0eee3eba949d`, branch `fix/blind-rewrite-friction`.

The owner's approved design is the report's first option: registered, mounted applications receive host-owned traits and controllers use `presentAsPopover`. No SDK export, checker policy, consumer list or allow-list changes. Work stays in the existing worktree. Existing evidence belongs to the earlier pass.

- [x] Record the three failing boundary edges and baseline TypeScript build.
- [x] Add a failing mounted-presentation test for compact geometry, retaining stored desktop bounds. Make the existing host use `resolveWindowPresentation(...).bounds` for its content-bound source; preserve its subscription and revocation behaviour.
- [x] Reuse `syncApplicationWindowContentRenderers` in App's development branch and mount the navigation application. Attempt the window application and restore it under the owner's stopping rule after its public-path geometry test fails.
- [x] Replace the navigation private renderer with a presented view controller, keeping its title, preferred content size, fields and dismissal control. Stop the window replacement: its forced anchored presentation has no public equivalent; see the report and saved attempt patch.
- [x] Retain every geometry-continuity assertion. Run adaptive navigation, geometry continuity, window management, mobile-window and document FrameworkTests browser suites with evidence output in this directory. Record all failures; retain the original navigation assertions alongside two new mounted-popover cases.
- [x] Run both framework typechecks, boundaries, relevant Vitest files, SDK build, SDK package and packed consumer tests sequentially where they share SDK output. Commit small groups by explicit path. Boundary exit 1 is the single stopped window edge, not a passing result.
- [x] Adopt committed source `be52818` through the owner's detached scratch-checkout procedure, run site TypeScript and Vitest, delete only the node_modules junction, verify the original vitest executable, then remove the scratch checkout. Commit only adoption files as `64b8ace`.
- [x] Run the full framework suite exactly once at the end with `--maxWorkers=1 --no-file-parallelism`; retain raw logs and JSON, report every failure, and commit the final report. Result: 874 files / 7,291 tests passed, exit 0. The architecture command still exits 1 for the stopped window fixture.

No new source file is planned. Any necessary new source/test file copies its sibling's licence header. Browser evidence is automated Chromium evidence, not human visual acceptance.
