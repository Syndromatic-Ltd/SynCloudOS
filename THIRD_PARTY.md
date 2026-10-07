# Third-party notices

SynCloudOS framework source is AGPL-3.0-or-later. The SynWare app authoring
SDK source in `src/SynCloudOS/AppSDK/` is Apache-2.0, apart from the upstream
helpers identified below. These licences do not replace third-party terms.

## Atmo vector artwork

Some committed Atmo CSS/SVG control material was adapted from the Heritage and
Onyx artwork of [Enyo 1.0](https://github.com/enyojs/enyo-1.0), distributed by
the Enyo project under Apache-2.0. The upstream revision used for the licence
record is `52886009e73b665a94a65c5a66b5f285d2cf321d`.

Syndromatic modified the material into vector paths, gradients, paint tokens
and responsive control composition. The original raster theme implementations
are not distributed here. Syndromatic's modifications and the Atmo appearance
as a whole use the framework's AGPL-3.0-or-later licence. The upstream terms
and attribution remain applicable to the incorporated material; the full
Apache-2.0 text is in [licenses/Apache-2.0.txt](licenses/Apache-2.0.txt).

## Vendored source and generated helpers

| Component | Location | Licence and notice |
| --- | --- | --- |
| Project Nayuki QR Code generator | `src/FX/ImageFX/vendor/qrcodegen.ts` | MIT, [licence](licenses/qrcodegen-MIT.txt) |
| harfbuzzjs browser wrapper and runtime | `src/FX/TextFX/vendor/` | MIT, [licence](licenses/harfbuzzjs-MIT.txt); byte provenance is recorded alongside the source |
| Ajv runtime helpers | `src/SynCloudOS/AppSDK/manifest/synappManifestValidator.generated.mjs` | MIT, [licence](licenses/ajv-MIT.txt) |
| ajv-formats validator helpers | the same generated validator | MIT, [licence](licenses/ajv-formats-MIT.txt) |

The manifest compiler preserves the validator's generated source and upstream
notices. The generated helper code does not acquire the SDK's Apache licence.

## Packaged dependencies

The build includes upstream licence and notice files for packages incorporated
into the distributable module graph, plus the PDF worker, font/WASM libraries
and generated validator helpers. `licenses/dependencies.json` in the package
records the installed versions, licence identifiers and notice paths. External
dependencies also retain their own package licences when installed by npm.

## Test data

Test fonts keep their Open Font License texts and source records in
`tests/fixtures/fx/fonts/`. The synthetic audio sample's provenance is in
`tests/fixtures/fx/audio/PROVENANCE.md`. Test fixtures are not package assets.
First-party artwork ownership is documented in [ARTWORK.md](ARTWORK.md).
