# Atmo Lab

A side-by-side theme bench. The left frame renders a read-only export of the commit in `BASE`; the right frame renders the working tree. Both load the same specimen pages, so a theme edit shows up on the right immediately, with nothing else changing.

```powershell
npm run atmo:lab
```

Then open http://127.0.0.1:5391/.

- The baseline export lives in `.artifacts/atmo-lab/baseline-<BASE>/`. Delete it to re-export.
- Shared specimens are mirrored into the export on change. The Partial app theme section uses only the working tree because the frozen revision predates app themes.
- The lab's own chrome is NSE from the working tree, so it is a live specimen too.
- Change `BASE` (or set `ATMO_LAB_BASE`) to compare against another commit.
