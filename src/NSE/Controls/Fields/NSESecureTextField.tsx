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

import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import type { NSEControlValidation } from "../Core";

const visibilityObservers = new WeakMap<Document, { callbacks: Set<() => void>; listener: () => void }>();
function observeVisibility(document: Document, callback: () => void): () => void {
  let entry = visibilityObservers.get(document);
  if (!entry) {
    const callbacks = new Set<() => void>();
    const listener = () => { if (document.visibilityState !== "visible") for (const notify of [...callbacks]) notify(); };
    entry = { callbacks, listener };
    visibilityObservers.set(document, entry);
    document.addEventListener("visibilitychange", listener);
  }
  entry.callbacks.add(callback);
  return () => {
    entry!.callbacks.delete(callback);
    if (entry!.callbacks.size === 0) {
      document.removeEventListener("visibilitychange", entry!.listener);
      visibilityObservers.delete(document);
    }
  };
}

export interface NSESecureTextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "prefix" | "type" | "value"> {
  readonly "aria-label": string;
  readonly name?: string;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly autoComplete?: string;
  readonly required?: boolean;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly invalid?: boolean;
  readonly validationMessage?: string;
  readonly validation?: NSEControlValidation;
  readonly label?: ReactNode;
  readonly prefix?: ReactNode;
  readonly suffix?: ReactNode;
  readonly revealPolicy?: "hold" | "toggle" | "never";
  onValueChange?(value: string): void;
}

export function NSESecureTextField(props: NSESecureTextFieldProps) {
  const controlled = props.value !== undefined;
  const [stored, setStored] = useState(props.defaultValue ?? "");
  const [revealed, setRevealed] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [nativeInvalid, setNativeInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = controlled ? props.value! : stored;
  const policy = props.revealPolicy ?? "hold";
  const validationInvalid = props.validation?.kind === "invalid";
  const conceal = () => setRevealed(false);
  const set = (value: string) => {
    if (!controlled) setStored(value);
    props.onValueChange?.(value);
  };

  useEffect(() => {
    const ownerDocument = inputRef.current?.ownerDocument;
    return ownerDocument ? observeVisibility(ownerDocument, conceal) : undefined;
  }, []);
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || controlled) return;
    const reset = () => { setStored(props.defaultValue ?? ""); setCapsLock(false); setNativeInvalid(false); conceal(); };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, props.defaultValue]);
  useEffect(() => { if (props.disabled || props.readOnly || policy === "never") conceal(); }, [policy, props.disabled, props.readOnly]);

  const { revealPolicy: _revealPolicy, invalid: _invalid, validationMessage: _validationMessage, validation: _validation, label, prefix, suffix, onValueChange: _onValueChange, value: _value, defaultValue: _defaultValue, onBlur, onKeyDown, onInvalid, onChange, ...inputProps } = props;
  return (
    <label data-nse-control="secure-text-field" data-state={props.invalid || validationInvalid || nativeInvalid ? "invalid" : revealed ? "revealed" : "concealed"}>
      {label ? <span data-nse-part="label">{label}</span> : null}
      {prefix ? <span data-nse-part="prefix">{prefix}</span> : null}
      <input
        {...inputProps}
        ref={inputRef}
        aria-label={props["aria-label"]}
        type={revealed ? "text" : "password"}
        name={props.name}
        value={current}
        disabled={props.disabled}
        readOnly={props.readOnly}
        autoComplete={props.autoComplete}
        required={props.required}
        pattern={props.pattern}
        minLength={props.minLength}
        maxLength={props.maxLength}
        aria-invalid={props.invalid || validationInvalid || nativeInvalid || undefined}
        onChange={(event) => { setNativeInvalid(false); set(event.currentTarget.value); onChange?.(event); }}
        onInvalid={(event) => { setNativeInvalid(true); onInvalid?.(event); }}
        onBlur={(event) => { conceal(); onBlur?.(event); }}
        onKeyDown={(event) => { setCapsLock((current) => event.key === "CapsLock" ? !current : event.getModifierState("CapsLock")); if (event.key === "Escape") conceal(); onKeyDown?.(event); }}
      />
      {policy !== "never" ? (
        <button
          type="button"
          aria-label={revealed ? "Conceal password" : "Reveal password"}
          disabled={props.disabled || props.readOnly}
          onClick={() => { if (policy === "toggle") setRevealed((value) => !value); }}
          onPointerDown={(event) => {
            if (policy !== "hold") return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setRevealed(true);
          }}
          onPointerUp={conceal}
          onPointerCancel={conceal}
          onLostPointerCapture={conceal}
          onBlur={conceal}
          onKeyDown={(event) => { if (event.key === "Escape") conceal(); }}
          data-nse-part="reveal"
          data-revealed={revealed ? "true" : "false"}
        >
          <span data-nse-part="reveal-glyph" aria-hidden="true" />
        </button>
      ) : null}
      {suffix ? <span data-nse-part="suffix">{suffix}</span> : null}
      {capsLock ? <span role="status">Caps Lock is on.</span> : null}
      {props.invalid || validationInvalid || nativeInvalid ? <span role="alert">{props.validationMessage ?? (validationInvalid ? props.validation?.message : undefined) ?? "Enter a valid password."}</span> : null}
    </label>
  );
}
