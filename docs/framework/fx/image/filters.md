# ImageFX filter catalogue

ImageFX has 203 built-in filters in 15 categories. Apply one with `IFXFilter`, or list and create them through `IFXFilterRegistry`. Every filter takes a fixed number of images and returns a new lazy image. See [ImageFX](../image.md) for how graphs, extents and rendering work.

```ts
import { IFXFilter, IFXFilterRegistry, IFXImage } from "@syndromatic/syncloudos/fx/image";

const registry = new IFXFilterRegistry();
export const blurNames = registry.names("blur"); // ["bokehBlur", "boxBlur", ...]

export function soften(source: IFXImage) {
  return new IFXFilter("gaussianBlur", { sigma: 2 }).apply(source.clampedToExtent());
}
```

## Reading the tables

- **Images** is how many images `apply` takes, in the order the description gives. Generators take none.
- **Parameters** lists each name with its type. A trailing `?` marks an optional parameter, and an omitted optional parameter takes the default shown.
- A range such as `0 to 4` is what the filter accepts, and a value outside it throws `RangeError` when you construct the filter. The ranges come from the filter's validation.
- **colour** is a four-number tuple `[r, g, b, a]` with each value from 0 to 1. **point** is `{ x, y }`, and **rect** is `{ x, y, width, height }`, all in the graph's coordinate space. Angles are in radians.
- Filters that spread pixels, such as blurs, enlarge a finite extent. Call `clampedToExtent()` first to avoid transparent edges, and `cropped()` afterwards to restore the original size.
- Filters that name a second image (a mask, a texture, a palette) read it as the input after the first.
- Some parameters reproduce Core Image's contract and have no documented default there, so the ImageFX version marks them as required.

```ts
import { GFXImage } from "@syndromatic/syncloudos/fx/graphics";
import { IFXFilter, IFXImage } from "@syndromatic/syncloudos/fx/image";

export function stylise(pixels: GFXImage) {
  const source = IFXImage.fromPixels(pixels);
  const toned = new IFXFilter("colourControls", { saturation: 1.2, contrast: 1.1 }).apply(source);
  const warm = new IFXFilter("sepia", { intensity: 0.4 }).apply(toned);
  return new IFXFilter("vignette", { intensity: 0.6, radius: 1.5 }).apply(warm);
}
```

## Blur and denoise

Category `blur`. 14 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `bokehBlur` | 1 | `radius?` (number, 0 to 100, default 20); `ringAmount?` (number, 0 to 1, default 0); `ringSize?` (number, 0 to 1, default 0.1); `softness?` (number, 0 to 1, default 1) | Blurs with a disc-shaped kernel that has a bright ring, imitating an out-of-focus highlight. |
| `boxBlur` | 1 | `radius?` (number, 0 to 8, default 1) | Averages pixels in a square neighbourhood. |
| `discBlur` | 1 | `radius?` (number, 0 to 8, default 1) | Averages pixels in a circular neighbourhood. |
| `gaussianBlur` | 1 | `sigma?` (number, 0 to 4, default 1) | The standard smooth blur. Higher `sigma` blurs more. |
| `maskedVariableBlur` | 2 | `radius?` (number, 0 to 100, default 10) | Blurs by an amount that follows a grayscale mask, given as the second image. |
| `median` | 1 | none | Replaces each pixel with the median of its 3 by 3 neighbourhood, which removes speckle and keeps edges. |
| `morphologyGradient` | 1 | `radius?` (number, 0 to 8, default 1) | The difference between the maximum and minimum in a circular neighbourhood, which outlines edges. |
| `morphologyMaximum` | 1 | `radius?` (number, 0 to 8, default 1) | Grows bright areas (dilation) over a circular neighbourhood. |
| `morphologyMinimum` | 1 | `radius?` (number, 0 to 8, default 1) | Grows dark areas (erosion) over a circular neighbourhood. |
| `morphologyRectangleMaximum` | 1 | `width` (number, 0 to 63); `height` (number, 0 to 63) | Dilation over a rectangle. Sizes round to the nearest odd number of pixels. |
| `morphologyRectangleMinimum` | 1 | `width` (number, 0 to 63); `height` (number, 0 to 63) | Erosion over a rectangle. Sizes round to the nearest odd number of pixels. |
| `motionBlur` | 1 | `radius?` (number, 0 to 15, default 3); `angle?` (number, -6.2832 to 6.2832, default 0) | Blurs along a direction, as if the subject moved during exposure. |
| `noiseReduction` | 1 | `noiseLevel?` (number, 0 to 1, default 0.02); `sharpness?` (number, 0 to 4, default 0.4) | Smooths noise while trying to keep detail. A portable thresholded local filter. |
| `zoomBlur` | 1 | `center?` (point); `amount?` (number, 0 to 100, default 20) | Blurs radially away from a centre, like a fast zoom. |

## Sharpening

Category `sharpen`. 2 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `sharpenLuminance` | 1 | `sharpness?` (number, 0 to 4, default 0.4) | Sharpens luminance only. |
| `unsharpMask` | 1 | `sigma?` (number, 0 to 4, default 1); `intensity?` (number, 0 to 4, default 0.5) | Sharpens by subtracting a blurred copy. |

## Colour adjustment

Category `colourAdjustment`. 18 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `colorCrossPolynomial` | 1 | `redCoefficients` (number[]); `greenCoefficients` (number[]); `blueCoefficients` (number[]) | Maps each channel through a polynomial of all three input channels. |
| `colorCurves` | 1 | `colorSpace` (colour space); `curvesData` (number[]); `curvesDomain` ([number, number]) | Maps colours through per-channel curves given as sampled data, in a chosen colour space. |
| `colourAbsoluteDifference` | 2 | none | The absolute difference of two images, per channel. |
| `colourClamp` | 1 | `minimum?` (colour); `maximum?` (colour) | Clamps each channel between a minimum and a maximum colour. |
| `colourControls` | 1 | `saturation?` (number, 0 to 4, default 1); `brightness?` (number, -1 to 1, default 0); `contrast?` (number, 0 to 4, default 1) | Adjusts saturation, brightness and contrast. |
| `colourMatrix` | 1 | `matrix` (number[]); `bias?` (number[]) | Multiplies each pixel by a 4 by 4 matrix and adds a bias vector. |
| `colourPolynomial` | 1 | `red` (number[]); `green` (number[]); `blue` (number[]); `alpha?` (number[]) | Maps each channel through a polynomial of that channel. |
| `colourThresholdOtsu` | 1 | none | Thresholds the image at the level that the Otsu method chooses automatically. |
| `exposure` | 1 | `ev?` (number, -10 to 10, default 0) | Adjusts exposure in stops (EV). Positive values brighten. |
| `gamma` | 1 | `power?` (number, 0.01 to 10, default 1) | Applies a power curve to the colour channels. |
| `hueAdjust` | 1 | `angle?` (number, -6.2832 to 6.2832, default 0) | Rotates hues by an angle in radians. |
| `linearToSRGB` | 1 | none | Converts linear values to the sRGB transfer curve. |
| `sRGBToLinear` | 1 | none | Converts sRGB values to linear. |
| `temperatureAndTint` | 1 | `neutral?` (point); `targetNeutral?` (point) | White balance. `neutral` and `targetNeutral` hold a colour temperature in kelvin (x) and a tint (y). |
| `threshold` | 1 | `threshold?` (number, 0 to 1, default 0.5) | Turns pixels black or white around a luminance level. |
| `toneCurve` | 1 | `point0?` (point); `point1?` (point); `point2?` (point); `point3?` (point); `point4?` (point); `extrapolate?` (boolean, default false) | Maps luminance through a curve defined by five control points. |
| `vibrance` | 1 | `amount` (number, -4 to 4) | Boosts the saturation of muted colours more than saturated ones. |
| `whitePointAdjust` | 1 | `colour` (colour) | Scales colours so that the given colour becomes white. |

## Colour effects

Category `colourEffect`. 31 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `colorCubeWithColorSpace` | 1 | `cubeDimension` (number); `cubeData` (number[]); `colorSpace` (colour space); `extrapolate` (boolean) | Applies a 3D lookup table in a chosen colour space. |
| `colorCubesMixedWithMask` | 2 | `cubeDimension` (number); `cube0Data` (number[]); `cube1Data` (number[]); `colorSpace` (colour space); `extrapolate` (boolean) | Blends two 3D lookup tables by a mask, the second image. |
| `colourCube` | 1 | `cubeDimension?` (number); `cubeData` (number[]); `extrapolate?` (boolean) | Applies a 3D lookup table. `cubeData` holds `cubeDimension` cubed RGBA entries. |
| `colourMap` | 2 | none | Maps luminance through a gradient image, the second input. |
| `convertLabToRGB` | 1 | `normalize` (true) | Converts normalised CIELAB values to RGB. |
| `convertRGBtoLab` | 1 | `normalize` (true) | Converts RGB to normalised CIELAB values. |
| `dither` | 1 | `intensity` (number, 0 to 1) | Adds noise to break up banding. |
| `documentEnhancer` | 1 | `amount` (number, 0 to 4) | Brightens paper and increases contrast in a scan of a document. |
| `falseColour` | 1 | `colour0?` (colour); `colour1?` (colour) | Maps luminance between two colours. |
| `invert` | 1 | none | Inverts the colour channels. |
| `labDeltaE` | 2 | none | The CIELAB colour difference between two images. |
| `maskToAlpha` | 1 | none | Turns a grayscale mask into alpha. |
| `maximumComponent` | 1 | none | Sets each pixel to gray at its largest colour component. |
| `minimumComponent` | 1 | none | Sets each pixel to gray at its smallest colour component. |
| `monochrome` | 1 | `colour?` (colour); `intensity?` (number, 0 to 1, default 1) | Tints a grayscale rendering with one colour. |
| `paletteCentroid` | 2 | `perceptual` (boolean) | Finds the mean colour of a palette image, given a second image of the palette. |
| `palettize` | 2 | `perceptual` (boolean) | Replaces each colour with the nearest colour in a palette image, the second input. |
| `photoEffectChrome` | 1 | `extrapolate` (boolean) | A vivid, high-contrast photo look. |
| `photoEffectFade` | 1 | `extrapolate` (boolean) | A faded, low-contrast photo look. |
| `photoEffectInstant` | 1 | `extrapolate` (boolean) | An instant-print photo look. |
| `photoEffectMono` | 1 | `extrapolate` (boolean) | A monochrome photo look. |
| `photoEffectNoir` | 1 | `extrapolate` (boolean) | A high-contrast black and white look. |
| `photoEffectProcess` | 1 | `extrapolate` (boolean) | A cross-processed photo look. |
| `photoEffectTonal` | 1 | `extrapolate` (boolean) | A gentler black and white look. |
| `photoEffectTransfer` | 1 | `extrapolate` (boolean) | A warm, transferred-print photo look. |
| `posterize` | 1 | `levels?` (number, 3 to 255, default 6) | Reduces each channel to a number of levels. |
| `sepia` | 1 | `intensity?` (number, 0 to 1, default 1) | A warm brown monochrome tone. |
| `thermal` | 1 | none | A false-colour thermal imaging look. |
| `vignette` | 1 | `intensity` (number, -4 to 4); `radius` (number, 0.001 to 100000) | Darkens the edges of the image. `intensity` and `radius` are required. |
| `vignetteEffect` | 1 | `center` (point); `falloff` (number, 0.001 to 100000); `intensity` (number, -4 to 4); `radius` (number, 0 to 100000) | A vignette with an explicit centre and falloff. |
| `xRay` | 1 | none | A false-colour negative that resembles an X-ray. |

## Compositing and blending

Category `composite`. 15 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `blend` | 2 | `mode` (IFXBlendMode) | Blends a foreground over a background, given as the two inputs, with one of the modes in `IFXBlendMode`. |
| `colourBlendMode` | 2 | none | Takes the hue and saturation of the foreground and the luminance of the background. |
| `divideBlendMode` | 2 | none | Divides the background by the foreground. |
| `hueBlendMode` | 2 | none | Takes the hue of the foreground with the saturation and luminance of the background. |
| `linearBurnBlendMode` | 2 | none | Darkens the background by the foreground, linearly. |
| `linearDodgeBlendMode` | 2 | none | Brightens the background by the foreground, linearly. |
| `linearLightBlendMode` | 2 | none | Combines linear burn and linear dodge according to the foreground. |
| `luminosityBlendMode` | 2 | none | Takes the luminance of the foreground with the hue and saturation of the background. |
| `maximumCompositing` | 2 | none | Keeps the larger value of each channel. |
| `minimumCompositing` | 2 | none | Keeps the smaller value of each channel. |
| `multiplyCompositing` | 2 | none | Multiplies the images, per channel. |
| `pinLightBlendMode` | 2 | none | Replaces colours by the foreground in a range set by the foreground. |
| `saturationBlendMode` | 2 | none | Takes the saturation of the foreground with the hue and luminance of the background. |
| `subtractBlendMode` | 2 | none | Subtracts the foreground from the background. |
| `vividLightBlendMode` | 2 | none | Combines colour burn and colour dodge according to the foreground. |

## Convolution

Category `convolution`. 1 filter.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `convolution` | 1 | `width` (number); `height` (number); `weights` (number[]); `bias?` (number); `rgbOnly?` (boolean) | Convolves with a kernel you supply as `width`, `height` and `weights` (up to 81 values). |

## Distortion

Category `distortion`. 14 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `bumpDistortion` | 1 | `center?` (point); `radius?` (number, 0 to 100000, default 300); `scale?` (number, -1 to 1, default 0.5) | Pushes a circular region outward or inward like a lens bump. |
| `bumpDistortionLinear` | 1 | `center?` (point); `radius?` (number, 0 to 100000, default 300); `angle?` (number, -402.1239 to 402.1239, default 0); `scale?` (number, -1 to 1, default 0.5) | A bump along a line at an angle. |
| `circleSplashDistortion` | 1 | `center?` (point); `radius?` (number, 0 to 100000, default 150) | Distorts pixels from a circle outward into a radial splash. |
| `circularWrap` | 1 | `center` (point); `radius` (number, 0 to 100000); `angle` (number, -402.1239 to 402.1239) | Wraps the image around a circle. |
| `displacement` | 2 | `scale?` (number, -1000 to 1000, default 50) | Moves pixels by the values of a displacement image, the second input. |
| `droste` | 1 | `insetPoint0` (point); `insetPoint1` (point); `periodicity` (number); `rotation` (number); `strands` (number); `zoom` (number) | An infinitely recursive spiral picture in picture. |
| `glassDistortion` | 2 | `center` (point); `scale` (number, -10000 to 10000) | Distorts through a glass texture, the second input. |
| `glassLozenge` | 1 | `point0` (point); `point1` (point); `radius` (number, 0 to 100000); `refraction` (number, 0.05 to 8) | A lozenge-shaped glass lens between two points. |
| `holeDistortion` | 1 | `center?` (point); `radius?` (number, 0 to 100000, default 150) | Pulls a circular hole into the image. |
| `lightTunnel` | 1 | `center` (point); `radius` (number, 0 to 100000); `rotation` (number, -402.1239 to 402.1239) | A rotating tunnel of light. |
| `pinchDistortion` | 1 | `center?` (point); `radius?` (number, 0 to 100000, default 300); `scale?` (number, -1 to 1, default 0.5) | Pinches pixels toward a centre. |
| `torusLensDistortion` | 1 | `center` (point); `radius` (number, 0 to 100000); `width` (number, 0 to 100000); `refraction` (number, 0.05 to 8) | A ring-shaped lens. |
| `twirl` | 1 | `center?` (point); `radius?` (number, 0.001 to 100000, default 300); `angle?` (number, -12.5664 to 12.5664, default 3.1416) | Rotates pixels around a centre by an angle that fades with distance. |
| `vortexDistortion` | 1 | `center?` (point); `radius?` (number, 0 to 100000, default 300); `angle?` (number, -402.1239 to 402.1239, default 56.55) | A strong swirl that rotates pixels within a radius. |

## Geometry and scaling

Category `geometry`. 16 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `bicubicScaleTransform` | 1 | `scale` (number, 0.25 to 4); `aspectRatio` (number, 0.25 to 4); `parameterB` (number, -2 to 2); `parameterC` (number, -2 to 2) | Scales with a bicubic filter whose `parameterB` and `parameterC` you choose. |
| `depthToDisparity` | 1 | `focalLength` (number, 0 to 1000000); `baseline` (number, 0 to 1000000); `depthScale` (number, 0 to 1000000000); `disparityScale` (number, 0 to 1000000000) | Converts depth samples to disparity, given camera calibration. |
| `disparityToDepth` | 1 | `focalLength` (number, 0 to 1000000); `baseline` (number, 0 to 1000000); `depthScale` (number, 0 to 1000000000); `disparityScale` (number, 0 to 1000000000) | Converts disparity samples to depth, given camera calibration. |
| `edgePreserveUpsample` | 2 | `spatialSigma` (number, 0.05 to 4); `lumaSigma` (number, 0.001 to 2) | Upsamples a low-resolution colour image (second input) guided by a high-resolution image (first input). |
| `keystoneCorrectionCombined` | 1 | `topLeft` (point); `topRight` (point); `bottomRight` (point); `bottomLeft` (point); `focalLength` (number) | Corrects horizontal and vertical keystone distortion. |
| `keystoneCorrectionHorizontal` | 1 | `topLeft` (point); `topRight` (point); `bottomRight` (point); `bottomLeft` (point); `focalLength` (number) | Corrects horizontal keystone distortion. |
| `keystoneCorrectionVertical` | 1 | `topLeft` (point); `topRight` (point); `bottomRight` (point); `bottomLeft` (point); `focalLength` (number) | Corrects vertical keystone distortion. |
| `lanczosScale` | 1 | `scale?` (number, 0.25 to 4, default 1); `aspectRatio?` (number, 0.25 to 4, default 1) | High-quality scaling with a Lanczos filter. |
| `ninePartStretched` | 1 | `breakpoint0` (point); `breakpoint1` (point); `growAmount` (point) | Stretches the centre of a nine-part image and keeps its corners and edges. |
| `ninePartTiled` | 1 | `breakpoint0` (point); `breakpoint1` (point); `growAmount` (point); `flipYTiles` (boolean) | Tiles the centre of a nine-part image. |
| `perspectiveCorrection` | 1 | `topLeft` (point); `topRight` (point); `bottomRight` (point); `bottomLeft` (point); `crop` (boolean) | Maps four corners to a rectangle, flattening a photographed page. |
| `perspectiveRotate` | 1 | `focalLength` (number, 0 to 1000000); `pitch` (number, -1.4 to 1.4); `roll` (number, -3.1416 to 3.1416); `yaw` (number, -1.4 to 1.4) | Rotates the view in 3D by pitch, roll and yaw. |
| `perspectiveTransform` | 1 | `topLeft?` (point); `topRight?` (point); `bottomRight?` (point); `bottomLeft?` (point); `extent?` (rect) | Maps the image onto four corner points. |
| `perspectiveTransformWithExtent` | 1 | `topLeft?` (point); `topRight?` (point); `bottomRight?` (point); `bottomLeft?` (point); `extent` (rect) | The same, restricted to a source region. |
| `straighten` | 1 | `angle?` (number, -3.1416 to 3.1416, default 0) | Rotates by an angle and resizes to fit. |
| `stretchCrop` | 1 | `size` (point); `cropAmount` (number, 0 to 1); `centerStretchAmount` (number, 0 to 1) | Crops and stretches to a target size. |

## Gradients

Category `gradient`. 5 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `gaussianGradient` | 0 | `center?` (point); `radius?` (number, 0.001 to 100000, default 300); `colour0?` (colour); `colour1?` (colour) | A radial gradient with a Gaussian falloff. |
| `hueSaturationValueGradient` | 0 | `colorSpace` (colour space); `dither` (number); `radius` (number); `softness` (number); `value` (number) | A colour wheel gradient of hue and saturation. |
| `linearGradient` | 0 | `point0?` (point); `point1?` (point); `colour0?` (colour); `colour1?` (colour) | A gradient between two points. |
| `radialGradient` | 0 | `center?` (point); `radius0?` (number, 0 to 100, default 5); `radius1?` (number, 5 to 100000, default 100); `colour0?` (colour); `colour1?` (colour) | A gradient between two radii. |
| `smoothLinearGradient` | 0 | `point0?` (point); `point1?` (point); `colour0?` (colour); `colour1?` (colour) | A linear gradient with a smooth curve. |

## Generators

Category `generator`. 18 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `attributedTextImage` | 0 | `text` (string); `scaleFactor` (number); `padding` (number); `extent` (rect); `paths` ((GFXPathCommand[])[]) | An image of attributed text. Created by `createIFXAttributedTextImage`. |
| `aztecCodeGenerator` | 0 | `message` (number[]); `correctionLevel` (number); `layers` (number); `compactStyle` (boolean); `quietSpace` (number) | An Aztec code from a byte message. |
| `barcodeGenerator` | 0 | `barcodeDescriptor` (IFXBarcodeDescriptorData) | A barcode from an `IFXBarcodeDescriptor`. |
| `blurredRectangle` | 0 | `color` (colour); `extent` (rect); `sigma` (number, 0 to 1000) | A rectangle with a Gaussian-blurred edge, useful for shadows. |
| `checkerboard` | 0 | `center?` (point); `width?` (number, 0.001 to 100000, default 80); `colour0?` (colour); `colour1?` (colour) | A two-colour checkerboard. |
| `code128BarcodeGenerator` | 0 | `message` (number[]); `barcodeHeight` (number); `quietSpace` (number) | A Code 128 barcode from a byte message. |
| `dataMatrixCodeGenerator` | 0 | `message` (number[]); `rows` (number); `columns` (number); `quietSpace` (number) | A Data Matrix code from a byte message. |
| `lenticularHalo` | 0 | `center` (point); `color` (colour); `haloOverlap` (number, 0 to 1); `haloRadius` (number, 0 to 10000); `haloWidth` (number, 0 to 10000); `striationContrast` (number, 0 to 1000); `striationStrength` (number, 0 to 1); `time` (number, 0 to 1) | A halo of light with striations. |
| `mesh` | 0 | `color` (colour); `mesh` (GFXPoint[]); `width` (number) | A mesh of line segments given as point pairs. |
| `pdf417BarcodeGenerator` | 0 | `message` (number[]); `correctionLevel` (number); `dataColumns` (number); `rows` (number); `compactStyle` (boolean); `quietSpace` (number) | A PDF417 code from a byte message. |
| `qrCodeGenerator` | 0 | `message` (number[]); `correctionLevel` (IFXQRCodeErrorCorrectionLevel) | A QR code from a byte message. |
| `random` | 0 | `seed?` (number, 0 to 4294967295, default 0) | Seeded random noise. |
| `roundedRectangle` | 0 | `rect` (rect); `radius?` (number, 0 to 100000, default 10); `colour?` (colour) | A filled rounded rectangle. |
| `roundedRectangleStroke` | 0 | `color` (colour); `extent` (rect); `radius` (number, 0 to 10000); `width` (number, 0 to 10000); `smoothness` (number, 0 to 1000) | The outline of a rounded rectangle. |
| `starShine` | 0 | `center` (point); `color` (colour); `crossAngle` (number, -10000 to 10000); `crossOpacity` (number, 0 to 1); `crossScale` (number, 0 to 10000); `crossWidth` (number, 0 to 10000); `epsilon` (number, 0 to 1); `radius` (number, 0 to 10000) | A star-shaped flare. |
| `stripes` | 0 | `center?` (point); `width?` (number, 0.001 to 100000, default 80); `colour0?` (colour); `colour1?` (colour) | Two-colour stripes. |
| `sunbeams` | 0 | `center` (point); `color` (colour); `maxStriationRadius` (number, 0 to 10000); `striationContrast` (number, 0 to 1000); `striationStrength` (number, 0 to 1); `sunRadius` (number, 0 to 10000); `time` (number, 0 to 1) | Rays radiating from a sun. |
| `textImage` | 0 | `text` (string); `fontName` (string); `fontSize` (number); `scaleFactor` (number); `padding` (number); `extent` (rect); `paths` ((GFXPathCommand[])[]) | An image of text. Created by `createIFXTextImage`. |

## Halftones

Category `halftone`. 5 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `circularScreen` | 1 | `center?` (point); `width?` (number, 0.1 to 100000, default 6) | A circular halftone screen. |
| `cmykHalftone` | 1 | `angle` (number, -10000 to 10000); `center` (point); `grayComponentReplacement` (number, 0 to 1); `sharpness` (number, 0 to 1); `underColorRemoval` (number, 0 to 1); `width` (number, 0 to 10000) | A CMYK halftone pattern. |
| `dotScreen` | 1 | `center?` (point); `width?` (number, 0.1 to 100000, default 6); `angle?` (number, -6.2832 to 6.2832, default 0) | A dot halftone pattern. |
| `hatchedScreen` | 1 | `angle` (number, -10000 to 10000); `center` (point); `sharpness` (number, 0 to 1); `width` (number, 0 to 10000) | A hatched halftone pattern. |
| `lineScreen` | 1 | `center?` (point); `width?` (number, 0.1 to 100000, default 6); `angle?` (number, -6.2832 to 6.2832, default 0) | A line halftone pattern. |

## Reductions

Category `reduction`. 13 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `areaAverage` | 1 | `extent` (rect) | The average colour of a region, as a single pixel. |
| `areaHistogram` | 1 | `extent` (rect); `bins?` (number, 2 to 256, default 256) | A histogram of a region as a row of bins. |
| `areaLogarithmicHistogram` | 1 | `extent` (rect); `count?` (number, 2 to 256, default 64); `minimumStop?` (number, -32 to 4, default -10); `maximumStop?` (number, -10 to 32, default 4); `scale?` (number, 0 to 1, default 1) | A histogram over a logarithmic range of stops. |
| `areaMaximum` | 1 | `extent` (rect) | The maximum colour of a region. |
| `areaMaximumAlpha` | 1 | `extent` (rect) | The pixel with the highest alpha in a region. |
| `areaMinMax` | 1 | `extent` (rect) | The minimum and maximum pixel values of a region. |
| `areaMinMaxRed` | 1 | `extent` (rect) | The minimum and maximum of the red channel of a region. |
| `areaMinimum` | 1 | `extent` (rect) | The minimum colour of a region. |
| `areaMinimumAlpha` | 1 | `extent` (rect) | The pixel with the lowest alpha in a region. |
| `columnAverage` | 1 | `extent` (rect) | The average of each column of a region, as a row. |
| `histogramDisplay` | 1 | `height?` (number, 25 to 65525, default 100); `highLimit?` (number, 0 to 1, default 1); `lowLimit?` (number, 0 to 1, default 0) | Draws a histogram image (from `areaHistogram`) as a graph. |
| `kMeans` | 2 | `count` (number, 1 to 64); `passes` (number, 1 to 32); `perceptual` (boolean) | Clusters colours around a set of initial means, the second input as a one-row image. |
| `rowAverage` | 1 | `extent` (rect) | The average of each row of a region, as a column. |

## Stylising

Category `stylize`. 24 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `blendWithMask` | 3 | `channel?` ("luminance" | "alpha" | "red" | "blue") | Blends a foreground over a background through a mask. Inputs are foreground, background and mask. |
| `bloom` | 1 | `intensity` (number, 0 to 4); `radius` (number, 0 to 1000) | Softens and glows the bright areas. |
| `cannyEdgeDetector` | 1 | `gaussianSigma?` (number, 0 to 10, default 1.6); `perceptual?` (boolean, default false); `thresholdLow?` (number, 0 to 0.05, default 0.02); `thresholdHigh?` (number, 0.02 to 1, default 0.05); `hysteresisPasses?` (number, 0 to 20, default 1) | Detects thin edges with hysteresis thresholds. |
| `comicEffect` | 1 | none | A comic-book look with outlines. |
| `coreMLModel` | 1 | `model` (IFXModelAsset); `headIndex` (number); `softmaxNormalization` (boolean) | Runs a portable model asset over the image. It does not accept Apple Core ML files. |
| `crystallize` | 1 | `center` (point); `radius` (number, 0 to 10000); `seed` (number, -2147483647 to 2147483647) | Turns the image into polygonal crystals. Needs an explicit `seed`. |
| `depthOfField` | 1 | `point0` (point); `point1` (point); `radius` (number, 0 to 1000); `saturation` (number, 0 to 4); `unsharpMaskIntensity` (number, 0 to 4); `unsharpMaskRadius` (number, 0 to 1000) | Blurs outside a focus band between two points. |
| `edgeWork` | 1 | `radius` (number, 0 to 1000) | A woodcut look of thick edges. |
| `edges` | 1 | `intensity?` (number, 0 to 10, default 1) | Highlights edges. |
| `gaborGradients` | 1 | none | Gradients of a Gabor filter response. |
| `gloom` | 1 | `intensity` (number, 0 to 4); `radius` (number, 0 to 1000) | Dulls the highlights. |
| `heightFieldFromMask` | 1 | `radius` (number, 0 to 1000) | Builds a height field from a mask. |
| `hexagonalPixellate` | 1 | `center` (point); `scale` (number, 0 to 10000) | Pixellates with hexagons. |
| `highlightShadowAdjust` | 1 | `highlightAmount` (number, 0 to 1); `radius` (number, 0 to 1000); `shadowAmount` (number, 0 to 1) | Recovers highlight and shadow detail. |
| `lineOverlay` | 1 | `nrNoiseLevel` (number, 0 to 1); `nrSharpness` (number, 0 to 4); `contrast` (number, 0 to 4); `edgeIntensity` (number, 0 to 4); `threshold` (number, 0 to 1) | A line drawing of the edges. |
| `mix` | 2 | `amount` (number, 0 to 1) | Mixes two images. Input 0 is the foreground and input 1 the background. |
| `personSegmentation` | 1 | `model` (IFXModelAsset); `qualityLevel` (IFXModelQualityLevel) | Produces a mask of people, using a model asset. |
| `pixellate` | 1 | `center?` (point); `scale?` (number, 1 to 100000, default 8) | Replaces blocks with their average colour. |
| `pointillize` | 1 | `center` (point); `radius` (number, 0 to 10000); `seed` (number, -2147483647 to 2147483647) | Turns the image into dots. Needs an explicit `seed`. |
| `saliencyMap` | 1 | `model` (IFXModelAsset) | Produces a map of visually prominent regions, using a model asset. |
| `shadedMaterial` | 2 | `scale` (number, 0 to 16) | Shades the image with a height image, the second input. |
| `sobelGradients` | 1 | none | The horizontal and vertical Sobel gradients. |
| `spotColor` | 1 | `centerColor1` (colour); `centerColor2` (colour); `centerColor3` (colour); `closeness1` (number, 0 to 2); `closeness2` (number, 0 to 2); `closeness3` (number, 0 to 2); `contrast1` (number, 0.01 to 16); `contrast2` (number, 0.01 to 16); `contrast3` (number, 0.01 to 16); `replacementColor1` (colour); `replacementColor2` (colour); `replacementColor3` (colour) | Replaces up to three selected colours. |
| `spotLight` | 1 | `brightness` (number); `color` (colour); `concentration` (number); `lightPointsAt` ([number, number, number]); `lightPosition` ([number, number, number]) | Lights the image with a spot light in 3D. |

## Tiling

Category `tile`. 16 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `affineClamp` | 1 | `transform?` (GFXAffineTransform) | Applies a transform and extends the edges to infinity. |
| `affineTile` | 1 | `transform?` (GFXAffineTransform) | Applies a transform and tiles the result. |
| `eightfoldReflectedTile` | 1 | `angle` (number, -402.1239 to 402.1239); `center` (point); `width` (number, 0 to 1000000) | Tiles with eight reflected copies. |
| `fourfoldReflectedTile` | 1 | `acuteAngle` (number, 0.0001 to 3.1415); `angle` (number, -402.1239 to 402.1239); `center` (point); `width` (number, 0 to 1000000) | Tiles with four reflected copies. |
| `fourfoldRotatedTile` | 1 | `angle` (number, -402.1239 to 402.1239); `center` (point); `width` (number, 0 to 1000000) | Tiles with four rotated copies. |
| `fourfoldTranslatedTile` | 1 | `acuteAngle` (number, 0.0001 to 3.1415); `angle` (number, -402.1239 to 402.1239); `center` (point); `width` (number, 0 to 1000000) | Tiles with four translated copies. |
| `glideReflectedTile` | 1 | `angle` (number, -402.1239 to 402.1239); `center` (point); `width` (number, 0 to 1000000) | Tiles with glide reflections. |
| `kaleidoscope` | 1 | `angle` (number, -402.1239 to 402.1239); `center` (point); `count` (number, 1 to 128) | A kaleidoscope with `count` mirrors. |
| `opTile` | 1 | `angle` (number, -402.1239 to 402.1239); `center` (point); `scale` (number, -16 to 16); `width` (number, 0 to 1000000) | An op-art style tile. |
| `parallelogramTile` | 1 | `acuteAngle` (number, 0.0001 to 3.1415); `angle` (number, -402.1239 to 402.1239); `center` (point); `width` (number, 0 to 1000000) | Tiles a parallelogram. |
| `perspectiveTile` | 1 | `topLeft` (point); `topRight` (point); `bottomRight` (point); `bottomLeft` (point) | Tiles with a perspective transform. |
| `sixfoldReflectedTile` | 1 | `angle` (number, -402.1239 to 402.1239); `center` (point); `width` (number, 0 to 1000000) | Tiles with six reflected copies. |
| `sixfoldRotatedTile` | 1 | `angle` (number, -402.1239 to 402.1239); `center` (point); `width` (number, 0 to 1000000) | Tiles with six rotated copies. |
| `triangleKaleidoscope` | 1 | `decay` (number, 0 to 16); `point` (point); `rotation` (number, -402.1239 to 402.1239); `size` (number, 0 to 1000000) | A kaleidoscope built from a triangle. |
| `triangleTile` | 1 | `angle` (number, -402.1239 to 402.1239); `center` (point); `width` (number, 0 to 1000000) | Tiles a triangle. |
| `twelvefoldReflectedTile` | 1 | `angle` (number, -402.1239 to 402.1239); `center` (point); `width` (number, 0 to 1000000) | Tiles with twelve reflected copies. |

## Transitions

Category `transition`. 11 filters.

| Filter | Images | Parameters | What it does |
| --- | --- | --- | --- |
| `accordionFold` | 2 | `time` (number, 0 to 1); `bottomHeight` (number, 0 to 1000000); `foldShadowAmount` (number, 0 to 1); `numberOfFolds` (number, 1 to 128) | Folds like an accordion between two images. |
| `barsSwipe` | 2 | `time` (number, 0 to 1); `angle` (number, -402.1239 to 402.1239); `barOffset` (number, -1000000 to 1000000); `width` (number, 0 to 1000000) | Sweeps in bars. |
| `copyMachine` | 2 | `time` (number, 0 to 1); `angle` (number, -402.1239 to 402.1239); `color` (colour); `extent` (rect); `opacity` (number, 0 to 1); `width` (number, 0 to 1000000) | A copier light bar that sweeps across. |
| `disintegrateWithMask` | 3 | `time` (number, 0 to 1); `shadowDensity` (number, 0 to 1); `shadowOffset` (point); `shadowRadius` (number, 0 to 1000000) | Disintegrates one image into another through a mask (input 2). |
| `dissolve` | 2 | `time?` (number, 0 to 1, default 0) | A cross-dissolve between two images. |
| `flash` | 2 | `time` (number, 0 to 1); `center` (point); `color` (colour); `extent` (rect); `fadeThreshold` (number, 0 to 1); `maxStriationRadius` (number, 0 to 1000000); `striationContrast` (number, 0 to 1000); `striationStrength` (number, 0 to 1) | A flash of light between two images. |
| `mod` | 2 | `time` (number, 0 to 1); `angle` (number, -402.1239 to 402.1239); `center` (point); `compression` (number, 0 to 1000000); `radius` (number, 0 to 1000000) | A modulated transition. |
| `pageCurl` | 4 | `time` (number, 0 to 1); `angle` (number, -402.1239 to 402.1239); `extent` (rect); `radius` (number, 0 to 1000000) | Curls a page. The backside and shading images are inputs 2 and 3. |
| `pageCurlWithShadow` | 3 | `time` (number, 0 to 1); `angle` (number, -402.1239 to 402.1239); `extent` (rect); `radius` (number, 0 to 1000000); `shadowAmount` (number, 0 to 1); `shadowExtent` (rect); `shadowSize` (number, 0 to 1000000) | A page curl with a shadow. The backside image is input 2. |
| `ripple` | 3 | `time` (number, 0 to 1); `center` (point); `extent` (rect); `scale` (number, -1000000 to 1000000); `width` (number, 0 to 1000000) | A ripple that reveals the second image, with a shading image as input 2. |
| `swipe` | 2 | `time?` (number, 0 to 1, default 0); `angle?` (number, -6.2832 to 6.2832, default 0); `width?` (number, 0 to 100000, default 0) | Wipes from one image to another. |

## Related

- [ImageFX](../image.md)
- [Kernels and graph transport](kernels-and-graphs.md), for filters you define yourself
- [Analysis and RAW](analysis-and-raw.md), for the generators' barcode descriptors
