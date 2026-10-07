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

import { useEffect, useId, useRef, useState } from "react";
import { nseAppearanceSlot, useNSEAppearanceSlot } from "../../Appearance";
import { NSEListboxPopup, useNSEOverlayProvider } from "../../Overlays";
import type { NSEComboBoxProps } from "./completionTypes";

export function NSEComboBox<T>(props: NSEComboBoxProps<T>) {
  useNSEOverlayProvider();
  const generatedId = useId().replace(/:/g, "");
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(props.inputValue);
  const [items, setItems] = useState<readonly T[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const composing = useRef(false);
  const popupId = props.id ?? `nse-combo-${generatedId}`;
  const inputId = `${popupId}-input`;

  useEffect(() => () => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);
  useEffect(() => { if (!composing.current) setDraft(props.inputValue); }, [props.inputValue]);
  useEffect(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    setItems([]);
    setActive(-1);
    setLoading(false);
  }, [props.dataSource, props.disabled, props.readOnly]);

  const query = (text: string) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = ++generation.current;
    setLoading(true);
    let result: Promise<readonly T[]>;
    try {
      result = Promise.resolve(props.dataSource.query(text, abort.signal));
    } catch {
      if (current === generation.current) {
        setItems([]);
        setActive(-1);
        setLoading(false);
      }
      return;
    }
    void result.then((next) => {
      if (!abort.signal.aborted && current === generation.current) {
        setItems(Object.freeze([...next]));
        setActive(-1);
        setLoading(false);
      }
    }, () => {
      if (!abort.signal.aborted && current === generation.current) {
        setItems([]);
        setActive(-1);
        setLoading(false);
      }
    });
  };
  const commit = (item: T) => {
    if (composing.current || props.disabled || props.readOnly) return;
    props.onValueChange(item, "completion");
    setDraft(props.dataSource.labelForItem(item));
    setItems([]);
    setActive(-1);
  };
  const activeItem = active >= 0 ? items[active] : undefined;
  const activeOptionId = activeItem ? `${popupId}-option-${props.dataSource.idForItem(activeItem)}` : undefined;
  const options = items.map((item) => ({ id: props.dataSource.idForItem(item), label: props.dataSource.labelForItem(item), value: item }));
  const appearanceState = props.disabled ? "disabled" : focused ? "focused" : "normal";
  const appearance = useNSEAppearanceSlot(nseAppearanceSlot("combo-box", "well", appearanceState));
  return (
    <span data-nse-control="combo-box" data-state={loading ? "loading" : items.length ? "ready" : "empty"} {...appearance.attributes}>
      <input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-label={props["aria-label"]}
        aria-expanded={items.length > 0}
        aria-controls={items.length > 0 ? popupId : undefined}
        aria-activedescendant={activeOptionId}
        value={draft}
        disabled={props.disabled}
        readOnly={props.readOnly}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(event) => {
          if (props.disabled || props.readOnly) return;
          composing.current = false;
          props.onInputValueChange(event.currentTarget.value);
          query(event.currentTarget.value);
        }}
        onChange={(event) => {
          if (props.disabled || props.readOnly) return;
          setDraft(event.currentTarget.value);
          if (!composing.current) {
            props.onInputValueChange(event.currentTarget.value);
            query(event.currentTarget.value);
          }
        }}
        onKeyDown={(event) => {
          if (props.disabled || props.readOnly || composing.current || event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" && items.length) {
            event.preventDefault();
            setActive((value) => Math.min(items.length - 1, value + 1));
          } else if (event.key === "ArrowUp" && items.length) {
            event.preventDefault();
            setActive((value) => Math.max(0, value - 1));
          } else if (event.key === "Enter") {
            const item = items[Math.max(active, 0)];
            if (item) {
              event.preventDefault();
              commit(item);
            } else if (props.allowsFreeform) props.onValueChange(draft, "freeform");
          } else if (event.key === "Escape") {
            controller.current?.abort();
            generation.current += 1;
            setItems([]);
            setActive(-1);
            setLoading(false);
            setDraft(props.inputValue);
          }
        }}
      />
      {props.name ? <input type="hidden" name={props.name} value={props.value ? props.dataSource.idForItem(props.value) : props.allowsFreeform ? draft : ""} /> : null}
      <NSEListboxPopup id={popupId} open={items.length > 0} anchor={inputRef.current} parentResponderId={props.parentResponderId} direction={props.direction} options={options} selectedId={activeItem ? props.dataSource.idForItem(activeItem) : null} labelledBy={inputId} onOpenChange={(open) => { if (!open) { setItems([]); setActive(-1); } }} onSelect={(option) => { if (option.value !== undefined) commit(option.value); }} />
    </span>
  );
}
