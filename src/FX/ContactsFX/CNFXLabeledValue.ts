/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** CNLabeledValue<ValueType>. A null label preserves the absence of a native label. */
export class CNFXLabeledValue<ValueType> {
  readonly identifier: string = crypto.randomUUID();
  constructor(
    readonly label: string | null,
    readonly value: ValueType,
  ) {
    if (label !== null && typeof label !== "string") throw new TypeError("A contact label is a string or null.");
    Object.freeze(this);
  }
  settingLabel(label: string | null): CNFXLabeledValue<ValueType> {
    return this.settingLabelValue(label, this.value);
  }
  settingValue(value: ValueType): CNFXLabeledValue<ValueType> {
    return this.settingLabelValue(this.label, value);
  }
  settingLabelValue(label: string | null, value: ValueType): CNFXLabeledValue<ValueType> {
    const result = new CNFXLabeledValue(label, value);
    return Object.freeze(
      Object.create(Object.getPrototypeOf(result), {
        identifier: { value: this.identifier, enumerable: true },
        label: { value: result.label, enumerable: true },
        value: { value: result.value, enumerable: true },
      }),
    );
  }
}
