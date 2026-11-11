# Site UI failure diagnosis

Read-only source/diff diagnosis. No source or test changes, no test/build execution and no browser probe were performed by this reviewer. Evidence supplied by the parent: `part-b-site-full.json` (**396 passed, three failed**) and `part-b-site-ui-recheck.json` (**13 passed, the same three failed**).

## Publisher: two anchor assertions

`tests/runtime/publisher/product-controller.test.tsx:73` fails for both `imagePopover` and `publishMenu` while checking the **first** manually assigned anchor, before its replacement is tested.

The fixture appends arbitrary button elements and assigns `window[property] = oldAnchor`. The production `PublisherRootViewController.viewDidLayout()` calls `publisher.reanchorTransientChrome()` (`PublisherViewControllers.tsx:52`). That method (`PublisherWindowController.tsx:158-163`) selects the connected native toolbar's `image:0` or `publish:0` item, or the phone control, and replaces any open anchor that differs from that canonical element. The popover effect then presents using the resulting property (`PublisherViewControllers.tsx:433-434`). The received button in the failure is consequently the actual rendered toolbar control, while the assertion expects the independent empty fixture button.

This is a concrete fixture/product anchor-contract mismatch. `git blame` attributes `reanchorTransientChrome` to `a5124440` (2026-11-02); both it and the layout hook predate this migration and are unchanged by the byte diff. The migration's Publisher production change is the later export payload (`PublisherWindowController.tsx:1227`), and its test change is the exported-file read near line 182. Neither executes in these two failing anchor cases.

Ownership needed: the Publisher/toolbar integration owner must decide whether the regression should exercise actual toolbar replacement or whether automatic reanchoring needs a narrower ownership condition. Review `PublisherWindowController.tsx`, `PublisherViewControllers.tsx` and the two anchor cases together. Do not alter the title/toolbar architecture or relax the assertions as part of a byte migration.

## Gallery: editable-window title lookup

`tests/runtime/gallery-atmo-surfaces.test.tsx:58` polls for an owned-window record whose title is exactly `Gallery editable document`; the result remains undefined. The test stops here, before edit/undo/save/window-state assertions.

The invoked specimen (`GalleryWindowExample.tsx:55-66`) creates a plain JSON text document, saves it, then calls `openDocumentWindow` with that explicit title. Its model (`GalleryTransferDocumentType.ts`) contains versioned attributed text only. This path performs no file-panel selection, resource acquisition, binary import/export, image decoding or FX byte operation. The byte migration's `WindowSections.tsx` changes affect the separate file-panel specimen; the editable-window specimen's implementation and title literal are unchanged.

The current title/chrome integration includes a dirty `GalleryViews.tsx:115` effect that assigns the active section's title and expanded style to its window, plus new titlebar accessories and concurrent framework window-chrome projection. Secondary documents are selected separately in `GalleryViewControllers.tsx:193-207`; their app/window association and title must remain distinct from the gallery shell. The failing log does **not** show the actual owned-window records or specimen outcome message. Source inspection alone therefore does not prove whether the document failed to open or opened under a different title, and it does not identify a particular title writer conclusively.

Ownership needed: the Gallery/page-header owner should inspect the specimen outcome and the secondary owned-window record immediately after opening, then reconcile its association/title with shell title publication. Relevant files are `GalleryWindowExample.tsx`, `GalleryViewControllers.tsx`, the already-dirty `GalleryViews.tsx`, and, if the record is retitled by host projection, framework `AppHosting/applicationHosting.tsx`, `AppHosting/windowChrome.tsx` and `NSE/Application/NSEWindowController.ts`. Preserve the concurrently dirty Gallery catalogue/presentation/style work.

## Attribution and limits

No byte-migration execution path was found in the three failing cases. Publisher's conflicting anchor behaviour is positively traced to unchanged production code; Gallery is narrowed to a plain-document/window-state failure and concurrent title ownership, with its final runtime cause still unproven. The repeated current-state failures establish reproducibility, **not** a pre-migration failing baseline. Report these as unresolved site UI/integration failures, without calling the site suite green or claiming a confirmed historical baseline.
