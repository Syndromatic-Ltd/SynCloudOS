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

import { NSEPushButton } from "../Controls/Buttons/NSEButtons";
import { NSESlider } from "../Controls/Values/NSESlider";
import { normaliseParagraphStyle, normaliseParagraphStyleMutation, type NSEParagraphStyle } from "./typographyTypes";

export interface NSERulerProps {
  readonly value: NSEParagraphStyle;
  readonly direction?: "ltr" | "rtl";
  readonly maximum?: number;
  readonly step?: number;
  readonly readOnly?: boolean;
  readonly onChange: (value: NSEParagraphStyle) => void;
}

function updated(style: NSEParagraphStyle, change: Partial<NSEParagraphStyle>): NSEParagraphStyle {
  return normaliseParagraphStyleMutation({ ...style, ...change });
}

export function NSERuler({ value, direction = "ltr", maximum = 1_000, step = 1, readOnly = false, onChange }: NSERulerProps) {
  const style = normaliseParagraphStyle(value);
  const mutationDisabled = readOnly;
  const changeNumber = (key: "firstLineIndent" | "headIndent" | "tailIndent", next: number) => {
    if (mutationDisabled) return;
    onChange(updated(style, { [key]: Math.max(0, Math.min(maximum, next)) }));
  };
  const changeTabStop = (index: number, next: number) => {
    if (readOnly) return;
    const previous = style.tabStops[index - 1];
    const following = style.tabStops[index + 1];
    const minimum = previous === undefined ? 0 : previous + 1;
    const maximumValue = following === undefined ? maximum : following - 1;
    const stops = [...style.tabStops];
    stops[index] = Math.max(minimum, Math.min(maximumValue, next));
    onChange(updated(style, { tabStops: stops }));
  };
  const addTabStop = () => {
    if (readOnly || style.tabStops.length >= 64) return;
    const last = style.tabStops.at(-1) ?? 0;
    onChange(updated(style, { tabStops: [...style.tabStops, Math.min(maximum, last + 4)] }));
  };
  const removeTabStop = (index: number) => {
    if (readOnly) return;
    onChange(updated(style, { tabStops: style.tabStops.filter((_value, current) => current !== index) }));
  };
  const opposite = direction === "ltr" ? "rtl" : "ltr";
  // Indents are NSE sliders measured from their logical edge: first-line and
  // head run from the start, the tail indent from the end (its slider runs the
  // other way), so the inward arrow always grows the indent.
  return <section data-nse-control="ruler" data-orientation="horizontal" data-direction={direction} dir={direction} aria-label="Paragraph ruler">
    {([
      ["firstLineIndent", "First line indent"],
      ["headIndent", "Head indent"],
      ["tailIndent", "Tail indent"],
    ] as const).map(([key, label]) => <NSESlider key={key} controlSize="small" data-nse-part="indent" label={label} data-logical-edge={key === "tailIndent" ? "end" : "start"} dir={key === "tailIndent" ? opposite : direction} minimum={0} maximum={maximum} step={step} value={style[key]} disabled={mutationDisabled} onValueChange={(next) => changeNumber(key, next)} />)}
    {style.tabStops.map((stop, index) => <div key={`tab-stop-${index}`} data-nse-part="tab-stop">
      <NSESlider controlSize="small" label={`Tab stop ${index + 1}`} dir={direction} minimum={0} maximum={maximum} step={1} value={stop} disabled={readOnly} onValueChange={(next) => changeTabStop(index, next)} />
      <NSEPushButton tone="light" aria-label={`Remove tab stop ${index + 1}`} onClick={() => removeTabStop(index)} disabled={readOnly}>Remove</NSEPushButton>
    </div>)}
    <div data-nse-part="tab-stops">
      <NSEPushButton tone="light" onClick={addTabStop} disabled={readOnly || style.tabStops.length >= 64}>Add tab stop</NSEPushButton>
      <p role="status" aria-live="polite">{style.tabStops.length ? `${style.tabStops.length} custom tab stop${style.tabStops.length === 1 ? "" : "s"}.` : "No custom tab stops."}</p>
    </div>
  </section>;
}
