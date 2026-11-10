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

import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from "react";
import { NSEControlImage } from "../Images/NSEControlImage";
import type { NSEThemeControlName } from "../../Theme/contract/vocabulary";
import { nseControlHooks, nseMinimumControlProperties } from "../../Theme/contract/hooks";
import { useNSEThemeInteraction } from "../../Theme/contract/useThemeInteraction";
import type { NSEImage } from "../Images/NSEImageResource";
import type { HFXFeedbackPresetName, HFXFeedbackRequest } from "../../Feedback";
import type { NSEBinding } from "../../Bindings/bindingTypes";
import type { NSEControlActionProps, NSEControlValidation } from "../Core/controlTypes";
import { useNSEControlFormReset, useNSEControlValue } from "../Core";
import { classes, resolveNSEControlHaptic, useNSEControlFeedback } from "../Core/nseControlsShared";
import { useNSEControlCommand } from "../Core/useNSEControlCommand";
import { useNSEActionBinding } from "../Core/useNSEControlAction";
import { useNSEValueBinding } from "../Core/useNSEValueBinding";
import { useNSEButtonPress } from "./useNSEButtonPress";
import { useNSEKeyEquivalent, type NSEKeyEquivalentModifierMask } from "./useNSEKeyEquivalent";

/**
 * NSButton.ButtonType: how the button behaves when clicked.
 * - `momentaryPushIn` highlights while pressed and sends its action (the default);
 * - `pushOnPushOff` and `toggle` show their `state` and alternate it on each click;
 * - `switch` is a checkbox, whose state may also be mixed.
 */
export type NSEButtonType = "momentaryPushIn" | "pushOnPushOff" | "toggle" | "switch";

/**
 * NSButton.BezelStyle: the button's shape, drawn by the theme.
 * - `rounded` is the push button (the default);
 * - `texturedRounded` is the toolbar and inspector button;
 * - `disclosure` is the triangle that shows and hides a section, used with `pushOnPushOff`.
 */
export type NSEBezelStyle = "rounded" | "texturedRounded" | "disclosure";

/** NSControl.ImagePosition: where the image sits against the title. */
export type NSEImagePosition = "noImage" | "imageOnly" | "imageLeading" | "imageTrailing";

/** NSControl.StateValue. */
export type NSEControlStateValue = "on" | "off" | "mixed";

/** NSAppearance.Name: the light (`aqua`) or dark (`darkAqua`) appearance a view draws in. */
import type { NSEAppearanceName } from "../../Appearance/nseAppearanceTypes";

/**
 * NSControl.ControlSize. Capsule bezels draw from one band height: small is 24px, large 28px, and
 * regular is the theme's standard size for the bezel.
 */
export type NSEButtonControlSize = "small" | "regular" | "large";

export interface NSEButtonProps<Payload = unknown>
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "disabled" | "children" | "value" | "defaultValue">,
    NSEControlActionProps<Payload> {
  /** The button's title; for `imageOnly` buttons, the label read to assistive technology. */
  readonly title?: ReactNode;
  readonly buttonType?: NSEButtonType;
  readonly bezelStyle?: NSEBezelStyle;
  /** The button's image: an NSEImage, image URL or drawn element. Template images inherit the content colour. */
  readonly image?: ReactNode | NSEImage;
  /** Defaults to `imageLeading` when the button has an image, otherwise `noImage`. */
  readonly imagePosition?: NSEImagePosition;
  /** The state a `pushOnPushOff`, `toggle` or `switch` button shows. */
  readonly state?: NSEControlStateValue;
  /** The state an uncontrolled `switch` button starts in. */
  readonly defaultState?: NSEControlStateValue;
  /** Whether clicking a `switch` button cycles through the mixed state (NSButton.allowsMixedState). */
  readonly allowsMixedState?: boolean;
  /** Called with the new state after a click changes it (a switch, or an alternating button). */
  onStateChange?(state: NSEControlStateValue): void;
  /** NSControl.isHighlighted: draws the button pressed, as a pop-up button does while its menu shows. */
  readonly isHighlighted?: boolean;
  /** NSControl.isEnabled. Defaults to true. */
  readonly isEnabled?: boolean;
  /**
   * NSButton.keyEquivalent: the key that clicks the button while its window has focus.
   * `"\r"` (Return) makes it the window's default button, which the theme draws as such;
   * `"\u{1b}"` (Escape) suits a Cancel button.
   */
  readonly keyEquivalent?: string;
  readonly keyEquivalentModifierMask?: NSEKeyEquivalentModifierMask;
  /** NSButton.hasDestructiveAction: the button deletes or discards, and the theme draws it as such. */
  readonly hasDestructiveAction?: boolean;
  /** NSView.appearance: draws the button in the light or dark appearance, whatever its window's. */
  readonly appearance?: NSEAppearanceName;
  readonly controlSize?: NSEButtonControlSize;
  /** NSView.toolTip. */
  readonly toolTip?: string;
  /**
   * A `switch` button's value as Cocoa Bindings' `value`: on for true, off for false, and mixed for a
   * selection whose values differ (Cocoa's multiple-values marker).
   */
  readonly binding?: NSEBinding<boolean | "mixed">;
  readonly validation?: NSEControlValidation;
  /** The form value a `switch` button submits when on. */
  readonly submissionValue?: string;
  readonly haptic?: HFXFeedbackRequest;
}

/**
 * @internal The theme's five button arts. Alerts, dialogs and menu triggers still name them until they
 * become NSEAlert and NSEPopUpButton (phases 3 and 6 of the AppKit fidelity sweep); apps set the AppKit
 * properties instead.
 */
export type NSEButtonTone = "medium" | "light" | "dark" | "affirmative" | "negative";

/** @internal The AppKit properties that draw a button with one of the theme's arts. */
export function nseButtonToneProps(tone: NSEButtonTone | undefined): Pick<NSEButtonProps, "appearance" | "keyEquivalent" | "hasDestructiveAction"> {
  switch (tone) {
    case "light": return { appearance: "aqua" };
    case "dark": return { appearance: "darkAqua" };
    case "affirmative": return { keyEquivalent: "\r" };
    case "negative": return { hasDestructiveAction: true };
    default: return {};
  }
}

const TONE_HAPTICS = {
  medium: "medium",
  light: "light",
  dark: "rigid",
  affirmative: "success",
  negative: "error",
} as const satisfies Record<NSEButtonTone, HFXFeedbackPresetName>;

/** The theme draws a default button, a destructive button and a forced appearance with their own art. */
function toneFor(props: Pick<NSEButtonProps, "hasDestructiveAction" | "keyEquivalent" | "appearance" | "bezelStyle">): NSEButtonTone {
  if (props.hasDestructiveAction) return "negative";
  if (props.keyEquivalent === "\r") return "affirmative";
  if (props.appearance === "aqua") return "light";
  if (props.appearance === "darkAqua") return "dark";
  return props.bezelStyle === "texturedRounded" ? "dark" : "medium";
}

function accessibleTitle(title: ReactNode): string | undefined {
  return typeof title === "string" || typeof title === "number" ? String(title) : undefined;
}

const NSEPushButtonCell = forwardRef<HTMLButtonElement, NSEButtonProps>(function NSEPushButtonCell(
  {
    title,
    buttonType = "momentaryPushIn",
    bezelStyle = "rounded",
    image,
    imagePosition,
    state,
    defaultState: _defaultState,
    allowsMixedState: _allowsMixedState,
    onStateChange,
    isHighlighted = false,
    isEnabled = true,
    keyEquivalent,
    keyEquivalentModifierMask,
    hasDestructiveAction,
    appearance,
    controlSize,
    toolTip,
    binding: _binding,
    validation: _validation,
    submissionValue: _submissionValue,
    haptic,
    action,
    actionPayload,
    className = "",
    onClick,
    onPointerDown,
    onLostPointerCapture,
    onKeyDown,
    onKeyUp,
    onBlur,
    type = "button",
    ...props
  },
  forwardedRef,
) {
  const element = useRef<HTMLButtonElement>(null);
  useImperativeHandle(forwardedRef, () => element.current as HTMLButtonElement);
  const { triggerNSEControlHapticForEvent } = useNSEControlFeedback();
  const actionBinding = useNSEActionBinding(action, actionPayload);
  const actionCommand = useNSEControlCommand(actionBinding);
  const presentation = actionCommand.presentation;
  const actionAvailable = actionBinding === undefined || Boolean(
    presentation?.enabled && !presentation.denied && !presentation.hidden && !presentation.stale,
  );
  const disabled = !isEnabled || !actionAvailable;
  const press = useNSEButtonPress(disabled);
  const theme = useNSEThemeInteraction<HTMLButtonElement>(!disabled, false, props);
  useNSEKeyEquivalent(element, keyEquivalent, keyEquivalentModifierMask, !disabled && !presentation?.hidden);
  if (presentation?.hidden) return null;

  const tone = toneFor({ hasDestructiveAction, keyEquivalent, appearance, bezelStyle });
  const alternates = buttonType === "pushOnPushOff" || buttonType === "toggle";
  const on = (alternates && state === "on") || presentation?.state === "on";
  const drawnPressed = on || isHighlighted;
  const position = imagePosition ?? (image ? "imageLeading" : "noImage");
  const shownImage = position === "noImage" || image == null ? null : <NSEControlImage image={image} />;
  const label = accessibleTitle(title);
  const disclosure = bezelStyle === "disclosure";

  return (
    <button
      ref={element}
      className={classes(
        disclosure ? "nse-control-disclosure-button" : "nse-control-button",
        bezelStyle === "texturedRounded" && "nse-extended-tool-button",
        bezelStyle === "rounded" && position === "imageOnly" && "nse-control-icon-button",
        className,
      )}
      type={type}
      title={toolTip ?? (position === "imageOnly" ? label : undefined)}
      data-tone={disclosure ? undefined : tone}
      data-bezel-style={bezelStyle}
      data-pressed={drawnPressed ? "true" : "false"}
      data-press-active={press.active ? "true" : "false"}
      data-key-equivalent={keyEquivalent === "\r" ? "default" : undefined}
      data-size={controlSize === "regular" ? undefined : controlSize}
      aria-pressed={alternates && !disclosure ? on : undefined}
      aria-expanded={disclosure ? state === "on" : undefined}
      aria-label={position === "imageOnly" ? label : undefined}
      disabled={disabled}
      onPointerDown={(event) => { onPointerDown?.(event); press.pointerDown(event); }}
      onLostPointerCapture={(event) => { press.cancel(); onLostPointerCapture?.(event); }}
      onKeyDown={(event) => { onKeyDown?.(event); press.keyDown(event); }}
      onKeyUp={(event) => { press.keyUp(event); onKeyUp?.(event); }}
      onBlur={(event) => { press.blur(); onBlur?.(event); }}
      onClick={(event) => {
        if (!press.allowsClick(event.detail)) { event.preventDefault(); event.stopPropagation(); return; }
        if (alternates) onStateChange?.(state === "on" ? "off" : "on");
        onClick?.(event);
        if (actionBinding) void actionCommand.dispatch();
        triggerNSEControlHapticForEvent(resolveNSEControlHaptic(haptic, TONE_HAPTICS[tone]), event, !disabled);
      }}
      {...props}
      style={nseMinimumControlProperties(props.style)}
      {...theme.events}
      {...nseControlHooks({ control: (props as { "data-nse-control"?: NSEThemeControlName })["data-nse-control"] ?? "button", state: presentation?.state ?? state ?? "off", highlighted: isHighlighted || press.active, selected: drawnPressed, tracking: press.active, enabled: !disabled, hovered: theme.hovered, focused: theme.focused, variants: { "bezel-style": bezelStyle, "control-size": controlSize ?? "regular", "button-type": buttonType, "image-position": position, ...(appearance ? { "appearance-name": appearance } : {}), ...(keyEquivalent ? { "key-equivalent": keyEquivalent, ...(keyEquivalent === "\r" ? { role: "default" } : {}) } : {}), ...(hasDestructiveAction ? { "has-destructive-action": "true" } : {}) } })}
      data-nse-part={(props as Record<string, unknown>)["data-nse-part"] as string ?? "background"}
    >
      <span data-nse-part="bezel" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      {disclosure ? <span data-nse-part="indicator" className="nse-control-disclosure-triangle" aria-hidden="true" /> : null}
      {shownImage && position !== "imageTrailing" ? <span data-nse-part="image" className="nse-control-button-icon">{shownImage}</span> : null}
      {position === "imageOnly"
        ? (label === undefined && title !== undefined ? <span className="nse-control-visually-hidden">{title}</span> : null)
        : title !== undefined ? <span data-nse-part="title" className="nse-control-button-label">{title}</span> : null}
      {shownImage && position === "imageTrailing" ? <span data-nse-part="image" className="nse-control-button-icon">{shownImage}</span> : null}
    </button>
  );
});

function toCheckState(state: NSEControlStateValue | undefined): boolean | "mixed" | undefined {
  return state === undefined ? undefined : state === "mixed" ? "mixed" : state === "on";
}

function fromCheckState(state: boolean | "mixed"): NSEControlStateValue {
  return state === "mixed" ? "mixed" : state ? "on" : "off";
}

/** A `switch` button: a checkbox whose title is its label. */
function NSESwitchButtonCell(
  {
    title,
    image: _image,
    imagePosition: _imagePosition,
    bezelStyle: _bezelStyle,
    buttonType: _buttonType,
    state,
    defaultState,
    allowsMixedState = false,
    onStateChange,
    isHighlighted,
    isEnabled = true,
    keyEquivalent: _keyEquivalent,
    keyEquivalentModifierMask: _keyEquivalentModifierMask,
    hasDestructiveAction: _hasDestructiveAction,
    appearance: _appearance,
    controlSize,
    toolTip,
    binding: _binding,
    validation,
    submissionValue,
    haptic = "selection",
    action,
    actionPayload,
    className = "",
    id,
    onClick,
    ...props
  }: NSEButtonProps & { readonly readOnly?: boolean },
  forwardedRef: ForwardedRef<HTMLButtonElement>,
) {
  void forwardedRef;
  const { readOnly, ...rest } = props as typeof props & { readOnly?: boolean };
  const { triggerNSEControlHapticForEvent } = useNSEControlFeedback();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const disabled = !isEnabled;
  const theme = useNSEThemeInteraction<HTMLLabelElement>(isEnabled, true);
  const initial = toCheckState(defaultState) ?? false;
  const current = useNSEControlValue<boolean | "mixed">({
    value: toCheckState(state),
    defaultValue: initial,
    fallback: false,
    isEnabled,
    readOnly,
    validation,
    onValueChange(next, phase) {
      if (phase === "commit") onStateChange?.(fromCheckState(next));
    },
  });
  const actionBinding = useNSEActionBinding(action, actionPayload);
  const command = useNSEControlCommand(actionBinding);
  const restoreMixed = useCallback(() => {
    if (input.current) input.current.indeterminate = initial === "mixed";
  }, [initial]);
  useNSEControlFormReset(input, current.reset, restoreMixed);
  useLayoutEffect(() => {
    if (input.current) input.current.indeterminate = current.value === "mixed";
  }, [current.value]);

  const invalid = validation?.kind === "invalid";
  const errorId = `${inputId}-error`;
  const restAttributes = rest as Record<string, unknown>;
  const describedBy = [restAttributes["aria-describedby"] as string | undefined, invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  const next = (): boolean | "mixed" => allowsMixedState
    ? (current.value === false ? true : current.value === true ? "mixed" : false)
    : current.value !== true;

  return (
    <>
      <label
        {...theme.events}
        {...nseControlHooks({ control: restAttributes["data-nse-control"] as NSEThemeControlName ?? "button", state: fromCheckState(current.value), highlighted: isHighlighted || theme.highlighted, enabled: isEnabled, hovered: theme.hovered, focused: theme.focused, variants: { "button-type": "switch", "control-size": controlSize ?? "regular", "bezel-style": _bezelStyle ?? "rounded" } })}
        data-nse-part={restAttributes["data-nse-part"] as string ?? "background"}
        className={classes("nse-control-checkbox", disabled && "is-disabled", className)}
        htmlFor={inputId}
        title={toolTip}
        data-state={current.value === "mixed" ? "mixed" : current.value ? "checked" : "unchecked"}
        data-disabled={disabled ? "true" : "false"}
        data-size={controlSize === "regular" ? undefined : controlSize}
      >
        <span data-nse-part="bezel" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
        <span className="nse-control-checkbox-control">
          <input
            {...(rest as Record<string, unknown>)}
            ref={input}
            id={inputId}
            type="checkbox"
            disabled={disabled}
            readOnly={readOnly}
            checked={current.value === true}
            value={submissionValue}
            aria-checked={current.value === "mixed" ? "mixed" : current.value}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onClick={(event) => {
              if (readOnly) event.preventDefault();
              onClick?.(event as never);
            }}
            onChange={(event) => {
              if (readOnly || disabled) return;
              const nextState = next();
              triggerNSEControlHapticForEvent(haptic, event, !disabled);
              void (async () => {
                if (actionBinding) {
                  const result = await command.dispatch();
                  if (result?.status !== "executed") return;
                }
                current.change(nextState, "commit");
              })();
            }}
          />
          <span data-nse-part="indicator" className="nse-control-checkbox-art" aria-hidden="true" />
        </span>
        {title !== undefined ? <span data-nse-part="title" className="nse-control-checkbox-label">{title}</span> : null}
      </label>
      {invalid ? <span id={errorId} className="nse-control-field-error" role="alert">{validation.message}</span> : null}
    </>
  );
}

const NSESwitchButton = forwardRef(NSESwitchButtonCell);

const NSEButtonControl = forwardRef<HTMLButtonElement, NSEButtonProps>(function NSEButton(input, ref) {
  // Cocoa Bindings bind a switch's value to a Boolean; mixed comes from a mixed selection.
  const bound = useNSEValueBinding<boolean | "mixed", NSEButtonProps & { state?: unknown; onStateChange?: unknown }, "state" | "defaultState" | "onStateChange">(
    input as never,
    { value: "state", change: "onStateChange", excludes: ["defaultState"], fallback: false, mixedValue: "mixed" as never },
  ) as NSEButtonProps & { state?: unknown; onStateChange?: (state: unknown) => void; disabled?: boolean };
  let props: NSEButtonProps = input;
  if (input.binding) {
    const { disabled, state, onStateChange, ...rest } = bound;
    props = {
      ...rest,
      isEnabled: (input.isEnabled ?? true) && !disabled,
      state: state === "mixed" ? "mixed" : state ? "on" : "off",
      onStateChange: (next) => onStateChange?.(next === "mixed" ? "mixed" : next === "on"),
    };
  }
  if (props.buttonType === "switch") return <NSESwitchButton ref={ref} {...props} />;
  return <NSEPushButtonCell ref={ref} {...props} />;
});

/**
 * NSButton: a push button, a toolbar button, a checkbox or a disclosure triangle, by `buttonType` and
 * `bezelStyle`. It sends its `action` along the responder chain (and is disabled while the action is
 * unavailable), or calls `onClick`.
 */
export const NSEButton = NSEButtonControl as <Payload = unknown>(
  props: NSEButtonProps<Payload> & RefAttributes<HTMLButtonElement>,
) => ReactElement | null;
