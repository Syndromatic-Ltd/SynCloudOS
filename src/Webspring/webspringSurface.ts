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

import type { CSSProperties } from "react";
import type { WebspringBackground, WebspringSurface as WebspringSurfaceShape } from "./webspringTypes";

export type WebspringSurface = WebspringSurfaceShape;

const cottonTexture = "/assets/textures/NSETileCotton.jpg";

function cotton(): WebspringSurface {
  return {
    colour: "#5a6170",
    texture: { image: cottonTexture, size: "256px" },
    tint: { colour: "#4a6fa5", opacity: 0.1 },
    vignette: { centre: 0.06, edge: 0.6 },
  };
}

function plain(colour: string): WebspringSurface {
  return { colour };
}

/** Ready-made surfaces. They are plain objects: spread one to change a field. */
export const WebspringSurface = Object.freeze({
  /** Tinted cotton with a spotlight: the Board's default. */
  cotton,
  /** A single flat colour. */
  plain,
});

/** Where the spotlight sits. */
const vignetteCentre = "50% 45%";

const defaultShelf: WebspringSurface = Object.freeze(plain("#171c26"));

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function assertKnown(input: Record<string, unknown>, label: string, known: readonly string[]) {
  const extra = Object.keys(input).filter((key) => !known.includes(key));
  if (extra.length > 0) throw new TypeError(`${label} has unknown fields: ${extra.join(", ")}.`);
}

function text(input: Record<string, unknown>, key: string, label: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label}.${key} must be a nonempty string.`);
  return value;
}

function unit(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be a number from 0 to 1.`);
  }
  return value;
}

function object(input: Record<string, unknown>, key: string, label: string, known: readonly string[]): Record<string, unknown> | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  const fields = asObject(value, `${label}.${key}`);
  assertKnown(fields, `${label}.${key}`, known);
  return fields;
}

/** Validates a surface and returns a frozen copy; a wrong shape throws a `TypeError` naming `label`. */
export function captureWebspringSurface(raw: unknown, label: string): WebspringSurface {
  const input = asObject(raw, label);
  assertKnown(input, label, ["colour", "texture", "tint", "vignette", "overlay"]);
  const surface: { -readonly [Key in keyof WebspringSurface]: WebspringSurface[Key] } = {};
  const colour = text(input, "colour", label);
  if (colour !== undefined) surface.colour = colour;

  if (input.texture === "none") surface.texture = "none";
  else {
    const texture = object(input, "texture", label, ["image", "size", "repeat", "position"]);
    if (texture) {
      const textureLabel = `${label}.texture`;
      const image = text(texture, "image", textureLabel);
      if (image === undefined) throw new TypeError(`${textureLabel}.image must be a nonempty string.`);
      const size = text(texture, "size", textureLabel);
      const position = text(texture, "position", textureLabel);
      if (texture.repeat !== undefined && typeof texture.repeat !== "boolean") throw new TypeError(`${textureLabel}.repeat must be a boolean.`);
      surface.texture = Object.freeze({
        image,
        ...(size === undefined ? {} : { size }),
        ...(texture.repeat === undefined ? {} : { repeat: texture.repeat }),
        ...(position === undefined ? {} : { position }),
      });
    }
  }

  const tint = object(input, "tint", label, ["colour", "opacity"]);
  if (tint) {
    const tintColour = text(tint, "colour", `${label}.tint`);
    const opacity = unit(tint.opacity, `${label}.tint.opacity`);
    if (tintColour === undefined || opacity === undefined) throw new TypeError(`${label}.tint needs a colour and an opacity.`);
    surface.tint = Object.freeze({ colour: tintColour, opacity });
  }

  if (input.vignette === false) surface.vignette = false;
  else {
    const vignette = object(input, "vignette", label, ["centre", "edge"]);
    if (vignette) {
      const centre = unit(vignette.centre, `${label}.vignette.centre`);
      const edge = unit(vignette.edge, `${label}.vignette.edge`);
      surface.vignette = Object.freeze({
        ...(centre === undefined ? {} : { centre }),
        ...(edge === undefined ? {} : { edge }),
      });
    }
  }

  const overlay = object(input, "overlay", label, ["image", "size", "opacity", "blend"]);
  if (overlay) {
    const overlayLabel = `${label}.overlay`;
    const image = text(overlay, "image", overlayLabel);
    if (image === undefined) throw new TypeError(`${overlayLabel}.image must be a nonempty string.`);
    const size = text(overlay, "size", overlayLabel);
    const blend = text(overlay, "blend", overlayLabel);
    const opacity = unit(overlay.opacity, `${overlayLabel}.opacity`);
    surface.overlay = Object.freeze({
      image,
      ...(size === undefined ? {} : { size }),
      ...(opacity === undefined ? {} : { opacity }),
      ...(blend === undefined ? {} : { blend }),
    });
  }
  return Object.freeze(surface);
}

/** Validates the `background` option and fills in the defaults: tinted cotton for the launcher, a plain dark shelf. */
export function captureWebspringBackground(input: unknown): WebspringBackground {
  if (input === undefined) return Object.freeze({ launcher: Object.freeze(cotton()), shelf: defaultShelf });
  const background = asObject(input, "Webspring background");
  assertKnown(background, "Webspring background", ["launcher", "shelf"]);
  if (background.launcher === undefined) throw new TypeError("Webspring background needs a launcher surface.");
  return Object.freeze({
    launcher: captureWebspringSurface(background.launcher, "Webspring background.launcher"),
    shelf: background.shelf === undefined ? defaultShelf : captureWebspringSurface(background.shelf, "Webspring background.shelf"),
  });
}

function cssUrl(image: string) {
  return `url("${image.replace(/[\\"\n\r]/gu, (character) => `\\${character === "\n" ? "a " : character === "\r" ? "d " : character}`)}")`;
}

/**
 * The CSS custom properties that paint `surface`. With the default `prefix` they are
 * `--webspring-surface-colour`, `-image`, `-size`, `-repeat` and `-position` (comma lists, one
 * entry per layer, top layer first) and `-overlay-image`, `-overlay-size`, `-overlay-opacity` and
 * `-overlay-blend`. A stylesheet reads them with one rule per layer, so a theme can still override them.
 */
export function webspringSurfaceStyle(surface: WebspringSurface, prefix = "--webspring-surface"): CSSProperties {
  const images: string[] = [];
  const sizes: string[] = [];
  const repeats: string[] = [];
  const positions: string[] = [];
  const layer = (image: string, size: string, repeat: string, position: string) => {
    images.push(image); sizes.push(size); repeats.push(repeat); positions.push(position);
  };

  const { vignette, tint, texture, overlay } = surface;
  if (vignette) {
    const centre = vignette.centre ?? 0;
    const edge = vignette.edge ?? 0;
    layer(
      `radial-gradient(ellipse at ${vignetteCentre}, rgba(255, 255, 255, ${centre}) 0%, rgba(255, 255, 255, 0) 55%, rgba(0, 0, 0, ${edge}) 100%)`,
      "100% 100%", "no-repeat", "center",
    );
  }
  if (tint) {
    const wash = `color-mix(in srgb, ${tint.colour} ${Math.round(tint.opacity * 10000) / 100}%, transparent)`;
    layer(`linear-gradient(${wash}, ${wash})`, "100% 100%", "no-repeat", "center");
  }
  if (texture && texture !== "none") {
    const tiled = texture.repeat ?? true;
    layer(cssUrl(texture.image), texture.size ?? "auto", tiled ? "repeat" : "no-repeat", texture.position ?? (tiled ? "0 0" : "center"));
  }

  return {
    [`${prefix}-colour`]: surface.colour ?? "transparent",
    [`${prefix}-image`]: images.length > 0 ? images.join(", ") : "none",
    [`${prefix}-size`]: sizes.length > 0 ? sizes.join(", ") : "auto",
    [`${prefix}-repeat`]: repeats.length > 0 ? repeats.join(", ") : "no-repeat",
    [`${prefix}-position`]: positions.length > 0 ? positions.join(", ") : "0 0",
    [`${prefix}-overlay-image`]: overlay ? cssUrl(overlay.image) : "none",
    [`${prefix}-overlay-size`]: overlay?.size ?? "100% auto",
    [`${prefix}-overlay-opacity`]: String(overlay?.opacity ?? 1),
    [`${prefix}-overlay-blend`]: overlay?.blend ?? "normal",
  } as CSSProperties;
}
