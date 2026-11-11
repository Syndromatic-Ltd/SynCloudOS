/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** NSPersonNameComponents. Components are supplied, never inferred from a display name. */
export class NSEPersonNameComponents {
  namePrefix: string | null = null;
  givenName: string | null = null;
  middleName: string | null = null;
  familyName: string | null = null;
  nameSuffix: string | null = null;
  nickname: string | null = null;
  phoneticRepresentation: NSEPersonNameComponents | null = null;
  copy(): NSEPersonNameComponents {
    const copies = new Map<NSEPersonNameComponents, NSEPersonNameComponents>();
    const clone = (source: NSEPersonNameComponents): NSEPersonNameComponents => {
      const existing = copies.get(source); if (existing) return existing;
      const result = new NSEPersonNameComponents(); copies.set(source, result);
      result.namePrefix = source.namePrefix; result.givenName = source.givenName; result.middleName = source.middleName;
      result.familyName = source.familyName; result.nameSuffix = source.nameSuffix; result.nickname = source.nickname;
      result.phoneticRepresentation = source.phoneticRepresentation ? clone(source.phoneticRepresentation) : null;
      return result;
    };
    return clone(this);
  }
}
