# ImageFX analysis, barcodes and RAW

This page covers the parts of [ImageFX](../image.md) that look at images or read other formats: feature detection, the model assets that drive learned detectors, barcode descriptors that feed the code generators, and a portable DNG RAW decoder.

```ts
import { IFXDetector, IFXRAWFilter } from "@syndromatic/syncloudos/fx/image";
```

## Detecting features

### `IFXDetector`

Finds rectangles, QR codes, text regions and faces in an image. It is the counterpart of `CIDetector`. The detector renders your image once at a bounded size, hands the pixels to one or more analysis backends and returns their features. Backends are pluggable, and the detector reports which capabilities are actually available rather than guessing.

```text
new IFXDetector({ maximumPixels?, backends? })
```

| Option | Default | Meaning |
| --- | --- | --- |
| `maximumPixels` | 1,048,576 | The largest image (in pixels) it will analyse, from 1 to 2,097,152. A larger image throws `RangeError`, so crop or scale first. |
| `backends` | none | Extra `IFXAnalysisBackend`s. The built-in portable backend is always present and is consulted first. |

| Member | Description |
| --- | --- |
| `capability(name)` | Returns an `IFXAnalysisCapability` for a capability name. When no configured backend provides it, the state is `"unsupported"` with a reason. |
| `detect(image, request)` | Analyses an `IFXImage` and resolves with the detected `IFXFeature`s. |

`IFXDetectionRequest`:

| Field | Description |
| --- | --- |
| `features` | One to four feature kinds to look for: `"rectangle"`, `"qr"`, `"text-region"` or `"face"`. |
| `crop` | A `GFXRect` restricting the analysis. Reported coordinates are still in the original image's space. |
| `orientation` | `"up"` (default), `"right"`, `"down"` or `"left"`, the direction the image's top faces, for pictures that are stored rotated. |
| `signal` | An `AbortSignal`. |

`detect` throws `IFXUnsupportedAnalysisError` when no backend supports a requested kind, `TypeError` for an unknown kind, and `RangeError` for an empty or infinite image.

**Capabilities.** `IFXAnalysisCapabilityName` is the feature kinds plus `"core-ml-model"`, `"person-segmentation"` and `"saliency-map"`. An `IFXAnalysisCapability` has `name`, `state` (`"available"` or `"unsupported"`), and, depending on the backend, `version`, `backend`, `model` (`{ id, version, sha256 }`) or `reason`. Ask before you rely on a feature:

```ts
import { GFXImage } from "@syndromatic/syncloudos/fx/graphics";
import { IFXDetector, IFXImage } from "@syndromatic/syncloudos/fx/image";

export async function findQRCodes(pixels: GFXImage) {
  const detector = new IFXDetector();
  if (detector.capability("qr").state !== "available") return [];
  const features = await detector.detect(IFXImage.fromPixels(pixels), { features: ["qr"] });
  return features.flatMap((feature) => (feature.kind === "qr" ? [feature.payload] : []));
}
```

### `IFXFeature`

A frozen union discriminated by `kind`. Every feature has:

| Field | Description |
| --- | --- |
| `bounds` | The bounding `GFXRect` in the source image's coordinates. |
| `corners` | Four `GFXPoint` corners, in the source image's coordinates. |
| `confidence` | From 0 to 1. |
| `backend`, `backendVersion` | Which backend produced it. |

The kinds add fields:

| Kind | Additional fields |
| --- | --- |
| `IFXRectangleFeature` (`"rectangle"`) | none |
| `IFXQRCodeFeature` (`"qr"`) | `payload` (the decoded text) and `rawBytes` |
| `IFXTextRegionFeature` (`"text-region"`) | none. It marks where text is, and it does not read it. |
| `IFXFaceFeature` (`"face"`) | `landmarks`, an optional record of named `GFXPoint`s |

`IFXFeatureKind` is the union of the four kind strings, and `IFXFeature` is the union of the four interfaces.

### Backends

`IFXAnalysisBackend` is the plug point: an `id`, a list of `capabilities` and `detect(raster, features, signal)`. A backend receives an `IFXAnalysisRaster` with `width`, `height`, `luminance` (a byte plane), `rgba` (bytes) and `mapPointToSource(point)`, a function that converts a raster coordinate back to the source image's coordinates. Backends must return features in source coordinates, which `mapPointToSource` makes possible even after cropping and rotating.

`IFXPortableAnalysisBackend` (`id: "portable-analysis"`) is the built-in backend. It provides `"rectangle"` and `"qr"` detection in plain JavaScript.

`IFXModelAnalysisBackend` (`id: "portable-model-analysis"`) adds `"face"` and `"text-region"` detection using small model assets that you supply. Pass it to the detector:

```text
new IFXModelAnalysisBackend({ backend?, face?, textRegion? })
```

| Option | Meaning |
| --- | --- |
| `backend` | The `IFXModelBackend` that loads assets. Defaults to `IFXPortableModelBackend`. |
| `face`, `textRegion` | An `IFXModelFeatureConfiguration` for each kind you want: `{ model, threshold, minimumPixels }`. |

`model` is an `IFXModelAsset` whose purpose matches (`"face-mask"` or `"text-region-mask"`) and that exposes one single-channel sigmoid head. `threshold` is a probability strictly between 0 and 1 above which a pixel counts. `minimumPixels` (1 to 2,097,152) discards regions smaller than that. The backend evaluates the model for every pixel and groups the pixels above the threshold into features.

`IFXAnalysisExecutionError` (with a `cause`) wraps a failure inside a backend, and `IFXUnsupportedAnalysisError` (with the `capability` name) reports a missing capability.

### Model assets

The portable model format is deliberately small and verifiable: a linear pixel model evaluated per pixel, with an integrity hash. It is not an interchange format for neural networks, and ImageFX does not accept Apple Core ML files.

`IFXModelAsset`:

| Field | Description |
| --- | --- |
| `format` | `"ifx-linear-pixel-v1"`. |
| `id`, `version` | The identity. |
| `purpose` | `"image"`, `"person-segmentation"`, `"saliency-map"`, `"face-mask"` or `"text-region-mask"` (`IFXModelPurpose`). |
| `provenance` | `{ source, license }`, required so you always know where a model came from. |
| `heads` | 1 to 16 output heads, each with `channels` (1 or 4) and `activation` (`"linear"` or `"sigmoid"`). |
| `data` | The weights as byte values. At most 65,536 values. |
| `sha256` | The hash of the data. The backend checks it before use and throws `IFXModelIntegrityError` on a mismatch. |
| `qualityLevel` | Optional `"fast"`, `"balanced"` or `"accurate"` (`IFXModelQualityLevel`). |

`IFXModelBackend` (`id`, `version` and `load(asset, context)`) turns an asset into an `IFXModelSession`, which evaluates one pixel: `evaluate([r, g, b, a], headIndex, softmaxNormalization?)` returns the head's outputs. `IFXPortableModelBackend` (`id: "portable-linear-pixel"`) is the built-in implementation. `IFXModelLoadContext.checkpoint()` lets a long load yield to the event loop. `IFXModelHeadDescriptor` and `IFXModelProvenance` describe parts of an asset.

The `coreMLModel`, `personSegmentation` and `saliencyMap` [filters](filters.md) run an asset over an image as part of a graph. Their names follow Core Image, and they take `IFXModelAsset`s.

## Barcodes

The barcode descriptors describe a code that the [generator filters](filters.md) draw. A descriptor validates its options when you create it and stores the encoded matrix, so a descriptor that constructs successfully always renders.

`IFXBarcodeDescriptor` is the abstract base. Every descriptor has `payloadKind` (`"data-codewords"` for QR, `"message"` for the others), `toData()` for a plain-data form, and the static `IFXBarcodeDescriptor.fromData(value)`, which validates plain data and rebuilds the right class.

Payloads are 1 to 4,096 bytes. A descriptor copies the bytes you give it, and reading `message` or `errorCorrectedPayload` returns a fresh copy.

| Class | Constructor | Options and ranges |
| --- | --- | --- |
| `IFXQRCodeDescriptor` | `(errorCorrectedPayload, symbolVersion, maskPattern, errorCorrectionLevel)` | `symbolVersion` 1 to 40, `maskPattern` 0 to 7, `errorCorrectionLevel` `"L"`, `"M"`, `"Q"` or `"H"` (`IFXQRCodeErrorCorrectionLevel`). The payload is the already error-corrected codeword sequence. To encode plain text, use the `qrCodeGenerator` filter, which takes a message. |
| `IFXAztecCodeDescriptor` | `(message, options)` | `correctionLevel` 5 to 95 (percent), `layers` 1 to 32 (1 to 4 when `compactStyle` is true), `compactStyle`, `quietSpace` 0 to 64 |
| `IFXPDF417CodeDescriptor` | `(message, options)` | `correctionLevel` 0 to 8, `dataColumns` 1 to 30, `rows` 3 to 90, `compactStyle`, `quietSpace` 0 to 64 |
| `IFXDataMatrixCodeDescriptor` | `(message, options)` | `rows` and `columns` from the ECC200 sizes (square from 10 by 10 to 144 by 144, and 8 by 18, 8 by 32, 12 by 26, 12 by 36, 16 by 36 and 16 by 48), `quietSpace` 0 to 64 |

A message descriptor also has `schemaVersion` (1) and `encoding` (`"binary-bytes"`). Constructors throw `RangeError` for an option out of range and `TypeError` for a bad shape.

`IFXBarcodeDescriptorData`, `IFXQRCodeDescriptorData`, `IFXAztecCodeDescriptorData`, `IFXPDF417CodeDescriptorData` and `IFXDataMatrixCodeDescriptorData` are the plain-data forms, and `IFXAztecCodeDescriptorOptions`, `IFXPDF417CodeDescriptorOptions` and `IFXDataMatrixCodeDescriptorOptions` are the option types. `IFXBarcodePayloadKind` is `"data-codewords" | "message"`.

```ts
import { IFXAztecCodeDescriptor, IFXFilter, IFXImage } from "@syndromatic/syncloudos/fx/image";

const descriptor = new IFXAztecCodeDescriptor(new TextEncoder().encode("Ticket 4821"), {
  correctionLevel: 23,
  layers: 4,
  compactStyle: true,
  quietSpace: 2,
});

// The generator filter takes the descriptor's plain data and takes no input images.
export const code: IFXImage = new IFXFilter("barcodeGenerator", { barcodeDescriptor: descriptor.toData() }).apply();
```

## Developing RAW photos

### `IFXRAWFilter`

Reads a camera RAW file and develops it into a linear floating-point image. The counterpart is `CIRAWFilter`. ImageFX includes a portable decoder for a bounded subset of DNG (Adobe Digital Negative) files, which is enough for uncompressed sensor data from many cameras and converters. Other RAW formats fall outside this subset and report `IFXRAWUnsupportedError` when you open them, so the application can fall back to the embedded preview or tell the user.

```text
new IFXRAWFilter(encoded: Uint8Array, backend?: IFXRAWBackend)
```

The constructor copies the bytes and inspects them straight away. It throws `IFXRAWDecodeError` for a corrupt file and `IFXRAWUnsupportedError` for one it cannot handle.

| Member | Description |
| --- | --- |
| `metadata` | An `IFXRAWMetadata` describing the capture. |
| `source` | `{ format: "dng", byteLength, sensorIFDOffset, embeddedPreviewCount }`. |
| `capabilities` | What the backend supports. |
| `develop(options?)` | Demosaics and colour-processes the sensor data, resolving with `{ image, metadata, provenance }`. |

`IFXRAWDevelopmentOptions`:

| Option | Range | Default | Meaning |
| --- | --- | --- | --- |
| `exposureEV` | -8 to +8 | 0 | Exposure compensation in stops. |
| `whiteBalance` | `"as-shot"` or `"none"` | `"as-shot"` | Apply the camera's white balance or leave the sensor's raw balance. |
| `signal` | | | An `AbortSignal`. |

`image` is a `GFXFloatImage` in linear sRGB with float32 samples. Feed it to `IFXImage.fromPixels()` and continue with filters. `provenance` records how it was made: the source was the `"sensor-plane"` (the embedded preview is never used), the demosaic algorithm was `"bilinear-bayer"`, orientation was applied, and which decoder ran.

### `IFXRAWMetadata`

A frozen description of the file. `IFXRAWMetadataDescriptor` is its constructor argument, with the same fields.

| Field | Description |
| --- | --- |
| `format` | `"dng"`. |
| `cameraModel` | The camera's name. |
| `sourceWidth`, `sourceHeight` | The sensor size. |
| `bitsPerSample` | 16. |
| `cfaPattern`, `cfaPlane` | The colour filter array layout: `"rggb"`, `"bggr"`, `"grbg"` or `"gbrg"` (`IFXRAWCFA`) and the colour of each site (`IFXRAWCFAColor`). |
| `blackLevel`, `whiteLevel` | The sensor's signal range. |
| `orientation` | `1`, `3`, `6` or `8` (`IFXRAWOrientation`). |
| `asShotNeutral`, `whiteBalanceGains` | The camera's white balance as three numbers each. |
| `colorMatrix1` | The camera-to-colour matrix. |
| `calibrationIlluminant` | `"D65"`. |
| `workingColourSpace`, `outputSampleFormat` | `"linear-srgb"` and `"float32"`. |
| `sensorIFDOffset`, `sensorPlaneByteCount`, `embeddedPreviewCount`, `hasLinearizationTable` | Details of the file structure. |
| `decoder` | `{ name, version, model }` of the decoder that read it. |

### Backends and errors

`IFXRAWBackend` is the interface (`capabilities`, `inspect(source)` and `develop(source, options)`). `IFXPortableDNGRAWBackend` is the built-in one. Its `IFXRAWBackendCapabilities` state the supported subset exactly: classic TIFF-based DNG in little-endian byte order, uncompressed 16-bit Bayer data, the four CFA patterns, orientations 1, 3, 6 and 8, output in linear sRGB as float32, inputs up to 128 MiB and outputs up to 32 MiB.

| Error | When | Fields |
| --- | --- | --- |
| `IFXRAWDecodeError` | The file is corrupt. | `code`: `"invalid-header"`, `"truncated"`, `"invalid-metadata"` or `"bounds"` |
| `IFXRAWUnsupportedError` | The file is valid but outside the supported subset. | `reason`: `"format"`, `"byte-order"`, `"compression"`, `"bits-per-sample"`, `"layout"`, `"cfa-pattern"`, `"camera-metadata"`, `"camera-opcodes"`, `"calibration-illuminant"` or `"orientation"`, and `cameraModel` |

`IFXRAWDecodeErrorCode`, `IFXRAWUnsupportedReason`, `IFXRAWDevelopmentProvenance`, `IFXRAWDevelopmentResult`, `IFXRAWOutputSampleFormat`, `IFXRAWWorkingColourSpace`, `IFXRAWDecoderDescriptor` and `IFXRAWSourceDescriptor` are the supporting types.

```ts
import { GFXFloatImage } from "@syndromatic/syncloudos/fx/graphics";
import { IFXFilter, IFXImage, IFXRAWFilter, IFXRAWUnsupportedError } from "@syndromatic/syncloudos/fx/image";

export async function developPhoto(dng: Uint8Array): Promise<IFXImage | null> {
  try {
    const raw = new IFXRAWFilter(dng);
    const { image } = await raw.develop({ exposureEV: 0.3, whiteBalance: "as-shot" });
    const developed: GFXFloatImage = image;
    return new IFXFilter("vibrance", { amount: 0.4 }).apply(IFXImage.fromPixels(developed));
  } catch (error) {
    if (error instanceof IFXRAWUnsupportedError) {
      console.warn(`This camera file is not supported (${error.reason}).`);
      return null;
    }
    throw error;
  }
}
```

## Related

- [ImageFX](../image.md)
- [Filter catalogue](filters.md)
- [Kernels and graph transport](kernels-and-graphs.md)
- [GraphicsFX](../graphics.md), for `GFXFloatImage` and the pixel types
