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

export interface CNFXContactDescriptor {
  readonly displayNames?: readonly string[];
  readonly emailAddresses?: readonly string[];
  readonly phoneNumbers?: readonly string[];
}

/** An immutable selection snapshot; the web picker supplies no stable contact identifier. */
export class CNFXContact {
  readonly displayNames: readonly string[];
  readonly emailAddresses: readonly string[];
  readonly phoneNumbers: readonly string[];

  constructor(descriptor: CNFXContactDescriptor) {
    const copy = (values: readonly string[] | undefined) => {
      if (values?.some(value => typeof value !== "string")) throw new TypeError("Contact values must be strings.");
      return Object.freeze([...(values ?? [])]);
    };
    this.displayNames = copy(descriptor.displayNames);
    this.emailAddresses = copy(descriptor.emailAddresses);
    this.phoneNumbers = copy(descriptor.phoneNumbers);
    Object.freeze(this);
  }
}
