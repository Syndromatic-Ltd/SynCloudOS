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

/** A normalized, separable Gaussian truncated at three standard deviations. */
function gaussian(sigma: number): Float32Array {
    if (sigma === 0)
        return new Float32Array([1]);
    const radius = Math.ceil(sigma * 3);
    const weights = new Float32Array(radius * 2 + 1);
    let total = 0;
    for (let offset = -radius; offset <= radius; offset++) {
        const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
        weights[offset + radius] = weight;
        total += weight;
    }
    for (let index = 0; index < weights.length; index++)
        weights[index] /= total;
    return weights;
}
function filterAxis(source: Float32Array, width: number, height: number, horizontal: boolean, radius: number, weights: Float32Array | null): Float32Array {
    if (radius === 0)
        return source;
    const output = new Float32Array(source.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let result = 0;
            for (let offset = -radius; offset <= radius; offset++) {
                const sx = horizontal ? x + offset : x;
                const sy = horizontal ? y : y + offset;
                const value = sx < 0 || sy < 0 || sx >= width || sy >= height ? 0 : source[sy * width + sx]!;
                result = weights ? result + value * weights[offset + radius]! : Math.max(result, value);
            }
            output[y * width + x] = result;
        }
    }
    return output;
}
/** Rectangular morphological spread followed by normalized Gaussian blur. Caller enforces work/allocation budgets. */
export function filterShadowAlpha(source: Float32Array, width: number, height: number, spread: number, sigma: number): Float32Array {
    let result = filterAxis(source, width, height, true, spread, null);
    result = filterAxis(result, width, height, false, spread, null);
    const weights = gaussian(sigma);
    const radius = (weights.length - 1) / 2;
    result = filterAxis(result, width, height, true, radius, weights);
    return filterAxis(result, width, height, false, radius, weights);
}
export function sampleShadowAlpha(source: Float32Array, width: number, height: number, x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const at = (sx: number, sy: number) => sx < 0 || sy < 0 || sx >= width || sy >= height ? 0 : source[sy * width + sx]!;
    return at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy) + at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
}
