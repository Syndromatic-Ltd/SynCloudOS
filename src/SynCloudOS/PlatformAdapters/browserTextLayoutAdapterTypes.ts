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

import type { GFXRect } from "../../FX/GraphicsFX/GFXGeometry";
import type { TFXFontFaceRegistration, TFXFontFaceRegistrationRequest, TFXTextHitTestRequest, TFXTextHitTestResult, TFXTextMeasurement, TFXTextRangeRectsRequest, TFXTextSegment } from "../SynCloudOS";

export interface BrowserTextSegmenter {
  segment(text: string): readonly TFXTextSegment[];
}

export interface BrowserTextMeasurementSurface {
  measure(request: Omit<TFXTextHitTestRequest, "point">): TFXTextMeasurement;
  rangeRects(request: TFXTextRangeRectsRequest): readonly GFXRect[];
  hitTest(request: TFXTextHitTestRequest): TFXTextHitTestResult;
  dispose(): void;
}

export interface BrowserTextLayoutPlatform {
  createSegmenter(locale: string, granularity: "grapheme" | "word"): BrowserTextSegmenter | null;
  createMeasurementSurface(): BrowserTextMeasurementSurface | null;
  yieldToHost(signal: AbortSignal): Promise<void>;
  registerFontFace?(request: TFXFontFaceRegistrationRequest): Promise<TFXFontFaceRegistration>;
}
