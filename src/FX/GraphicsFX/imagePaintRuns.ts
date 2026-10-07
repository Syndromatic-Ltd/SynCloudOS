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

import type { GFXDisplayList } from "./graphicsTypes";
import type { GFXCommand } from "./graphicsTypes";
import { GFXImage } from "./GFXImage";
import { GFXColour } from "./GFXColour";
export interface GFXImagePaintRun {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly css: string;
    readonly alpha: number;
}
export function assertImagePaintBudget(image: GFXImage): void {
    if (!(image instanceof GFXImage))
        throw new TypeError("Image paint requires GFXImage.");
    if (image.width * image.height > 65536)
        throw new RangeError("SVG pixel paint exceeds the 65536-pixel work limit.");
}
/** Portable vector runs avoid URL injection, external resources and a second pixel decode. */
export function imagePaintRuns(image: GFXImage, alphaOnly = false): readonly GFXImagePaintRun[] {
    assertImagePaintBudget(image);
    const runs: GFXImagePaintRun[] = [];
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            const c = image.pixel(x, y), colour = image.colourSpace === "display-p3" ? GFXColour.displayP3(c.r, c.g, c.b, c.a) : image.colourSpace === "linear-srgb" ? GFXColour.linearSRGB(c.r, c.g, c.b, c.a) : GFXColour.rgba(c.r, c.g, c.b, c.a);
            const css = alphaOnly ? "white" : colour.withAlpha(1).toCSS(), alpha = c.a;
            const previous = runs.at(-1);
            if (previous && previous.y === y && previous.css === css && previous.alpha === alpha) {
                runs[runs.length - 1] = { ...previous, width: previous.width + 1 };
            }
            else {
                runs.push({ x, y, width: 1, css, alpha });
            }
        }
    }
    return Object.freeze(runs.map(run => Object.freeze(run)));
}
/** Count every emitted definition, including repeated paints, before allocating SVG nodes. */
export function assertDisplayListImagePaintBudget(list: GFXDisplayList): void {
    const definitions = new Map<string, GFXImage>();
    let imageIndex = 0;
    const visit = (commands: readonly GFXCommand[]) => {
        for (const command of commands) {
            if (command.kind === "transparency-group") { visit(command.commands); continue; }
            if (command.kind === "image")
                definitions.set(`image:${imageIndex++}`, command.image);
            for (const paint of [command.state.fill, command.state.stroke])
                if (paint.kind === "pattern")
                    definitions.set(`pattern:${paint.id}`, paint.image);
            for (const mask of command.state.masks)
                definitions.set(`mask:${mask.id}`, mask.image);
        }
    };
    visit(list.commands);
    let pixels = 0;
    for (const image of definitions.values()) {
        pixels += image.width * image.height;
        if (pixels > 1048576)
            throw new RangeError("SVG image definitions exceed the one-megapixel work limit.");
    }
}
