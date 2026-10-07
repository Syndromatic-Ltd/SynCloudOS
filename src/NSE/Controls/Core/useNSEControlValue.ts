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

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import type {
  NSEControlInteractionPhase,
  NSEControlValidation,
  NSEControlValueProps,
} from "./controlTypes";

export interface UseNSEControlValueOptions<T> extends NSEControlValueProps<T> {
  readonly fallback: T;
}

export interface NSEControlValueState<T> {
  readonly value: T;
  readonly isControlled: boolean;
  readonly validation: NSEControlValidation | undefined;
  readonly validationId: string;
  change(nextValue: T, phase: NSEControlInteractionPhase): void;
  reset(): void;
  cancel(): void;
}

/**
 * Owns only an uncontrolled fallback value. Controlled values remain authoritative
 * at the caller, while native form reset returns the local fallback to its initial
 * default. This is the one shared reset mechanism used by the foundational
 * controls so browser form semantics do not fork by control kind.
 */
export function useNSEControlValue<T>(options: UseNSEControlValueOptions<T>): NSEControlValueState<T> {
  const {
    value,
    defaultValue,
    fallback,
    validation,
    onValueChange,
  } = options;
  const isControlled = value !== undefined;
  const initialValue = useRef(defaultValue ?? fallback);
  const [uncontrolledValue, setUncontrolledValue] = useState<T>(initialValue.current);
  const validationId = useId();
  const resolvedValue = isControlled ? value : uncontrolledValue;

  const change = useCallback((nextValue: T, phase: NSEControlInteractionPhase) => {
    if (!isControlled && phase === "commit") setUncontrolledValue(nextValue);
    onValueChange?.(nextValue, phase);
  }, [isControlled, onValueChange]);

  const reset = useCallback(() => {
    if (!isControlled) setUncontrolledValue(initialValue.current);
  }, [isControlled]);

  const cancel = useCallback(() => {
    onValueChange?.(resolvedValue, "cancel");
  }, [onValueChange, resolvedValue]);

  return {
    value: resolvedValue,
    isControlled,
    validation,
    validationId,
    change,
    reset,
    cancel,
  };
}

/** Bind a physical form-reset event to a control's canonical reset handler. */
export function useNSEControlFormReset(
  elementRef: RefObject<HTMLInputElement | null>,
  reset: () => void,
  afterNativeReset?: () => void,
): void {
  useEffect(() => {
    const element = elementRef.current;
    const form = element?.form;
    if (!form) return;
    let active = true;
    const handleReset = () => {
      reset();
      // The browser applies native default properties after `reset` dispatch. A
      // mixed checkbox's indeterminate property has no native default, so restore
      // it in the next microtask after that browser-owned work completes.
      if (afterNativeReset) queueMicrotask(() => {
        if (active) afterNativeReset();
      });
    };
    form.addEventListener("reset", handleReset);
    return () => {
      active = false;
      form.removeEventListener("reset", handleReset);
    };
  }, [afterNativeReset, elementRef, reset]);
}
