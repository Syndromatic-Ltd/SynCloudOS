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

import type { SynCloudOSLocaleCode, SynCloudOSLocaleFormatFileSizeOptions } from "./localeTypes";

function toDate(value: Date | number | string) {
  return value instanceof Date ? value : new Date(value);
}

function fallbackDate(value: Date | number | string) {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export function formatSynCloudOSDate(
  locale: SynCloudOSLocaleCode,
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions
) {
  try {
    return new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium" }).format(toDate(value));
  } catch {
    return fallbackDate(value);
  }
}

export function formatSynCloudOSTime(
  locale: SynCloudOSLocaleCode,
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions
) {
  try {
    return new Intl.DateTimeFormat(locale, options ?? { hour: "2-digit", minute: "2-digit" }).format(toDate(value));
  } catch {
    return fallbackDate(value);
  }
}

export function formatSynCloudOSNumber(
  locale: SynCloudOSLocaleCode,
  value: number,
  options?: Intl.NumberFormatOptions
) {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatSynCloudOSFileSize(
  locale: SynCloudOSLocaleCode,
  bytes: number,
  options: SynCloudOSLocaleFormatFileSizeOptions = {}
) {
  const base = options.base ?? 1024;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const absolute = Math.abs(bytes);
  const exponent = absolute > 0 ? Math.min(Math.floor(Math.log(absolute) / Math.log(base)), units.length - 1) : 0;
  const value = bytes / Math.pow(base, exponent);
  const formatted = formatSynCloudOSNumber(locale, value, {
    maximumFractionDigits: options.maximumFractionDigits ?? (exponent === 0 ? 0 : 1),
    minimumFractionDigits: options.minimumFractionDigits
  });
  return `${formatted} ${units[exponent]}`;
}

export function formatSynCloudOSRelativeTime(
  locale: SynCloudOSLocaleCode,
  value: number,
  unit: Intl.RelativeTimeFormatUnit = "second",
  options?: Intl.RelativeTimeFormatOptions
) {
  try {
    if (typeof Intl.RelativeTimeFormat === "function") {
      return new Intl.RelativeTimeFormat(locale, options ?? { numeric: "auto" }).format(value, unit);
    }
  } catch {
    // Fall through to a stable fallback.
  }
  return `${value} ${unit}${Math.abs(value) === 1 ? "" : "s"}`;
}

export function formatSynCloudOSList(
  locale: SynCloudOSLocaleCode,
  values: string[],
  options?: Intl.ListFormatOptions
) {
  try {
    if (typeof Intl.ListFormat === "function") {
      return new Intl.ListFormat(locale, options ?? { style: "long", type: "conjunction" }).format(values);
    }
  } catch {
    // Fall through to a stable fallback.
  }
  return values.join(", ");
}
