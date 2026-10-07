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

export type MEFXMetadataPrimitive = string | number | boolean | null;
export type MEFXMetadataValue =
    | MEFXMetadataPrimitive
    | readonly MEFXMetadataValue[]
    | Readonly<{ [key: string]: MEFXMetadataValue }>;
export type MEFXMetadata = Readonly<Record<string, MEFXMetadataValue>>;

export interface MEFXFormatDescriptionInit {
    readonly mediaType: string;
    readonly codec: string;
    readonly version?: number;
    readonly extensions?: Readonly<Record<string, unknown>>;
}

const maximumMetadataBytes = 16 * 1024;
const maximumMetadataDepth = 32;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._+\/-]{0,127}$/u;

function checkedIdentifier(value: unknown, name: string): string {
    if (typeof value !== "string" || !identifierPattern.test(value))
        throw new TypeError(name + " must be a bounded portable identifier.");
    return value;
}

function cloneMetadataValue(value: unknown, seen: Set<object>, depth: number): MEFXMetadataValue {
    if (depth > maximumMetadataDepth)
        throw new RangeError("Media metadata nesting exceeds the portable metadata limit.");
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new TypeError("Media metadata numbers must be finite.");
        return value;
    }
    if (!value || typeof value !== "object")
        throw new TypeError("Media metadata must be JSON-serializable plain data.");
    if (seen.has(value))
        throw new TypeError("Media metadata cannot contain cycles.");
    if (Object.getOwnPropertySymbols(value).length)
        throw new TypeError("Media metadata cannot contain symbol properties.");

    seen.add(value);
    try {
        if (Array.isArray(value)) {
            const descriptors = Object.getOwnPropertyDescriptors(value);
            const clone: MEFXMetadataValue[] = [];
            for (let index = 0; index < value.length; index += 1) {
                const descriptor = descriptors[String(index)];
                if (!descriptor || !("value" in descriptor))
                    throw new TypeError("Media metadata arrays must be dense data arrays.");
                clone.push(cloneMetadataValue(descriptor.value, seen, depth + 1));
            }
            const unexpected = Object.keys(descriptors).filter(key => key !== "length" && !/^\d+$/u.test(key));
            if (unexpected.length)
                throw new TypeError("Media metadata arrays cannot contain named properties.");
            return Object.freeze(clone);
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null)
            throw new TypeError("Media metadata objects must be plain data.");
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const clone: Record<string, MEFXMetadataValue> = {};
        for (const key of Object.keys(descriptors).sort()) {
            const descriptor = descriptors[key]!;
            if (!("value" in descriptor))
                throw new TypeError("Media metadata fields must be data properties.");
            Object.defineProperty(clone, key, {
                value: cloneMetadataValue(descriptor.value, seen, depth + 1),
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
        return Object.freeze(clone);
    }
    finally {
        seen.delete(value);
    }
}

export function snapshotMEFXMetadata(
    value: Readonly<Record<string, unknown>> | undefined,
    name = "Media metadata",
): MEFXMetadata {
    if (value === undefined)
        return Object.freeze({});
    const cloned = cloneMetadataValue(value, new Set<object>(), 0);
    if (Array.isArray(cloned) || cloned === null || typeof cloned !== "object")
        throw new TypeError(name + " must be a plain metadata object.");
    const encoded = new TextEncoder().encode(JSON.stringify(cloned));
    if (encoded.byteLength > maximumMetadataBytes)
        throw new RangeError(name + " exceeds the " + maximumMetadataBytes + " byte metadata limit.");
    return cloned as MEFXMetadata;
}

function canonicalMetadata(value: MEFXMetadata): string {
    return JSON.stringify(value);
}

export class MEFXFormatDescription {
    readonly mediaType: string;
    readonly codec: string;
    readonly version: number;
    readonly extensions: MEFXMetadata;
    readonly #canonicalExtensions: string;

    constructor(init: MEFXFormatDescriptionInit) {
        if (!init || typeof init !== "object")
            throw new TypeError("Media format description requires initialization data.");
        this.mediaType = checkedIdentifier(init.mediaType, "Media format type");
        this.codec = checkedIdentifier(init.codec, "Media codec identifier");
        const version = init.version ?? 1;
        if (!Number.isSafeInteger(version) || version < 1 || version > 0x7fff_ffff)
            throw new RangeError("Media format version must be a positive 31-bit integer.");
        this.version = version;
        this.extensions = snapshotMEFXMetadata(init.extensions, "Media format metadata");
        this.#canonicalExtensions = canonicalMetadata(this.extensions);
        Object.freeze(this);
    }

    equals(other: MEFXFormatDescription): boolean {
        return other instanceof MEFXFormatDescription
            && this.mediaType === other.mediaType
            && this.codec === other.codec
            && this.version === other.version
            && this.#canonicalExtensions === other.#canonicalExtensions;
    }

    toJSON(): Readonly<{
        mediaType: string;
        codec: string;
        version: number;
        extensions: MEFXMetadata;
    }> {
        return Object.freeze({
            mediaType: this.mediaType,
            codec: this.codec,
            version: this.version,
            extensions: this.extensions,
        });
    }
}
