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

import { NSEMetalThumb, type NSEThumbMaterial } from "../../Appearance/NSEMetalThumb";
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
import type { Formatter, FormatterContext } from "../../../SynCloudOS/Models";
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
  formatter: Formatter<T>;
  formatterContext: FormatterContext;
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
  "prefix" | "value" | "defaultValue" | "height"
> {
  value?: T;
  defaultValue?: T;
  invalid?: boolean;
  formatter?: Formatter<T>;
  formatterContext?: FormatterContext;
  command?: NSEControlCommandBinding<T>;
  onValueChange?(value: T, phase: NSEControlInteractionPhase): void;
}

function toTextValue<T>(value: T | undefined, formatter: Formatter<T> | undefined, context: FormatterContext | undefined) {
  if (formatter && value !== undefined && context) return formatter.editingText(value, context);
  return value === undefined ? "" : String(value);
}

export function NSETextField<T = string>(props: NSETextFieldProps<T>) {
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
    disabled,
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
    disabled,
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
    const partial = formatter.validatePartial(text, formatterContext);
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
    const parsed = formatter.parse(draft, formatterContext);
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
    setDraft(formatter.editingText(parsed.value, formatterContext));
    return true;
  }, [command, commandBinding, currentValue, disabled, draft, formatter, formatterContext, readOnly]);

  return (
    <>
      <label
        className={classes("nse-control-text-field", disabled && "is-disabled", className)}
        data-invalid={invalidState ? "true" : "false"}
        data-position={groupPosition}
        data-size={height !== undefined ? "custom" : controlSize}
        style={sizedControlStyle(undefined, height, undefined)}
        htmlFor={inputId}
      >
        {label ? <span className="nse-control-field-label">{label}</span> : null}
        <span className="nse-control-field-frame">
          {prefix ? <span className="nse-control-field-affix">{prefix}</span> : null}
          <input
          {...inputProps}
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
                const parsed = formatter.parse(nextText, formatterContext);
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
                const parsed = formatter.parse(nextText, formatterContext);
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
          {suffix ? <span className="nse-control-field-affix">{suffix}</span> : null}
        </span>
      </label>
      {invalidState ? <span id={errorId} className="nse-control-field-error" role="alert">{effectiveValidation.message}</span> : null}
    </>
  );
}

export interface NSEInputBoxProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode;
  invalid?: boolean;
  disabled?: boolean;
  /** Render with the focused appearance even when nothing inside has focus. */
  alwaysLooksFocused?: boolean;
}

/**
A box styled like a single input that wraps a set of controls — an icon, the text input, a button —
so they appear to live inside one field. It takes on the focused look whenever any
child is focused, or always when `alwaysLooksFocused` is set.
*/
export function NSEInputBox({
  label,
  invalid = false,
  disabled = false,
  alwaysLooksFocused = false,
  className = "",
  children,
  ...props
}: NSEInputBoxProps) {
  return (
    <div
      {...props}
      className={classes("nse-control-input-box", disabled && "is-disabled", className)}
      data-invalid={invalid ? "true" : "false"}
      data-always-focused={alwaysLooksFocused ? "true" : "false"}
      aria-disabled={disabled || undefined}
    >
      {label ? <span className="nse-control-field-label">{label}</span> : null}
      <div className="nse-control-field-frame nse-control-input-box-frame">{children}</div>
    </div>
  );
}

interface NSECheckboxPropsBase extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "checked" | "defaultChecked" | "onChange"
> {
  label: ReactNode;
  /** Native form submission value; defaults to the browser's normal "on" value. */
  submissionValue?: string;
  state?: NSECheckboxState;
  defaultState?: NSECheckboxState;
  mixed?: boolean;
  command?: NSEControlCommandBinding<void>;
  validation?: NSEControlValidation;
  onStateChange?(state: NSECheckboxState, phase: "commit"): void;
  /** Existing native callback kept as a narrow compatibility entry point. */
  onCheckedChange?(checked: boolean): void;
  selectionHaptic?: HFXFeedbackRequest;
}

/**
 * `state`/`defaultState` model the complete native checkbox state machine. The
 * legacy checked props remain deliberately narrow compatibility aliases.
 */
export interface NSECheckboxProps extends NSECheckboxPropsBase {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
}

export function NSECheckbox({
  label,
  state,
  defaultState,
  checked,
  defaultChecked,
  mixed,
  submissionValue,
  command: commandBinding,
  validation,
  onStateChange,
  onCheckedChange,
  selectionHaptic = "selection",
  className = "",
  id,
  disabled,
  readOnly,
  onChange,
  ...props
}: NSECheckboxProps) {
  const { triggerNSEControlHaptic, triggerNSEControlHapticForEvent } = useNSEControlFeedback();

  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultCheckboxState = defaultState ?? (defaultChecked ?? false);
  const currentState = useNSEControlValue<NSECheckboxState>({
    value: state ?? (mixed ? "mixed" : checked),
    defaultValue: defaultCheckboxState,
    fallback: false,
    disabled,
    readOnly,
    required: props.required,
    validation,
    onValueChange(nextState, phase) {
      if (phase !== "commit") return;
      onStateChange?.(nextState, "commit");
      if (typeof nextState === "boolean") onCheckedChange?.(nextState);
    },
  });
  const command = useNSEControlCommand(commandBinding);
  const restoreMixedAfterReset = useCallback(() => {
    if (inputRef.current) inputRef.current.indeterminate = defaultCheckboxState === "mixed";
  }, [defaultCheckboxState]);
  useNSEControlFormReset(inputRef, currentState.reset, restoreMixedAfterReset);

  useLayoutEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = currentState.value === "mixed";
  }, [currentState.value]);

  const invalid = validation?.kind === "invalid";
  const errorId = `${inputId}-error`;
  const describedBy = [props["aria-describedby"], invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <>
      <label
        className={classes("nse-control-checkbox", disabled && "is-disabled", className)}
        htmlFor={inputId}
        data-state={currentState.value === "mixed" ? "mixed" : currentState.value ? "checked" : "unchecked"}
        data-disabled={disabled ? "true" : "false"}
      >
        <span className="nse-control-checkbox-control">
          <input
          {...props}
          ref={inputRef}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          readOnly={readOnly}
          checked={currentState.value === true}
          value={submissionValue}
          aria-checked={currentState.value === "mixed" ? "mixed" : currentState.value}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onClick={(event) => {
            if (readOnly) event.preventDefault();
          }}
          onChange={(event) => {
            onChange?.(event);
            if (readOnly || disabled) return;
            const nextState = event.currentTarget.checked;
            triggerNSEControlHapticForEvent(selectionHaptic, event, !disabled);
            void (async () => {
              if (commandBinding) {
                const result = await command.dispatch();
                if (result?.status !== "executed") return;
              }
              currentState.change(nextState, "commit");
            })();
          }}
          />
          <span className="nse-control-checkbox-art" aria-hidden="true" />
        </span>
        <span className="nse-control-checkbox-label">{label}</span>
      </label>
      {invalid ? <span id={errorId} className="nse-control-field-error" role="alert">{validation.message}</span> : null}
    </>
  );
}

export interface NSEToggleButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "defaultChecked"> {
  thumbMaterial?: NSEThumbMaterial;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onLabel?: string;
  offLabel?: string;
  selectionHaptic?: HFXFeedbackRequest;
}

export function NSEToggleButton({
  thumbMaterial = "standard",
  checked,
  defaultChecked,
  onCheckedChange,
  onLabel = "On",
  offLabel = "Off",
  selectionHaptic = "selection",
  className = "",
  disabled,
  onClick,
  onKeyDown,
  style,
  type = "button",
  ...props
}: NSEToggleButtonProps) {
  const { triggerNSEControlHaptic, triggerNSEControlHapticForEvent } = useNSEControlFeedback();

  const toggleRef = useRef<HTMLButtonElement>(null);
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
    "--nse-control-toggle-ratio": displayPercent,
    "--nse-control-toggle-thumb-x": `${displayPercent * TOGGLE_TRAVEL_PX}px`
  } as CSSVarStyle;

  function getPercentFromPointer(clientX: number) {
    const rect = toggleRef.current?.getBoundingClientRect();
    if (!rect) return isChecked ? 1 : 0;
    const start = TOGGLE_INSET_PX + TOGGLE_THUMB_PX / 2;
    const end = rect.width - TOGGLE_INSET_PX - TOGGLE_THUMB_PX / 2;
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
      type={type}
      role="switch"
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
      <span className="nse-control-visually-hidden">{isChecked ? onLabel : offLabel}</span>
      <span className="nse-control-toggle-track" aria-hidden="true">
        <span className="nse-control-toggle-rail nse-control-toggle-rail-start" />
        <span className="nse-control-toggle-rail nse-control-toggle-rail-end" />
        <span className="nse-control-toggle-text nse-control-toggle-text-on">{onLabel}</span>
        <span className="nse-control-toggle-text nse-control-toggle-text-off">{offLabel}</span>
        <span className="nse-control-toggle-thumb">{thumbMaterial === "metal" ? <NSEMetalThumb disabled={disabled} /> : null}</span>
      </span>
    </button>
  );
}

export interface NSERadioOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
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
  disabled?: boolean;
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
  readonly inputRef: (node: HTMLInputElement | null) => void;
  readonly onCommit: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

function NSERadioOptionControl({ option, selected, position, name, required, disabled, inputRef, onCommit, onKeyDown }: NSERadioOptionControlProps) {
  const command = useNSEControlCommand(option.command);
  const optionDisabled = disabled || Boolean(option.disabled);
  return (
    <label
      className="nse-control-radio"
      data-position={position}
      data-selected={selected ? "true" : "false"}
      data-disabled={optionDisabled ? "true" : "false"}
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
        tabIndex={selected ? 0 : -1}
        onChange={() => {
          if (disabled || option.disabled) return;
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
      {option.label}
    </label>
  );
}

export function NSERadioGroup({
  options,
  value,
  defaultValue,
  onValueChange,
  label,
  name,
  required,
  disabled = false,
  validation,
  selectionHaptic = "selection",
  className = "",
  onKeyDown,
  dir,
  ...props
}: NSERadioGroupProps) {
  const { triggerNSEControlHaptic, triggerNSEControlHapticForEvent } = useNSEControlFeedback();

  const generatedName = useId();
  const groupName = name ?? generatedName;
  const firstInputRef = useRef<HTMLInputElement>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const fallbackValue = defaultValue ?? options.find((option) => !option.disabled)?.value ?? "";
  const currentValue = useNSEControlValue<string>({
    value,
    defaultValue,
    fallback: fallbackValue,
    required,
    disabled,
    validation,
    onValueChange(value, phase) {
      if (phase === "commit") onValueChange?.(value, "commit");
    },
  });
  useNSEControlFormReset(firstInputRef, currentValue.reset);
  const invalid = validation?.kind === "invalid";
  const errorId = `${groupName}-error`;
  const describedBy = [props["aria-describedby"], invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  function setRadioValue(nextValue: string) {
    if (nextValue !== currentValue.value) {
      triggerNSEControlHaptic(selectionHaptic);
    }
    currentValue.change(nextValue, "commit");
  }

  function moveSelection(direction: 1 | -1) {
    const enabledOptions = options.filter((option) => !option.disabled);
    const currentIndex = enabledOptions.findIndex((option) => option.value === currentValue.value);
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
      className={classes("nse-control-radio-group", className)}
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      dir={dir}
      {...props}
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
                  moveSelection(1);
                } else if (event.key === "ArrowUp" || event.key === (rtl ? "ArrowRight" : "ArrowLeft")) {
                  event.preventDefault();
                  moveSelection(-1);
                }
                onKeyDown?.(event as unknown as KeyboardEvent<HTMLDivElement>);
              }}
          />
        );
      })}
      {invalid ? <span id={errorId} className="nse-control-field-error" role="alert">{validation.message}</span> : null}
    </div>
  );
}

export type NSEBoxTitlePosition =
  | "none"
  | "above-top"
  | "at-top"
  | "below-top"
  | "above-bottom"
  | "at-bottom"
  | "below-bottom";

export type NSEBoxKind = "primary" | "secondary" | "separator" | "custom";
export type NSEBoxBorder = "none" | "line" | "bezel" | "groove";

export interface NSEBoxContentInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * A container's layout margins (UIKit's layoutMargins): `standard` insets
 * content by the SDK's content margin, except that rows (list items) run edge
 * to edge like a grouped table section; `none` removes the margins.
 */
export type NSELayoutMargins = "standard" | "none";

/**
 * How a container lays out its children. `stack` (the default) is a
 * leading-aligned column at standard spacing where fields, sliders and lists
 * fill and controls keep their natural size, as SwiftUI's GroupBox does.
 * `flow` leaves children in plain block flow for fully custom layout.
 */
export type NSEContentLayout = "stack" | "flow";

export interface NSEBoxProps extends Omit<HTMLAttributes<HTMLFieldSetElement>, "title"> {
  title?: ReactNode;
  titlePosition?: NSEBoxTitlePosition;
  kind?: NSEBoxKind;
  border?: NSEBoxBorder;
  /** Explicit content insets in pixels. When given, they replace `layoutMargins`. */
  contentInsets?: NSEBoxContentInsets;
  layoutMargins?: NSELayoutMargins;
  contentLayout?: NSEContentLayout;
  fill?: string;
  smoothSurface?: NSESmoothSurfaceRequest;
}

function validateNSEBoxFill(fill: string | undefined): string | undefined {
  if (fill === undefined) return undefined;
  if (typeof fill !== "string") throw new TypeError("NSEBox fill must be a CSS background string.");
  const value = fill.trim();
  if (!value || value.length > 512 || /[;{}]/u.test(value)) {
    throw new TypeError("NSEBox fill must be one safe CSS background value.");
  }
  const css = globalThis.CSS;
  if (css && typeof css.supports === "function" && !css.supports("background", value)) {
    throw new TypeError(`NSEBox fill is not a supported CSS background: ${value}`);
  }
  return value;
}

function validateNSEBoxInsets(insets: NSEBoxContentInsets | undefined): NSEBoxContentInsets | undefined {
  if (insets === undefined) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(insets);
  const result = {} as Record<keyof NSEBoxContentInsets, number>;
  for (const edge of ["top", "right", "bottom", "left"] as const) {
    const descriptor = descriptors[edge];
    if (!descriptor || "get" in descriptor || "set" in descriptor) {
      throw new TypeError(`NSEBox ${edge} inset must be a data property.`);
    }
    const value = descriptor.value;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 4096) {
      throw new RangeError(`NSEBox ${edge} inset must be a finite number from 0 to 4096.`);
    }
    result[edge] = value;
  }
  return result;
}

export function NSEBox({
  title,
  titlePosition = title ? "at-top" : "none",
  kind = "primary",
  border = "bezel",
  contentInsets,
  layoutMargins = "standard",
  contentLayout = "stack",
  fill,
  smoothSurface = false,
  className = "",
  style,
  children,
  ...props
}: NSEBoxProps) {
  if (kind === "separator") {
    if (children !== undefined && children !== null && import.meta.env.DEV) {
      throw new TypeError("NSEBox separators cannot contain children.");
    }
    const separatorLabel = props["aria-label"] ?? (typeof title === "string" ? title : undefined);
    return (
      <div
        {...props as HTMLAttributes<HTMLDivElement>}
        role="separator"
        aria-label={separatorLabel}
        className={classes("nse-box", "nse-box-separator", className)}
        data-title-position={titlePosition}
        data-box-kind="separator"
        data-border-style={border}
        data-appearance-recipe={`box.separator.${border}.${titlePosition}`}
        style={style}
      />
    );
  }

  const resolvedFill = validateNSEBoxFill(fill);
  const resolvedInsets = validateNSEBoxInsets(contentInsets);
  const customStyle: CSSVarStyle = {
    ...style,
    ...(resolvedFill ? { "--nse-box-fill": resolvedFill } : null),
    // Explicit insets win; otherwise the layout margins resolve through
    // --nse-box-margin-* (nse-layout-defaults.css), which also drops them to
    // zero when the box holds rows.
    ...(resolvedInsets ? {
      "--nse-box-inset-top": `${resolvedInsets.top}px`,
      "--nse-box-inset-right": `${resolvedInsets.right}px`,
      "--nse-box-inset-bottom": `${resolvedInsets.bottom}px`,
      "--nse-box-inset-left": `${resolvedInsets.left}px`,
    } : {
      "--nse-box-inset-top": "var(--nse-box-margin-top, 0px)",
      "--nse-box-inset-right": "var(--nse-box-margin-right, 0px)",
      "--nse-box-inset-bottom": "var(--nse-box-margin-bottom, 0px)",
      "--nse-box-inset-left": "var(--nse-box-margin-left, 0px)",
    }),
  };
  const surfaceProps = getControlSmoothSurfaceProps(smoothSurface, className, customStyle);
  const visuallyIntegratedTitle = Boolean(title) && titlePosition === "at-top";

  return (
    <fieldset
      {...props}
      className={classes(
        "nse-box",
        "nse-control-group-box",
        visuallyIntegratedTitle && "is-labeled",
        surfaceProps.className,
      )}
      data-title-position={titlePosition}
      data-box-kind={kind}
      data-border-style={border}
      data-appearance-recipe={`box.${kind}.${border}.${titlePosition}`}
      data-nse-layout-margins={resolvedInsets ? undefined : layoutMargins}
      style={surfaceProps.style}
    >
      {title ? (
        <legend
          className={classes(
            "nse-control-group-label",
            "nse-box-title",
            titlePosition === "none" && "nse-control-visually-hidden",
          )}
        >
          {title}
        </legend>
      ) : null}
      <div className="nse-control-group-inner nse-box-content" data-nse-content-layout={contentLayout === "stack" ? "stack" : undefined}>{children}</div>
    </fieldset>
  );
}

export interface NSEGroupBoxProps extends Omit<
  NSEBoxProps,
  "title" | "titlePosition" | "kind" | "border"
> {
  label?: ReactNode;
}

export function NSEGroupBox({
  label,
  children,
  smoothSurface = false,
  ...props
}: NSEGroupBoxProps) {
  return (
    <NSEBox
      {...props}
      title={label}
      titlePosition={label ? "at-top" : "none"}
      kind="primary"
      border="bezel"
      smoothSurface={smoothSurface}
    >
      {children}
    </NSEBox>
  );
}

export { NSESearchField } from "./NSESearchField";
export type { NSESearchFieldProps } from "./NSESearchField";
