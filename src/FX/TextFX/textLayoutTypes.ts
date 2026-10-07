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

import type { GFXPoint, GFXRect, GFXSize } from "../GraphicsFX/GFXGeometry";
import type { TFXFont } from "./TFXFont";
import type { TFXFontDescriptor } from "./TFXFontDescriptor";
interface RangeValue { readonly location: number; readonly length: number }
type SynCloudOSRuntimeId = string;

export type TFXTextDirection = "ltr" | "rtl";
export type TFXTextWritingMode = "horizontal-tb" | "vertical-rl" | "vertical-lr";
export type TFXTextTruncation = "none" | "head" | "middle" | "tail";

export interface TFXTextFontDescriptor {
  readonly families: readonly string[];
  readonly size: number;
  readonly weight: number;
  readonly style: "normal" | "italic" | "oblique";
  readonly stretch: "normal" | "condensed" | "semi-condensed" | "semi-expanded" | "expanded";
}

export interface TFXTextSegment {
  readonly segment: string;
  readonly index: number;
  readonly end: number;
  readonly breakOpportunity: boolean;
}

export interface TFXTextRequestBase {
  readonly text: string;
  readonly font: TFXTextFontDescriptor;
  readonly locale: string;
  readonly direction: TFXTextDirection;
  readonly writingMode?: TFXTextWritingMode;
  readonly signal: AbortSignal;
}

export interface TFXTextMeasureRequest extends TFXTextRequestBase {}

export interface TFXTextRangeRectsRequest extends TFXTextRequestBase {
  readonly range: RangeValue;
}

export interface TFXTextHitTestRequest extends TFXTextRequestBase {
  readonly point: GFXPoint;
}

export interface TFXTextMeasurement {
  readonly advance: number;
  readonly ascent: number;
  readonly descent: number;
  readonly baseline: number;
  readonly inkBounds: GFXRect;
}

export interface TFXTextHitTestResult {
  readonly offset: number;
  readonly affinity: "upstream" | "downstream";
}

/**
 * Exclusive use of one adapter measurement surface for a bounded batch of
 * measurements, such as one layout run. The holder measures sequentially and
 * releases the lease exactly once when the batch settles or is cancelled.
 * Measurements through one lease observe one consistent measurement state, so
 * a caller may reuse the result of an identical request within the batch.
 */
export interface TFXTextMeasurementLease {
  measure(request: TFXTextMeasureRequest): TFXTextMeasurement | Promise<TFXTextMeasurement>;
  release(): void;
}

export interface TFXTextLayoutAdapter {
  readonly geometryCapabilities?: TFXTextGeometryCapabilities;
  segment(text: string, granularity: "grapheme" | "word", locale: string): readonly TFXTextSegment[];
  measure(request: TFXTextMeasureRequest): Promise<TFXTextMeasurement>;
  /** Optional batch measurement. Adapters without it are measured per request. */
  acquireMeasurementLease?(signal: AbortSignal): TFXTextMeasurementLease | null;
  rangeRects(request: TFXTextRangeRectsRequest): Promise<readonly GFXRect[]>;
  hitTest(request: TFXTextHitTestRequest): Promise<TFXTextHitTestResult>;
  registerFontFace?(request: TFXFontFaceRegistrationRequest): Promise<TFXFontFaceRegistration>;
  yieldToHost(signal: AbortSignal): Promise<void>;
  diagnostics(): { readonly activeMeasurementNodeCount: number };
  dispose(): void;
}

export interface TFXTextLayoutAdapterLease {
  readonly adapter: TFXTextLayoutAdapter;
  release(): void;
}

export interface TFXTextLayoutAdapterFactory {
  acquire(runtimeId: SynCloudOSRuntimeId, signal: AbortSignal): TFXTextLayoutAdapterLease;
}

export interface TFXTextContainerValue {
  readonly size: GFXSize;
  readonly insets: {
    readonly blockStart: number;
    readonly inlineEnd: number;
    readonly blockEnd: number;
    readonly inlineStart: number;
  };
  readonly maximumLines: number;
  /** The display treatment to use when this container terminates a text flow. */
  readonly truncation: TFXTextTruncation;
  readonly writingMode: TFXTextWritingMode;
  /** Stable logical ordering for a multi-container flow; input-array order breaks ties. */
  readonly flowOrder: number;
  readonly exclusionRects: readonly GFXRect[];
}

/**
 * A private-to-layout continuation point. It lets NSE relayout a dirty suffix
 * from the same physical line and container without measuring the untouched
 * prefix again. It is data-only so adapters never receive ambient DOM state.
 */
export interface TFXTextLayoutContinuation {
  readonly containerIndex: number;
  readonly lineIndex: number;
  readonly blockOffset: number;
  /** Character offset of this suffix in its retained canonical attributed value. */
  readonly textOffset: number;
}

export interface TFXLogicalTextInput {
  readonly text: string;
  /** Optional immutable attributed source retained by NSELayoutManager for semantic layout evidence. */
  readonly attributedContent?: unknown;
  readonly font: TFXTextFontDescriptor;
  readonly locale: string;
  readonly direction: TFXTextDirection;
  /** Starts this text fragment within a previously laid out container flow. */
  readonly continuation?: TFXTextLayoutContinuation;
  readonly signal?: AbortSignal;
}

export interface TFXTextFragment {
  readonly text: string;
  readonly range: RangeValue;
  readonly graphemeRange: RangeValue;
  readonly rect: GFXRect;
  readonly baseline: number;
  readonly containerIndex: number;
}

export interface TFXTextLayoutResult {
  readonly geometry?: Readonly<{ kind: "logical-dom" | "shaped"; units: "css-pixels" | "points"; fontGeneration: number; complete: boolean }>;
  readonly fragments: readonly TFXTextFragment[];
  readonly laidOutRange: RangeValue;
  readonly truncated: boolean;
}

export interface TFXTextLayoutDiagnostics {
  readonly activeOperationCount: number;
  readonly activeMeasurementNodeCount: number;
  readonly lastLayoutWork: {
    readonly segmentCount: number;
    readonly measurementCount: number;
    readonly graphemeAdvanceCount: number;
    readonly lineCount: number;
  };
}

export interface TFXFontFaceRegistrationRequest {
  readonly familyName: string;
  readonly bytes: Uint8Array;
  readonly descriptor: TFXFontDescriptor;
  readonly signal: AbortSignal;
}

export interface TFXFontFaceRegistration {
  readonly familyName: string;
  release(): void;
}

export interface TFXFontReadinessChange {
  readonly registrationId: string;
  readonly familyName: string;
  readonly generation: number;
  readonly state: "ready" | "released";
}

/** A mounted request to resolve one document-owned image into an immutable
 * TFX run delegate. The source is an opaque scoped lease, never raw bytes or a URL. */
export interface TFXRunDelegateRequest {
  readonly attachmentKind: "image";
  readonly source: Readonly<{
    readonly kind: "document-resource";
    readonly documentId: string;
    readonly resourceId: string;
    readonly leaseId: string;
    readonly generation: number;
    readonly mimeType: string;
    readonly byteLength: number;
  }>;
  readonly accessibilityLabel: string;
  readonly intrinsicSize?: Readonly<{ readonly inline: number; readonly block: number }>;
}

export interface TFXRunDelegateReadinessChange {
  readonly resourceId: string;
  readonly generation: number;
  readonly state: "ready" | "released";
}

export interface TFXFontRegistration {
  readonly id: string;
  readonly familyName: string;
  readonly format: "truetype" | "opentype" | "woff" | "woff2";
  /** This registration owns an independent font instance. Disposing it cannot revoke a peer registration. */
  readonly font: TFXFont;
  dispose(): boolean;
}

export type TFXFontResourceMimeType = "font/woff" | "font/woff2" | "font/ttf" | "font/otf";

export interface TFXPackagedFontResource {
  readonly bytes: Uint8Array;
  readonly mimeType: TFXFontResourceMimeType;
}

/** Host authority associated with one exact application bundle. */
export type TFXPackagedFontResourceLoader = (
  relativeBundlePath: string,
  signal: AbortSignal,
) => Promise<TFXPackagedFontResource>;

export interface TFXFontClient {
  readonly fontReadinessGeneration: number;
  registerFont(bytes: Uint8Array, descriptor: TFXFontDescriptor, signal?: AbortSignal): Promise<TFXFontRegistration>;
  registerFontResource(relativeBundlePath: string, descriptor: TFXFontDescriptor, signal?: AbortSignal): Promise<TFXFontRegistration>;
  subscribeFontReadiness(listener: (change: TFXFontReadinessChange) => void): () => void;
}

export interface TFXTextLayoutService extends TFXFontClient {
  readonly geometryCapabilities?: TFXTextGeometryCapabilities;
  readonly runtimeId: SynCloudOSRuntimeId;
  /** Runtime-owned segmentation and offset authority. NSE callers must not
   * reach for process-global Intl while remapping incremental fragments. */
  segment(input: {
    readonly text: string;
    readonly granularity: "grapheme" | "word";
    readonly locale: string;
    readonly signal?: AbortSignal;
  }): readonly TFXTextSegment[];
  layout(input: TFXLogicalTextInput, containers: readonly TFXTextContainerValue[]): Promise<TFXTextLayoutResult>;
  measure(input: Omit<TFXTextMeasureRequest, "signal"> & { readonly signal?: AbortSignal }): Promise<TFXTextMeasurement>;
  rangeRects(input: Omit<TFXTextRangeRectsRequest, "signal"> & { readonly signal?: AbortSignal }): Promise<readonly GFXRect[]>;
  hitTest(input: Omit<TFXTextHitTestRequest, "signal"> & { readonly signal?: AbortSignal }): Promise<TFXTextHitTestResult>;
  diagnostics(): TFXTextLayoutDiagnostics;
  /** Creates an isolated font-registration owner for a mounted consumer. */
  createFontScope(signal: AbortSignal, resourceLoader?: TFXPackagedFontResourceLoader): TFXFontClient & { dispose(): void };
  dispose(): void;
}

export interface TFXTextGeometryCapabilities {
  readonly kind: "logical-dom" | "shaped";
  readonly units: "css-pixels" | "points";
  readonly exclusions: boolean;
  readonly shapedCarets: boolean;
}

export class TFXUnsupportedTextLayoutFeatureError extends Error {
  readonly feature: "vertical-glyph-geometry" | "exclusion-paths" | "text-segmentation" | "mixed-bidi-hit-testing";

  constructor(feature: TFXUnsupportedTextLayoutFeatureError["feature"]) {
    super(`The injected text-layout adapter does not represent ${feature}.`);
    this.name = "TFXUnsupportedTextLayoutFeatureError";
    this.feature = feature;
  }
}
