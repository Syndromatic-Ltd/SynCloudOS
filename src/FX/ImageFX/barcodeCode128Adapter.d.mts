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

export interface Code128RenderOptions {
    readonly bcid: "code128";
    readonly text: string;
    readonly binarytext: true;
    readonly includetext: false;
    readonly scale: 1;
    readonly height: 1;
}

export interface Code128DrawingContext<T> {
    setopts?(options: Code128RenderOptions): void;
    scale(sx: number, sy: number): [number, number] | null;
    measure(text: string, font: string, width: number, height: number): { width: number; ascent: number; descent: number };
    init(width: number, height: number): void;
    line(x0: number, y0: number, x1: number, y1: number, lineWidth: number, rgb: string): void;
    polygon(points: Array<[number, number]>): void;
    hexagon(points: [[number, number], [number, number], [number, number], [number, number], [number, number]]): void;
    ellipse(x: number, y: number, radiusX: number, radiusY: number, counterClockwise: boolean): void;
    fill(rgb: string): void;
    text(x: number, y: number, text: string, rgb: string, font: { name: string; width: number; height: number; dx: number }): void;
    end(): T;
}

export function renderCode128<T>(options: Code128RenderOptions, drawing: Code128DrawingContext<T>): T;
