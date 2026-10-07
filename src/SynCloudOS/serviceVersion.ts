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
 * One canonical SemVer authority for service compatibility. Build metadata is
 * intentionally excluded from precedence, while prerelease identifiers retain
 * their SemVer ordering rules.
 */
interface ParsedServiceVersion {
  readonly major: string;
  readonly minor: string;
  readonly patch: string;
  readonly prerelease: readonly string[] | null;
}

const serviceVersionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function parseServiceVersion(value: string): ParsedServiceVersion | null {
  const match = serviceVersionPattern.exec(value);
  if (!match) return null;
  const prerelease = match[4] === undefined ? null : match[4].split(".");
  if (prerelease?.some((identifier) => /^[0-9]+$/u.test(identifier) && identifier.length > 1 && identifier.startsWith("0"))) {
    return null;
  }
  return Object.freeze({
    major: match[1],
    minor: match[2],
    patch: match[3],
    prerelease: prerelease ? Object.freeze(prerelease) : null,
  });
}

/** Core and numeric prerelease identifiers have no leading zero, so comparing
 * their digit counts followed by their lexical value preserves unbounded
 * SemVer integer precedence without an IEEE-754 precision loss. */
function compareNumericIdentifier(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length !== right.length) return left.length > right.length ? 1 : -1;
  return left > right ? 1 : -1;
}

function comparePrerelease(left: readonly string[] | null, right: readonly string[] | null): number {
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) return leftIdentifier === rightIdentifier ? 0 : leftIdentifier === undefined ? -1 : 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^[0-9]+$/u.test(leftIdentifier);
    const rightNumeric = /^[0-9]+$/u.test(rightIdentifier);
    if (leftNumeric && rightNumeric) return compareNumericIdentifier(leftIdentifier, rightIdentifier);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}

/** Returns `null` for invalid SemVer values and otherwise standard precedence. */
export function compareServiceVersions(left: string, right: string): number | null {
  const parsedLeft = parseServiceVersion(left);
  const parsedRight = parseServiceVersion(right);
  if (!parsedLeft || !parsedRight) return null;
  for (const key of ["major", "minor", "patch"] as const) {
    const comparison = compareNumericIdentifier(parsedLeft[key], parsedRight[key]);
    if (comparison !== 0) return comparison;
  }
  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
}

export function serviceVersionAtLeast(version: string | undefined, minimumVersion: string | undefined): boolean {
  if (minimumVersion === undefined) return true;
  if (version === undefined) return false;
  const comparison = compareServiceVersions(version, minimumVersion);
  return comparison !== null && comparison >= 0;
}

/** Returns the stricter minimum, `undefined` when neither was supplied, and
 * `null` for an invalid request so callers can fail closed. */
export function strongerServiceVersion(first: string | undefined, second: string | undefined): string | undefined | null {
  if (first === undefined) return second;
  if (second === undefined) return first;
  const comparison = compareServiceVersions(first, second);
  if (comparison === null) return null;
  return comparison >= 0 ? first : second;
}
