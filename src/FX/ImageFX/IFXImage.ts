/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { ImageProcessor } from "./processing";
import { GFXImage, type GFXInterpolation } from "../GraphicsFX/GFXImage";
import { GFXFloatImage } from "../GraphicsFX/GFXFloatImage";
import { GFXColour } from "../GraphicsFX/GFXColour";
import { normalisePoint, normaliseAffineTransform, invertTransform, type GFXPoint, type GFXRect, type GFXAffineTransform } from "../GraphicsFX/GFXGeometry";
import { finiteExtent, infiniteExtent, cropExtent, unionExtent, transformedExtent, type IFXExtent } from "./extent";
let operationFactory: (inputs: readonly IFXImage[], processor: ImageProcessor) => IFXImage;
export function createProcessingImage(inputs: readonly IFXImage[], processor: ImageProcessor): IFXImage {
    inputs.forEach(imageNode);
    return operationFactory(inputs, processor);
}
export type ImageNode = Readonly<{
    kind: "operation";
    inputs: readonly IFXImage[];
    processor: ImageProcessor;
}> | Readonly<{
    kind: "pixels";
    pixels: GFXImage | GFXFloatImage;
    origin: GFXPoint;
}> | Readonly<{
    kind: "constant";
    colour: GFXColour;
}> | Readonly<{
    kind: "crop";
    input: IFXImage;
    rect: GFXRect;
}> | Readonly<{
    kind: "transform";
    input: IFXImage;
    transform: GFXAffineTransform;
    inverse: GFXAffineTransform;
    interpolation: GFXInterpolation;
}> | Readonly<{
    kind: "over";
    foreground: IFXImage;
    background: IFXImage;
}> | Readonly<{
    kind: "clamp";
    input: IFXImage;
}>;
const nodes = new WeakMap<IFXImage, ImageNode>();
export function imageNode(image: IFXImage): ImageNode {
    const node = nodes.get(image);
    if (!node)
        throw new TypeError("Authentic ImageFX graph required.");
    return node;
}
export class IFXImage {
    static {
        operationFactory = (inputs, processor) => new IFXImage(processor.extent, { kind: "operation", inputs: Object.freeze([...inputs]), processor: Object.freeze(processor) });
    }
    private constructor(readonly extent: IFXExtent, node: ImageNode) {
        nodes.set(this, Object.freeze(node));
        Object.freeze(this);
    }
    static fromPixels(pixels: GFXImage | GFXFloatImage, origin: GFXPoint = { x: 0, y: 0 }): IFXImage {
        if (!(pixels instanceof GFXImage) && !(pixels instanceof GFXFloatImage))
            throw new TypeError("Owned GraphicsFX pixels required.");
        const point = normalisePoint(origin);
        return new IFXImage(finiteExtent({ ...point, width: pixels.width, height: pixels.height }), { kind: "pixels", pixels, origin: point });
    }
    static constant(colour: GFXColour): IFXImage {
        if (!(colour instanceof GFXColour))
            throw new TypeError("GFXColour required.");
        return new IFXImage(infiniteExtent, { kind: "constant", colour });
    }
    cropped(rect: GFXRect): IFXImage {
        imageNode(this);
        const extent = cropExtent(this.extent, rect);
        return new IFXImage(extent, { kind: "crop", input: this, rect: extent.kind === "finite" ? extent.rect : rect });
    }
    transformed(transform: GFXAffineTransform, interpolation: GFXInterpolation = "linear"): IFXImage {
        imageNode(this);
        if (interpolation !== "nearest" && interpolation !== "linear")
            throw new TypeError("Unknown interpolation.");
        const t = normaliseAffineTransform(transform);
        return new IFXImage(transformedExtent(this.extent, t), { kind: "transform", input: this, transform: t, inverse: invertTransform(t), interpolation });
    }
    compositedOver(background: IFXImage): IFXImage {
        imageNode(this);
        imageNode(background);
        return new IFXImage(unionExtent(this.extent, background.extent), { kind: "over", foreground: this, background });
    }
    clampedToExtent(): IFXImage {
        imageNode(this);
        if (this.extent.kind !== "finite" || this.extent.rect.width <= 0 || this.extent.rect.height <= 0)
            throw new RangeError("Clamp requires nonempty finite extent.");
        return new IFXImage(infiniteExtent, { kind: "clamp", input: this });
    }
}
