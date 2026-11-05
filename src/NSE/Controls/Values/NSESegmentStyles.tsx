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

/**
 * @internal The cells NSESegmentedControl draws for its texturedRounded
 * segment style, on the markup the Atmo tool art is drawn on: the joined
 * tool-button band, and its radio strip for one-of-many text segments.
 */

import { useMemo } from "react";
import { NSEButton } from "../Buttons/NSEButton";
import { NSEToolButtonGroup } from "../Buttons/NSEButtonFamilies";
import { sizedControlStyle } from "../Core/nseControlsShared";
import { NSERadioGroup } from "../Fields/NSEFields";
import type { NSESegmentedControlProps, NSESegmentedItem, NSESegmentedSelection } from "./valueControlTypes";

/**
 * @internal Resolves each segment's action. A segment's own action sends its
 * own actionPayload (none when omitted); the control's shared action sends the
 * control's actionPayload, or the segment's id so the receiver can tell which
 * segment was pressed.
 */
export function useSegmentActions(props: NSESegmentedControlProps): readonly NSESegmentedItem[] {
  const hasActionPayload = Object.prototype.hasOwnProperty.call(props, "actionPayload");
  return useMemo(() => {
    if (props.action === undefined) return props.items;
    return props.items.map((item) => {
      if (item.commandId !== undefined || item.action !== undefined) return item;
      return { ...item, action: props.action, actionPayload: hasActionPayload ? props.actionPayload : item.id };
    });
  }, [props.items, props.action, props.actionPayload, hasActionPayload]);
}

function sizeAttribute(props: NSESegmentedControlProps): "small" | "custom" | undefined {
  return props.height !== undefined ? "custom" : props.controlSize === "small" ? "small" : undefined;
}

function itemName(item: NSESegmentedItem): string {
  return item.accessibleLabel ?? (typeof item.label === "string" ? item.label : item.id);
}

function selectOne(props: NSESegmentedControlProps, id: string) {
  if ((props.isEnabled === false) || props.readOnly) return;
  props.onSelectionChange?.({ ...props.selection, selectedIds: new Set([id]) } as NSESegmentedSelection);
}

/** Text segments that track one selection, in the textured radio strip (Atmo's small uppercase tool band). */
function NSETexturedRadioSegments({ props }: { readonly props: NSESegmentedControlProps }) {
  const selected = props.items.find((item) => props.selection.selectedIds.has(item.id))?.id ?? "";
  return (
    <NSERadioGroup
      className="nse-extended-radio-tool-button-group"
      label={props["aria-label"]}
      name={props.name}
      disabled={(props.isEnabled === false) || props.readOnly}
      data-size={sizeAttribute(props)}
      data-segment-style="texturedRounded"
      style={sizedControlStyle(undefined, props.height, undefined)}
      options={props.items.map((item) => ({
        value: item.id,
        label: item.label,
        disabled: (item.isEnabled === false),
        command: item.commandId ? { id: item.commandId, payload: { value: item.id } } : undefined,
      }))}
      value={selected}
      onValueChange={(id) => selectOne(props, id)}
    />
  );
}

/** Textured segments with images: the joined tool-button band. */
function NSETexturedSegments({ props }: { readonly props: NSESegmentedControlProps }) {
  const { mode, selectedIds } = props.selection;
  const select = (id: string) => {
    if ((props.isEnabled === false) || props.readOnly) return;
    const ids = new Set(selectedIds);
    if (mode === "momentary") { ids.clear(); ids.add(id); }
    else if (mode === "select-one") { ids.clear(); ids.add(id); }
    else if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    props.onSelectionChange?.({ ...props.selection, selectedIds: ids } as NSESegmentedSelection);
  };
  const items = useSegmentActions(props);
  return (
    <NSEToolButtonGroup
      label={props["aria-label"]}
      controlSize={props.controlSize}
      height={props.height}
      data-segment-style="texturedRounded"
    >
      {items.map((item) => {
        return (
          <NSEButton
            key={item.id}
            bezelStyle="texturedRounded"
            buttonType={mode === "momentary" ? "momentaryPushIn" : "pushOnPushOff"}
            title={item.image ? itemName(item) : item.label}
            image={item.image}
            imagePosition={item.image ? "imageOnly" : undefined}
            state={mode !== "momentary" && selectedIds.has(item.id) ? "on" : "off"}
            isEnabled={!((props.isEnabled === false) || props.readOnly || (item.isEnabled === false))}
            action={item.action}
            actionPayload={item.actionPayload}
            onClick={() => select(item.id)}
            style={item.width === undefined ? undefined : { boxSizing: "border-box", inlineSize: item.width, minInlineSize: item.width }}
          />
        );
      })}
    </NSEToolButtonGroup>
  );
}

/** @internal Textured segments; capsule segments are the rounded markup in their own type. */
export function NSETexturedSegmentCells(props: NSESegmentedControlProps) {
  if (props.selection.mode === "select-one" && props.items.every((item) => item.image === undefined)) {
    return <NSETexturedRadioSegments props={props} />;
  }
  return <NSETexturedSegments props={props} />;
}
