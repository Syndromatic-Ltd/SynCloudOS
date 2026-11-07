# Installed 6E authoring consumer

Copy this directory to a clean temporary directory. Install the exact SDK archive produced by the parent integration build, plus this fixture's declared dependencies, then run `npm run check` and `npm test`. Record the archive digest and installed package version with the results.

The standalone TypeScript/Vitest configurations have no sibling-source aliases, legacy decorator flags or emitted metadata. `src/SynWare/Search.app` exercises a separate React view with local hook state, bindings, typed actions, mounted observation/task lifetimes, a preference and a real DOM layer outlet. `src/InlineView.tsx` shows the inline form. The integration owner runs the package installation serially; source tests do not prove installed-package acceptance.
