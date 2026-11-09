import { useNSEValueBinding } from "../Core/useNSEValueBinding";
import type { NSEBoundValueProps } from "../../Bindings/bindingTypes";
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

import { nseControlHooks, nseStateHooks } from "../../Theme/contract/hooks";
import { useNSEThemeInteraction } from "../../Theme/contract/useThemeInteraction";
import { NSEMetalThumb, type NSEThumbMaterial } from "../../Appearance/NSEMetalThumb";
import { NSEDivider } from "../Selection/NSEDivider";
import { nseCSSValue } from "../../Graphics/NSEShadow";
import { nseNonNegative, useNSEViewLayerProperties, type NSEViewLayerProperties } from "../../Views/viewLayerProperties";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import type { NSEFormatter, NSEFormatterContext } from "../../../Foundation/public";
import {
  useNSEControlCommand,
  useNSEControlFormReset,
  useNSEControlValue,
  type NSECheckboxState,
  type NSEControlCommandBinding,
  type NSEControlInteractionPhase,
  type NSEControlValidation,
} from "../Core";
import type { HFXFeedbackRequest } from "../../Feedback";
import type { NSESmoothSurfaceRequest } from "../../SmoothSurface";
import {
  classes,
  clamp,
  getControlSmoothSurfaceProps,
  sizedControlStyle,
  useControllableState,
  useNSEControlFeedback,
  TOGGLE_INSET_PX,
  TOGGLE_THUMB_PX,
  TOGGLE_TRAVEL_PX,
  type CSSVarStyle,
} from "../Core/nseControlsShared";

/** AppKit's control sizes. Themes size the whole control (frame, type and
 * affixes) from `data-size`; "regular" is the default metric. */
export type NSEControlSize = "regular" | "small" | "mini";

export interface NSETextFieldChromeProps {
  /** Regular, small or mini metrics (NSControl.controlSize). */
  controlSize?: NSEControlSize;
  /** An explicit field height in CSS pixels, overriding controlSize; the
   * field's frame, type and affixes keep their proportions. */
  height?: number;
  label?: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  groupPosition?: "single" | "first" | "middle" | "last";
  validation?: NSEControlValidation;
}

/** Compatibility retains native `onChange` while new callers use value phases. */
export interface NSEPlainTextFieldProps extends NSETextFieldChromeProps, Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "prefix" | "value" | "defaultValue" | "height"
> {
  value?: string;
  defaultValue?: string;
  invalid?: boolean;
  command?: NSEControlCommandBinding<string>;
  onValueChange?(value: string, phase: NSEControlInteractionPhase): void;
}

export interface NSEFormattedTextFieldProps<T> extends NSETextFieldChromeProps, Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "prefix" | "value" | "defaultValue" | "height"
> {
  value?: T;
  defaultValue?: T;
  invalid?: boolean;
  formatter: NSEFormatter<T>;
  formatterContext: NSEFormatterContext;
  command?: NSEControlCommandBinding<T>;
  onValueChange?(value: T, phase: NSEControlInteractionPhase): void;
}

/**
 * Compatibility-facing superset. Plain and formatted callers can use the more
 * precise exported variants above, while existing composed controls may extend
 * this interface without creating a parallel field implementation.
 */
export interface NSETextFieldProps<T = string> extends NSETextFieldChromeProps, Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "prefix" | "value" | "defaultValue" | "height" | "disabled"
> {
  /** NSTextField.isEditable (default true); false makes the field a label (see NSELabelTextFieldProps). */
  isEditable?: true;
  /** NSControl.isEnabled (default true). */
  isEnabled?: boolean;
  value?: T;
  defaultValue?: T;
  invalid?: boolean;
  formatter?: NSEFormatter<T>;
  formatterContext?: NSEFormatterContext;
  command?: NSEControlCommandBinding<T>;
  onValueChange?(value: T, phase: NSEControlInteractionPhase): void;
}

function toTextValue<T>(value: T | undefined, formatter: NSEFormatter<T> | undefined, context: NSEFormatterContext | undefined) {
  if (formatter && value !== undefined && context) return formatter.editingString(value, context);
  return value === undefined ? "" : String(value);
}

/** NSFont.TextStyle: the SDK's text styles, sized by its text tokens so every theme agrees. */
export type NSEFontTextStyle = "body" | "callout" | "footnote" | "caption" | "headline" | "label";

/**
 * A text field that is not editable: AppKit's `NSTextField(labelWithString:)`, drawn without a bezel or
 * background. Its children are its string value. Use it for readouts, captions and notes beside controls.
 */
export interface NSELabelTextFieldProps extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
  /** NSTextField.isEditable. */
  readonly isEditable: false;
  /** NSTextField.font, as a text style (default body). */
  readonly font?: NSEFontTextStyle;
  /** NSTextField's text colour: `labelColour` (default), or the quieter `secondaryLabelColour` for hints and metadata. */
  readonly textColour?: "labelColour" | "secondaryLabelColour";
  /** The monospaced-digit system font: tabular figures, so changing numbers do not jitter. */
  readonly monospacedDigits?: boolean;
  /** NSTextField.lineBreakMode: wrap at words (default), or anywhere for paths, URLs and hex values. */
  readonly lineBreakMode?: "byWordWrapping" | "byCharWrapping";
  /**
   * NSCell.backgroundStyle: what the label is drawn on. `raised` is a label on a raised surface, such
   * as status text on a window's bottom content border, which the theme draws embossed.
   */
  readonly backgroundStyle?: NSELabelBackgroundStyle;
}

/** NSView.BackgroundStyle. */
export type NSELabelBackgroundStyle = "normal" | "emphasised" | "raised" | "lowered";

function NSELabelTextField({ isEditable: _isEditable, font = "body", textColour = "labelColour", monospacedDigits = false, lineBreakMode = "byWordWrapping", backgroundStyle = "normal", className = "", children, ...props }: NSELabelTextFieldProps) {
  return (
    <span
      {...props}
      {...nseControlHooks({ control: "text-field", variants: { editable: "false", "text-colour": textColour, "background-style": backgroundStyle } })}
      data-nse-part="title"
      className={classes("nse-control-label-field", className)}
      data-font={font}
      data-text-colour={textColour === "secondaryLabelColour" ? "secondary" : undefined}
      data-monospaced-digits={monospacedDigits ? "true" : undefined}
      data-line-break-mode={lineBreakMode === "byCharWrapping" ? "char" : undefined}
      data-background-style={backgroundStyle === "normal" ? undefined : backgroundStyle}
    >
      {children}
    </span>
  );
}

type NSEEditableTextFieldProps<T> = NSEBoundValueProps<T, NSETextFieldProps<T>, 'value' | 'defaultValue' | 'onValueChange' | 'undoManager'>;

export function NSETextField<T = string>(props: NSELabelTextFieldProps | NSEEditableTextFieldProps<T>) {
  if ((props as { readonly isEditable?: boolean }).isEditable === false) return <NSELabelTextField {...props as NSELabelTextFieldProps} />;
  return <NSEEditableTextField<T> {...props as NSEEditableTextFieldProps<T>} />;
}

function NSEEditableTextField<T>(props: NSEEditableTextFieldProps<T>) {
  return <NSETextFieldControl {...useNSEValueBinding<T, NSETextFieldProps<T>, 'value' | 'defaultValue' | 'onValueChange' | 'undoManager'>(props, {fallback: '' as T})} />;
}

function NSETextFieldControl<T = string>(props: NSETextFieldProps<T>) {
  const {
    label,
    controlSize = "regular",
    height,
    prefix,
    suffix,
    invalid = false,
    groupPosition = "single",
    className = "",
    id,
    isEnabled = true,
    readOnly,
    required,
    name,
    value,
    defaultValue,
    formatter,
    formatterContext,
    command: commandBinding,
    validation,
    onValueChange,
    onChange,
    onBlur,
    onInvalid,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
    "aria-describedby": ariaDescribedBy,
    ...inputProps
  } = props;
  const disabled = !isEnabled;
  const theme = useNSEThemeInteraction<HTMLLabelElement>(isEnabled);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const skipNextBlurCommit = useRef(false);
  const isFormatted = formatter !== undefined;
  const currentValue = useNSEControlValue<T | string>({
    value: value as T | string | undefined,
    defaultValue: defaultValue as T | string | undefined,
    fallback: "",
    isEnabled: !disabled,
    readOnly,
    required,
    validation,
    onValueChange: onValueChange as ((nextValue: T | string, phase: NSEControlInteractionPhase) => void) | undefined,
  });
  const [draft, setDraft] = useState(() => toTextValue(currentValue.value, formatter, formatterContext));
  const [editingValidation, setEditingValidation] = useState<NSEControlValidation | undefined>();
  const command = useNSEControlCommand(commandBinding as NSEControlCommandBinding<T | string> | undefined);
  const effectiveValidation = editingValidation ?? validation ?? (invalid
    ? { kind: "invalid", code: "invalid", message: "This value needs attention." } as const
    : undefined);
  const invalidState = effectiveValidation?.kind === "invalid";
  const errorId = `${inputId}-error`;
  const describedBy = [ariaDescribedBy, invalidState ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  useEffect(() => {
    if (currentValue.isControlled) setDraft(toTextValue(currentValue.value, formatter, formatterContext));
  }, [currentValue.isControlled, currentValue.value, formatter, formatterContext]);

  const resetText = useCallback(() => {
    currentValue.reset();
    setEditingValidation(undefined);
    const resetDraft = toTextValue(defaultValue as T | string | undefined, formatter, formatterContext);
    setDraft(resetDraft);
    if (inputRef.current) {
      inputRef.current.defaultValue = resetDraft;
      inputRef.current.value = resetDraft;
    }
  }, [currentValue, defaultValue, formatter, formatterContext]);
  useNSEControlFormReset(inputRef, resetText);

  const validatePartial = useCallback((text: string) => {
    if (!formatter || !formatterContext) return true;
    const partial = formatter.isPartialStringValid(text, formatterContext);
    if (partial.valid) {
      setEditingValidation(undefined);
      if (partial.replacement !== undefined && partial.replacement !== text) setDraft(partial.replacement);
      return true;
    }
    setEditingValidation({
      kind: "invalid",
      code: partial.error?.code ?? "invalid-partial",
      message: partial.error?.message ?? "This value is incomplete.",
    });
    return false;
  }, [formatter, formatterContext]);

  const commit = useCallback(async () => {
    if (disabled || readOnly) return false;
    if (!formatter || !formatterContext) {
      if (commandBinding) {
        const result = await command.dispatch(draft);
        if (result?.status !== "executed") return false;
      }
      currentValue.change(draft, "commit");
      return true;
    }
    const parsed = formatter.getObjectValue(draft, formatterContext);
    if (!parsed.ok) {
      setEditingValidation({ kind: "invalid", code: parsed.error.code, message: parsed.error.message });
      return false;
    }
    setEditingValidation(undefined);
    if (commandBinding) {
      const result = await command.dispatch(parsed.value);
      if (result?.status !== "executed") return false;
    }
    currentValue.change(parsed.value, "commit");
    setDraft(formatter.editingString(parsed.value, formatterContext));
    return true;
  }, [command, commandBinding, currentValue, disabled, draft, formatter, formatterContext, readOnly]);

  return (
    <>
      <label
        {...theme.events}
        {...nseControlHooks({ control: "text-field", enabled: isEnabled, hovered: theme.hovered, focused: theme.focused, variants: { "control-size": controlSize, editable: String(!readOnly) } })}
        data-nse-part="content"
        className={classes("nse-control-text-field", disabled && "is-disabled", className)}
        data-invalid={invalidState ? "true" : "false"}
        data-position={groupPosition}
        data-size={height !== undefined ? "custom" : controlSize}
        style={sizedControlStyle(undefined, height, undefined)}
        htmlFor={inputId}
      >
        {label ? <span data-nse-part="label" className="nse-control-field-label">{label}</span> : null}
        <span data-nse-part="bezel" className="nse-control-field-frame">
          {prefix ? <span data-nse-part="prefix" className="nse-control-field-affix">{prefix}</span> : null}
          <input
          {...inputProps}
          data-nse-part="field"
          ref={inputRef}
          id={inputId}
          name={name}
          value={draft}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-invalid={invalidState || undefined}
          aria-describedby={describedBy}
          onInvalid={(event) => {
            onInvalid?.(event);
            if (!event.defaultPrevented) {
              setEditingValidation({ kind: "invalid", code: "native-constraint", message: event.currentTarget.validationMessage || "This value needs attention." });
            }
          }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onChange?.(event);
            const nextText = event.currentTarget.value;
            skipNextBlurCommit.current = false;
            setDraft(nextText);
            if (composing.current) return;
            if (isFormatted) {
              if (validatePartial(nextText) && formatter && formatterContext) {
                const parsed = formatter.getObjectValue(nextText, formatterContext);
                if (parsed.ok) currentValue.change(parsed.value, "preview");
              }
            } else currentValue.change(nextText, "preview");
          }}
          onCompositionStart={(event) => {
            composing.current = true;
            onCompositionStart?.(event);
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            const nextText = event.currentTarget.value;
            setDraft(nextText);
            if (isFormatted) {
              if (validatePartial(nextText) && formatter && formatterContext) {
                const parsed = formatter.getObjectValue(nextText, formatterContext);
                if (parsed.ok) currentValue.change(parsed.value, "preview");
              }
            } else currentValue.change(nextText, "preview");
            onCompositionEnd?.(event);
          }}
          onBlur={(event) => {
            if (skipNextBlurCommit.current) skipNextBlurCommit.current = false;
            else void commit();
            onBlur?.(event);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              onKeyDown?.(event);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              void commit();
            } else if (event.key === "Escape") {
              // Escape always reverts and publishes "cancel", but claims the
              // key only when there was an edit to revert; on a clean field it
              // falls through, so it can still dismiss the panel it sits in.
              if (invalidState || draft !== toTextValue(currentValue.value, formatter, formatterContext)) event.preventDefault();
              setEditingValidation(undefined);
              setDraft(toTextValue(currentValue.value, formatter, formatterContext));
              skipNextBlurCommit.current = true;
              currentValue.cancel();
            }
            onKeyDown?.(event);
          }}
          />
          {suffix ? <span data-nse-part="suffix" className="nse-control-field-affix">{suffix}</span> : null}
        </span>
      </label>
      {invalidState ? <span id={errorId} data-nse-part="error" className="nse-control-field-error" role="alert">{effectiveValidation.message}</span> : null}
    </>
  );
}

export interface NSEInputBoxProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode;
  invalid?: boolean;
  /** NSControl.isEnabled (default true). */
  isEnabled?: boolean;
  /** Render with the focused appearance even when nothing inside has focus. */
  alwaysLooksFocused?: boolean;
}

/**
@internal The developer Inspector's export box. Apps compose a field's affixes with NSETextField's
`prefix` and `suffix`.

A box styled like a single input that wraps a set of controls — an icon, the text input, a button —
so they appear to live inside one field. It takes on the focused look whenever any
child is focused, or always when `alwaysLooksFocused` is set.
*/
export function NSEInputBox({
  label,
  invalid = false,
  isEnabled = true,
  alwaysLooksFocused = false,
  className = "",
  children,
  ...props
}: NSEInputBoxProps) {
  return (
    <div
      {...props}
      data-nse-control="text-field" data-nse-part="content" data-nse-enabled={isEnabled ? undefined : "false"}
      className={classes("nse-control-input-box", !isEnabled && "is-disabled", className)}
      data-invalid={invalid ? "true" : "false"}
      data-always-focused={alwaysLooksFocused ? "true" : "false"}
      aria-disabled={!isEnabled || undefined}
    >
      {label ? <span data-nse-part="label" className="nse-control-field-label">{label}</span> : null}
      <div data-nse-part="bezel" className="nse-control-field-frame nse-control-input-box-frame">{children}</div>
    </div>
  );
}

export interface NSESwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "defaultChecked" | "disabled" | "title"> {
  /** The theme's thumb: the standard glass thumb or brushed metal. */
  thumbMaterial?: NSEThumbMaterial;
  /** NSSwitch.state. */
  state?: "on" | "off";
  defaultState?: "on" | "off";
  /** Called with the new state after the user flips the switch. */
  onStateChange?: (state: "on" | "off") => void;
  /** NSControl.isEnabled. Defaults to true. */
  isEnabled?: boolean;
  /** NSView.toolTip. */
  toolTip?: string;
  /** The words the track shows on each side. */
  onLabel?: string;
  offLabel?: string;
  selectionHaptic?: HFXFeedbackRequest;
}

type NSESwitchControlProps = Omit<NSESwitchProps, "state" | "defaultState" | "onStateChange"> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

/** NSSwitch: an on/off switch. Bound through Cocoa Bindings' `value`, it reads and writes a Boolean. */
export function NSESwitch(props: NSEBoundValueProps<boolean, NSESwitchProps, 'state' | 'defaultState' | 'onStateChange'>) {
  const bound = useNSEValueBinding<boolean, NSESwitchControlProps & { binding?: unknown }, 'checked' | 'onCheckedChange'>(
    toSwitchControlProps(props) as never,
    { value: 'checked', change: 'onCheckedChange', excludes: ['defaultChecked'], fallback: false },
  ) as NSESwitchControlProps & { disabled?: boolean };
  const { disabled, ...rest } = bound;
  return <NSESwitchControl {...rest} isEnabled={(rest.isEnabled ?? true) && !disabled} />;
}

function toSwitchControlProps(props: NSESwitchProps & { binding?: unknown }): NSESwitchControlProps & { binding?: unknown } {
  const { state, defaultState, onStateChange, ...rest } = props;
  return {
    ...rest,
    ...(state !== undefined ? { checked: state === "on" } : {}),
    ...(defaultState !== undefined ? { defaultChecked: defaultState === "on" } : {}),
    ...(onStateChange ? { onCheckedChange: (checked: boolean) => onStateChange(checked ? "on" : "off") } : {}),
  };
}

function NSESwitchControl({
  thumbMaterial = "standard",
  checked,
  defaultChecked,
  onCheckedChange,
  onLabel = "On",
  offLabel = "Off",
  selectionHaptic = "selection",
  className = "",
  isEnabled = true,
  toolTip,
  onClick,
  onKeyDown,
  style,
  type = "button",
  ...props
}: NSESwitchControlProps) {
  const disabled = !isEnabled;
  const theme = useNSEThemeInteraction<HTMLButtonElement>(isEnabled, true, props);
  const { triggerNSEControlHaptic, triggerNSEControlHapticForEvent } = useNSEControlFeedback();

  const toggleRef = useRef<HTMLButtonElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const onTextRef = useRef<HTMLSpanElement>(null);
  const offTextRef = useRef<HTMLSpanElement>(null);
  const [labelWidth, setLabelWidth] = useState(0);
  useLayoutEffect(() => {
    const labels = [onTextRef.current, offTextRef.current].filter((node): node is HTMLSpanElement => !!node);
    const measure = () => setLabelWidth(Math.max(0, ...labels.map(node => node.offsetWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    labels.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [onLabel, offLabel]);
  const dragState = useRef({ pointerId: -1, startX: 0, moved: false });
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const [isDragging, setDragging] = useState(false);
  const [isChecked, setChecked] = useControllableState({
    value: checked,
    defaultValue: defaultChecked,
    fallback: false,
    onChange: onCheckedChange
  });
  const displayPercent = dragPercent ?? (isChecked ? 1 : 0);
  const toggleStyle = {
    ...style,
    "--nse-control-toggle-label-width": `${labelWidth}px`,
    "--nse-control-toggle-ratio": displayPercent,
    "--nse-control-toggle-thumb-x": `${displayPercent * TOGGLE_TRAVEL_PX}px`
  } as CSSVarStyle;

  function getPercentFromPointer(clientX: number) {
    const rect = toggleRef.current?.getBoundingClientRect();
    if (!rect) return isChecked ? 1 : 0;
    const thumbWidth = thumbRef.current?.getBoundingClientRect().width || TOGGLE_THUMB_PX;
    const start = TOGGLE_INSET_PX + thumbWidth / 2;
    const end = rect.width - TOGGLE_INSET_PX - thumbWidth / 2;
    return clamp((clientX - rect.left - start) / Math.max(1, end - start), 0, 1);
  }

  function setToggleChecked(nextChecked: boolean) {
    if (nextChecked !== isChecked) {
      triggerNSEControlHaptic(selectionHaptic);
    }
    setChecked(nextChecked);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    event.preventDefault();
    dragState.current = { pointerId: event.pointerId, startX: event.clientX, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragPercent(isChecked ? 1 : 0);
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragState.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (Math.abs(event.clientX - dragState.current.startX) > 3) {
      dragState.current.moved = true;
    }
    setDragPercent(getPercentFromPointer(event.clientX));
  }

  function finishPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragState.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const moved = dragState.current.moved || Math.abs(event.clientX - dragState.current.startX) > 3;
    const nextChecked = moved ? getPercentFromPointer(event.clientX) >= 0.5 : !isChecked;
    dragState.current = { pointerId: -1, startX: 0, moved: false };
    setDragging(false);
    setDragPercent(null);
    setToggleChecked(nextChecked);
  }

  function cancelPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragState.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragState.current = { pointerId: -1, startX: 0, moved: false };
    setDragging(false);
    setDragPercent(null);
  }

  return (
    <button
      ref={toggleRef}
      className={classes("nse-control-toggle", className)}
      {...props}
      {...theme.events}
      {...nseControlHooks({ control: "switch", state: isChecked ? "on" : "off", highlighted: theme.highlighted || isDragging, enabled: isEnabled, hovered: theme.hovered, focused: theme.focused })}
      data-nse-part="background"
      type={type}
      role="switch"
      title={toolTip}
      aria-checked={isChecked}
      data-thumb-material={thumbMaterial}
      data-state={isChecked ? "on" : "off"}
      data-dragging={isDragging ? "true" : "false"}
      disabled={disabled}
      style={toggleStyle}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        if (disabled) {
          onKeyDown?.(event);
          return;
        }
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          setToggleChecked(!isChecked);
        } else if (event.key === "ArrowRight" || event.key === "End") {
          event.preventDefault();
          setToggleChecked(true);
        } else if (event.key === "ArrowLeft" || event.key === "Home") {
          event.preventDefault();
          setToggleChecked(false);
        }
        onKeyDown?.(event);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={cancelPointer}
    >
      <span data-nse-part="bezel" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      <span className="nse-control-visually-hidden">{isChecked ? onLabel : offLabel}</span>
      <span data-nse-part="track" className="nse-control-toggle-track" aria-hidden="true">
        <span data-nse-part="fill" className="nse-control-toggle-rail nse-control-toggle-rail-start" />
        <span data-nse-part="fill" className="nse-control-toggle-rail nse-control-toggle-rail-end" />
        <span data-nse-part="title" className="nse-control-toggle-text nse-control-toggle-text-on"><span className="nse-control-toggle-state-label" ref={onTextRef}>{onLabel}</span></span>
        <span data-nse-part="title" className="nse-control-toggle-text nse-control-toggle-text-off"><span className="nse-control-toggle-state-label" ref={offTextRef}>{offLabel}</span></span>
        <span data-nse-part="knob" className="nse-control-toggle-thumb" ref={thumbRef}>{thumbMaterial === "metal" ? <NSEMetalThumb disabled={disabled} /> : null}</span>
      </span>
    </button>
  );
}

export interface NSERadioOption {
  value: string;
  label: ReactNode;
  isEnabled?: boolean;
  command?: NSEControlCommandBinding<{ readonly value: string }>;
}

export interface NSERadioGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: NSERadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, phase: "commit") => void;
  label?: string;
  /** New callers should supply a native group name. An ID-backed compatibility name protects existing callers. */
  name?: string;
  required?: boolean;
  isEnabled?: boolean;
  validation?: NSEControlValidation;
  selectionHaptic?: HFXFeedbackRequest;
}

interface NSERadioOptionControlProps {
  readonly option: NSERadioOption;
  readonly selected: boolean;
  readonly position: "single" | "first" | "middle" | "last";
  readonly name: string;
  readonly required?: boolean;
  readonly disabled: boolean;
  readonly tabStop: boolean;
  readonly onAvailabilityChange: (value: string, available: boolean | null) => void;
  readonly inputRef: (node: HTMLInputElement | null) => void;
  readonly onCommit: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

function NSERadioOptionControl({ option, selected, position, name, required, disabled, tabStop, onAvailabilityChange, inputRef, onCommit, onKeyDown }: NSERadioOptionControlProps) {
  const command = useNSEControlCommand(option.command);
  const presentation = command.presentation;
  const theme = useNSEThemeInteraction<HTMLLabelElement>(!disabled && option.isEnabled !== false, true);
  const optionDisabled = disabled || option.isEnabled === false || Boolean(option.command && (!presentation?.enabled || presentation.denied || presentation.hidden || presentation.stale));
  useEffect(() => {
    onAvailabilityChange(option.value, !optionDisabled);
    return () => onAvailabilityChange(option.value, null);
  }, [onAvailabilityChange, option.value, optionDisabled]);
  return (
    <label
      data-nse-part="cell"
      data-nse-button-type="radio"
      {...theme.events}
      {...nseStateHooks({ state: selected ? "on" : "off", selected, enabled: !optionDisabled, highlighted: theme.highlighted, hovered: theme.hovered, focused: theme.focused })}
      className="nse-control-radio"
      data-position={position}
      data-selected={selected ? "true" : "false"}
      data-disabled={optionDisabled ? "true" : "false"}
      hidden={presentation?.hidden}
    >
      <input
        ref={inputRef}
        className="nse-control-visually-hidden"
        type="radio"
        name={name}
        value={option.value}
        required={required}
        disabled={optionDisabled}
        checked={selected}
        aria-checked={selected}
        tabIndex={tabStop && !optionDisabled ? 0 : -1}
        onChange={() => {
          if (optionDisabled) return;
          void (async () => {
            if (option.command) {
              const result = await command.dispatch();
              if (result?.status !== "executed") return;
            }
            onCommit();
          })();
        }}
        onKeyDown={onKeyDown}
      />
      <span data-nse-part="title">{option.label}</span>
    </label>
  );
}

export function NSERadioGroup(props: NSEBoundValueProps<string, NSERadioGroupProps, 'value' | 'defaultValue' | 'onValueChange' | 'undoManager'>) {
  return <NSERadioGroupControl {...useNSEValueBinding<string, NSERadioGroupProps, 'value' | 'defaultValue' | 'onValueChange' | 'undoManager'>(props, {fallback:''})} />;
}

function NSERadioGroupControl({
  options,
  value,
  defaultValue,
  onValueChange,
  label,
  name,
  required,
  isEnabled = true,
  validation,
  selectionHaptic = "selection",
  className = "",
  onKeyDown,
  dir,
  ...props
}: NSERadioGroupProps) {
  const disabled = !isEnabled;
  const { triggerNSEControlHaptic, triggerNSEControlHapticForEvent } = useNSEControlFeedback();

  const theme = useNSEThemeInteraction<HTMLDivElement>(isEnabled, false, props);
  const generatedName = useId();
  const groupName = name ?? generatedName;
  const firstInputRef = useRef<HTMLInputElement>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const [availability, setAvailability] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const reportAvailability = useCallback((value: string, available: boolean | null) => {
    setAvailability(previous => {
      if (available === null ? !previous.has(value) : previous.get(value) === available) return previous;
      const next = new Map(previous);
      if (available === null) next.delete(value); else next.set(value, available);
      return next;
    });
  }, []);
  const fallbackValue = defaultValue ?? options.find((option) => option.isEnabled !== false)?.value ?? "";
  const currentValue = useNSEControlValue<string>({
    value,
    defaultValue,
    fallback: fallbackValue,
    required,
    isEnabled,
    validation,
    onValueChange(value, phase) {
      if (phase === "commit") onValueChange?.(value, "commit");
    },
  });
  useNSEControlFormReset(firstInputRef, currentValue.reset);
  const enabledOptions = disabled ? [] : options.filter(option => option.isEnabled !== false && (!option.command || availability.get(option.value) === true));
  const tabStopValue = enabledOptions.find(option => option.value === currentValue.value)?.value ?? enabledOptions[0]?.value;
  const invalid = validation?.kind === "invalid";
  const errorId = `${groupName}-error`;
  const describedBy = [props["aria-describedby"], invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  function setRadioValue(nextValue: string) {
    if (nextValue !== currentValue.value) {
      triggerNSEControlHaptic(selectionHaptic);
    }
    currentValue.change(nextValue, "commit");
  }

  function moveSelection(direction: 1 | -1, focusedValue: string) {
    const currentIndex = enabledOptions.findIndex((option) => option.value === focusedValue);
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + enabledOptions.length) % enabledOptions.length;
    const nextOption = enabledOptions[nextIndex];
    if (nextOption) {
      const input = inputRefs.current.get(nextOption.value);
      input?.focus({ preventScroll: true });
      input?.click();
    }
  }

  return (
    <div
      data-nse-part="content"
      {...nseControlHooks({ control: "matrix", enabled: isEnabled, hovered: theme.hovered, focused: theme.focused })}
      className={classes("nse-control-radio-group", className)}
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      dir={dir}
      {...props}
      {...theme.events}
    >
      {options.map((option, index) => {
        const selected = option.value === currentValue.value;
        const position = options.length === 1
          ? "single"
          : index === 0
            ? "first"
            : index === options.length - 1
              ? "last"
              : "middle";
        return (
          <NSERadioOptionControl
            key={option.value}
            option={option}
            selected={selected}
            position={position}
            name={groupName}
            required={required}
            disabled={disabled}
            tabStop={option.value === tabStopValue}
            onAvailabilityChange={reportAvailability}
            inputRef={(node) => {
                if (node) inputRefs.current.set(option.value, node);
                else inputRefs.current.delete(option.value);
                if (index === 0) {
                  firstInputRef.current = node;
                }
              }}
            onCommit={() => setRadioValue(option.value)}
            onKeyDown={(event) => {
                const rtl = dir === "rtl";
                if (event.key === "ArrowDown" || event.key === (rtl ? "ArrowLeft" : "ArrowRight")) {
                  event.preventDefault();
                  moveSelection(1, event.currentTarget.value);
                } else if (event.key === "ArrowUp" || event.key === (rtl ? "ArrowRight" : "ArrowLeft")) {
                  event.preventDefault();
                  moveSelection(-1, event.currentTarget.value);
                }
                onKeyDown?.(event as unknown as KeyboardEvent<HTMLDivElement>);
              }}
          />
        );
      })}
      {invalid ? <span id={errorId} data-nse-part="error" className="nse-control-field-error" role="alert">{validation.message}</span> : null}
    </div>
  );
}

/** NSBox.TitlePosition. */
export type NSEBoxTitlePosition =
  | "noTitle"
  | "aboveTop"
  | "atTop"
  | "belowTop"
  | "aboveBottom"
  | "atBottom"
  | "belowBottom";

/** NSBox.BoxType. */
export type NSEBoxType = "primary" | "secondary" | "separator" | "custom";
/** NSBorderType. */
export type NSEBorderType = "noBorder" | "lineBorder" | "bezelBorder" | "grooveBorder";

/** NSBox.contentViewMargins: the horizontal (width) and vertical (height) distance from the border to the content. */
export interface NSEBoxContentViewMargins {
  readonly width: number;
  readonly height: number;
}

/**
 * How a container lays out its children. `stack` (the default) is a
 * leading-aligned column at standard spacing where fields, sliders and lists
 * fill and controls keep their natural size, as SwiftUI's GroupBox does.
 * `flow` leaves children in plain block flow for fully custom layout.
 */
export type NSEContentLayout = "stack" | "flow";

export interface NSEBoxProps extends Omit<HTMLAttributes<HTMLFieldSetElement>, "title">, NSEViewLayerProperties {
  /** NSBox.title. A titled separator draws its title as the theme's captioned separator. */
  title?: ReactNode;
  /** NSBox.titlePosition (default atTop with a title, otherwise noTitle). */
  titlePosition?: NSEBoxTitlePosition;
  /** NSBox.boxType (default primary). */
  boxType?: NSEBoxType;
  /** NSBox.borderType (default bezelBorder). */
  borderType?: NSEBorderType;
  /** NSBox.contentViewMargins. Without them the content sits at the standard content margin, and rows run edge to edge. */
  contentViewMargins?: NSEBoxContentViewMargins;
  contentLayout?: NSEContentLayout;
  /** NSBox.fillColour, as one CSS background value. */
  fillColour?: string;
  /** NSBox.borderColour, as one CSS colour value. */
  borderColour?: string;
  /** NSBox.borderWidth. Explicit widths override the theme's frame thickness. */
  borderWidth?: number;
  /** NSBox.isTransparent: leave the interior unpainted. */
  isTransparent?: boolean;
}

function validateNSEBoxFill(fill: string | undefined): string | undefined {
  if (fill === undefined) return undefined;
  if (typeof fill !== "string") throw new TypeError("NSEBox fillColour must be a CSS background string.");
  const value = fill.trim();
  if (!value || value.length > 512 || /[;{}]/u.test(value)) {
    throw new TypeError("NSEBox fillColour must be one safe CSS background value.");
  }
  const css = globalThis.CSS;
  if (css && typeof css.supports === "function" && !css.supports("background", value)) {
    throw new TypeError(`NSEBox fillColour is not a supported CSS background: ${value}`);
  }
  return value;
}

function validateNSEBoxMargins(margins: NSEBoxContentViewMargins | undefined): NSEBoxContentViewMargins | undefined {
  if (margins === undefined) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(margins);
  const result = {} as Record<keyof NSEBoxContentViewMargins, number>;
  for (const axis of ["width", "height"] as const) {
    const descriptor = descriptors[axis];
    if (!descriptor || "get" in descriptor || "set" in descriptor) {
      throw new TypeError(`NSEBox contentViewMargins ${axis} must be a data property.`);
    }
    const value = descriptor.value;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 4096) {
      throw new RangeError(`NSEBox contentViewMargins ${axis} must be a finite number from 0 to 4096.`);
    }
    result[axis] = value;
  }
  return result;
}

// The theme's recipes and attributes keep their own spellings.
const titlePositionAttribute: Record<NSEBoxTitlePosition, string> = {
  noTitle: "none", aboveTop: "above-top", atTop: "at-top", belowTop: "below-top",
  aboveBottom: "above-bottom", atBottom: "at-bottom", belowBottom: "below-bottom",
};
const borderAttribute: Record<NSEBorderType, string> = { noBorder: "none", lineBorder: "line", bezelBorder: "bezel", grooveBorder: "groove" };

export function NSEBox({
  title,
  titlePosition = title ? "atTop" : "noTitle",
  boxType = "primary",
  borderType = "bezelBorder",
  contentViewMargins,
  contentLayout = "stack",
  fillColour,
  borderColour,
  borderWidth,
  isTransparent = false,
  shadow,
  cornerRadius,
  cornerCurve,
  className = "",
  style,
  children,
  ...props
}: NSEBoxProps) {
  const layer = useNSEViewLayerProperties({ shadow, cornerRadius, cornerCurve });
  const resolvedBorder = borderColour === undefined ? undefined : nseCSSValue(borderColour, "color", "NSEBox borderColour");
  const resolvedWidth = nseNonNegative(borderWidth, "borderWidth");
  const position = titlePositionAttribute[titlePosition];
  const border = borderAttribute[borderType];
  if (boxType === "separator") {
    if (children !== undefined && children !== null && import.meta.env.DEV) {
      throw new TypeError("NSEBox separators cannot contain children.");
    }
    const separatorLabel = props["aria-label"] ?? (typeof title === "string" ? title : undefined);
    if (title && titlePosition !== "noTitle") {
      return <NSEDivider data-nse-control="box" data-nse-box-type={boxType} data-nse-title-position={titlePosition} data-nse-border-type={borderType} className={classes("nse-box", "nse-box-separator-titled", className)} variant="alpha" caption={title} label={separatorLabel} style={style} />;
    }
    return (
      <div
        {...props as HTMLAttributes<HTMLDivElement>}
        data-nse-control="box" data-nse-part="separator" data-nse-box-type={boxType} data-nse-title-position={titlePosition} data-nse-border-type={borderType}
        role="separator"
        aria-label={separatorLabel}
        className={classes("nse-box", "nse-box-separator", className)}
        data-title-position={position}
        data-box-kind="separator"
        data-border-style={border}
        data-appearance-recipe={`box.separator.${border}.${position}`}
        style={style}
      />
    );
  }

  const resolvedFill = validateNSEBoxFill(fillColour);
  const resolvedMargins = validateNSEBoxMargins(contentViewMargins);
  const customStyle: CSSVarStyle = {
    ...style,
    ...layer.style,
    ...(resolvedBorder !== undefined ? { "--nse-box-border-colour": resolvedBorder } : {}),
    ...(resolvedWidth !== undefined ? { "--nse-box-border-width": `${resolvedWidth}px` } : {}),
    ...(resolvedFill ? { "--nse-box-fill": resolvedFill } : null),
    // Explicit margins win; otherwise the standard margins resolve through
    // --nse-box-margin-* (nse-layout-defaults.css), which also drops them to
    // zero when the box holds rows.
    ...(resolvedMargins ? {
      "--nse-box-inset-top": `${resolvedMargins.height}px`,
      "--nse-box-inset-right": `${resolvedMargins.width}px`,
      "--nse-box-inset-bottom": `${resolvedMargins.height}px`,
      "--nse-box-inset-left": `${resolvedMargins.width}px`,
    } : {
      "--nse-box-inset-top": "var(--nse-box-margin-top, 0px)",
      "--nse-box-inset-right": "var(--nse-box-margin-right, 0px)",
      "--nse-box-inset-bottom": "var(--nse-box-margin-bottom, 0px)",
      "--nse-box-inset-left": "var(--nse-box-margin-left, 0px)",
    }),
  };
  const visuallyIntegratedTitle = Boolean(title) && titlePosition === "atTop";

  return (
    <fieldset
      {...props}
      data-nse-control="box" data-nse-part="bezel" data-nse-box-type={boxType} data-nse-title-position={titlePosition} data-nse-border-type={borderType}
      {...layer.attributes}
      className={classes(
        "nse-box",
        "nse-control-group-box",
        visuallyIntegratedTitle && "is-labeled",
        className,
      )}
      data-title-position={position}
      data-box-kind={boxType}
      data-border-style={border}
      data-transparent={String(isTransparent)}
      data-custom-fill={resolvedFill === undefined ? undefined : "true"}
      data-custom-border={resolvedBorder !== undefined || resolvedWidth !== undefined || cornerRadius !== undefined || cornerCurve !== undefined ? "true" : undefined}
      data-appearance-recipe={`box.${boxType}.${border}.${position}`}
      data-nse-layout-margins={resolvedMargins ? undefined : "standard"}
      style={customStyle}
    >
      {title ? (
        <legend
          data-nse-part="title"
          className={classes(
            "nse-control-group-label",
            "nse-box-title",
            titlePosition === "noTitle" && "nse-control-visually-hidden",
          )}
        >
          {title}
        </legend>
      ) : null}
      <div data-nse-part="content" className="nse-control-group-inner nse-box-content" data-nse-content-layout={contentLayout === "stack" ? "stack" : undefined}>{children}</div>
    </fieldset>
  );
}

export { NSESearchField } from "./NSESearchField";
export type { NSESearchFieldProps } from "./NSESearchField";
