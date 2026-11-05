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

import type { NSEActionReference } from "../Core/actionReference";
import type { NSEThumbMaterial } from "../../Appearance/NSEMetalThumb";
import type { InputHTMLAttributes, ReactNode } from "react";
import type { UndoManager } from "../../../SynCloudOS/SynCloudOS";
export interface NSENumericValueContract { readonly minimum: number; readonly maximum: number; readonly step: number; readonly wraps?: boolean }
export interface NSEStepperValueContract<T> { readonly minimum:T;readonly maximum:T;compare(first:T,second:T):number;step(value:T,direction:1|-1):T;readonly wraps?:boolean }
export type NSEUndoManagerPort = Pick<UndoManager, "isExecuting" | "register" | "reserve">;
/** NSSegmentedControl.trackingMode with the selected segments: momentary, selectOne or selectAny. */
export type NSESegmentedSelection = { readonly mode:"momentary";readonly selectedIds:ReadonlySet<string>}|{readonly mode:"select-one";readonly selectedIds:ReadonlySet<string>;readonly allowsEmpty:boolean}|{readonly mode:"select-any";readonly selectedIds:ReadonlySet<string>};
/** NSSegmentedControl.Style. `capsule` and `texturedRounded` draw the theme's capsule strip and joined tool band. */
export type NSESegmentStyle = "rounded" | "capsule" | "texturedRounded";
export interface NSESegmentedItem<Payload = unknown> { readonly id:string;readonly label:ReactNode;/** NSSegmentedControl.setImage(_:forSegment:): the segment draws this image; `accessibleLabel` (or a string label) names it. */readonly image?:ReactNode;/** NSSegmentedControl.setWidth(_:forSegment:): a fixed width in CSS pixels; the segment otherwise sizes to fit, or shares the width under fill-equally. */readonly width?:number;/** The spoken name (and tooltip) of a segment drawn as a glyph. */readonly accessibleLabel?:string;readonly disabled?:boolean;readonly commandId?:string;readonly commandPayload?:unknown;/** An action name (`action: "selectNote"`) sent along the responder chain when the segment is pressed; the segment is disabled while the action is unavailable. Use instead of `commandId`. It sends actionPayload, or no payload when that is omitted. */readonly action?:string | NSEActionReference<Payload>;readonly actionPayload?:NoInfer<Payload>;readonly menu?:readonly {readonly id:string;readonly label:string;readonly disabled?:boolean}[] }
export interface NSESegmentedControlProps<Payload = unknown> {readonly "aria-label":string;readonly items:readonly NSESegmentedItem<Payload>[];readonly selection:NSESegmentedSelection;/** NSSegmentedControl.segmentStyle (default rounded). */readonly segmentStyle?:NSESegmentStyle;/** Default action for segments without an item-specific action or command. The payload defaults to the segment id. */readonly action?:string | NSEActionReference<Payload>;readonly actionPayload?:NoInfer<Payload>;readonly disabled?:boolean;readonly readOnly?:boolean;readonly name?:string;readonly maximumVisibleSegments?:number;readonly parentResponderId?:string;/** NSControl's size: regular, or small (the 24px inspector size). */readonly controlSize?:"regular"|"small";/** An explicit band height in CSS pixels; overrides controlSize. */readonly height?:number;/** NSSegmentedControl.segmentDistribution: "fit" sizes each segment to its content; "fill-equally" stretches the control to its container and shares the width evenly. */readonly distribution?:"fit"|"fill-equally";onSelectionChange?(selection:NSESegmentedSelection):void;onMenuAction?(segmentId:string,actionId:string):void}
export interface NSESliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "min" | "max" | "step" | "onChange" | "onInput"> {/** Regular, small or mini metrics (NSControl.controlSize). */ readonly controlSize?:"regular"|"small"|"mini";/** The slider's extent along its track in CSS pixels (its frame length); the thumb and track keep their size's metrics. */ readonly length?:number;readonly thumbMaterial?:NSEThumbMaterial;readonly value?:number;readonly defaultValue?:number;readonly minimum?:number;readonly maximum?:number;readonly min?:number;readonly max?:number;readonly step?:number;readonly wraps?:boolean;readonly orientation?:"horizontal"|"vertical";readonly readOnly?:boolean;readonly ticks?:readonly number[];/** Pointer-only soft checkpoints; ordinary step and keyboard values remain available. */ readonly detents?:readonly number[];/** Attraction distance in value units (default: two steps). */ readonly detentThreshold?:number;readonly label?:ReactNode;readonly tooltip?:ReactNode|((value:number)=>ReactNode);readonly undoManager?:NSEUndoManagerPort;onValueChange?(value:number,phase:"preview"|"commit"):void;onChanging?(value:number):void;onChange?(value:number):void}
export interface NSECircularSliderProps extends NSENumericValueContract {readonly "aria-label":string;readonly value:number;readonly disabled?:boolean;readonly readOnly?:boolean;/** "small" is the inspector dial (22px), as in the font panel. */readonly controlSize?:"regular"|"small";/** Spoken value, such as "315 degrees". */readonly valueText?:(value:number)=>string;onValueChange(value:number,phase:"preview"|"commit"):void}
export interface NSELevelIndicatorProps {readonly "aria-label":string;readonly value:number;readonly minimum:number;readonly maximum:number;readonly mode?:"continuous"|"discrete"|"capacity"|"rating";readonly warningValue?:number;readonly criticalValue?:number;readonly disabled?:boolean;onValueChange?(value:number,phase:"commit"):void}
