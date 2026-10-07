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
 * The colour lists the panel ships with, as NSColorPanel's do: the system's
 * named colours (the "Syndromatic" list, NSColorPanel's "Apple" list), the
 * 216 web-safe colours, and the crayon box, whose 48 names and values are the
 * classic crayon set.
 */

export interface NSENamedColour {
  readonly name: string;
  readonly hex: string;
}

export interface NSEColourList {
  readonly id: string;
  readonly name: string;
  readonly colours: readonly NSENamedColour[];
}

const named = (entries: readonly (readonly [string, string])[]): readonly NSENamedColour[] =>
  Object.freeze(entries.map(([name, hex]) => Object.freeze({ name, hex })));

/** The system's named colours. */
export const syndromaticColourList: NSEColourList = Object.freeze({
  id: "syndromatic",
  name: "Syndromatic",
  colours: named([
    ["Black", "#000000"],
    ["Blue", "#0000FF"],
    ["Brown", "#996633"],
    ["Cyan", "#00FFFF"],
    ["Green", "#00FF00"],
    ["Magenta", "#FF00FF"],
    ["Orange", "#FF8000"],
    ["Purple", "#800080"],
    ["Red", "#FF0000"],
    ["Yellow", "#FFFF00"],
    ["White", "#FFFFFF"],
  ]),
});

const webSafeSteps = ["00", "33", "66", "99", "CC", "FF"] as const;

export const webSafeColourList: NSEColourList = Object.freeze({
  id: "web-safe",
  name: "Web Safe Colours",
  colours: Object.freeze(webSafeSteps.flatMap((r) => webSafeSteps.flatMap((g) => webSafeSteps.map((b) => Object.freeze({ name: `${r}${g}${b}`, hex: `#${r}${g}${b}` }))))),
});

/**
 * The crayon box, front row first. Each row runs from warm to cool and ends in
 * two greys; the rows darken towards the back of the box.
 */
export const crayonRows: readonly (readonly NSENamedColour[])[] = Object.freeze([
  named([["Cantaloupe", "#FFCC66"], ["Honeydew", "#CCFF66"], ["Spindrift", "#66FFCC"], ["Sky", "#66CCFF"], ["Lavender", "#CC66FF"], ["Carnation", "#FF6FCF"], ["Licorice", "#000000"], ["Snow", "#FFFFFF"]]),
  named([["Salmon", "#FF6666"], ["Banana", "#FFFF66"], ["Flora", "#66FF66"], ["Ice", "#66FFFF"], ["Orchid", "#6666FF"], ["Bubblegum", "#FF66FF"], ["Lead", "#191919"], ["Mercury", "#E6E6E6"]]),
  named([["Tangerine", "#FF8000"], ["Lime", "#80FF00"], ["Sea Foam", "#00FF80"], ["Aqua", "#0080FF"], ["Grape", "#8000FF"], ["Strawberry", "#FF0080"], ["Tungsten", "#333333"], ["Silver", "#CCCCCC"]]),
  named([["Maraschino", "#FF0000"], ["Lemon", "#FFFF00"], ["Spring", "#00FF00"], ["Turquoise", "#00FFFF"], ["Blueberry", "#0000FF"], ["Magenta", "#FF00FF"], ["Iron", "#4C4C4C"], ["Magnesium", "#B3B3B3"]]),
  named([["Mocha", "#804000"], ["Fern", "#408000"], ["Moss", "#008040"], ["Ocean", "#004080"], ["Eggplant", "#400080"], ["Maroon", "#800040"], ["Steel", "#666666"], ["Aluminium", "#999999"]]),
  named([["Cayenne", "#800000"], ["Asparagus", "#808000"], ["Clover", "#008000"], ["Teal", "#008080"], ["Midnight", "#000080"], ["Plum", "#800080"], ["Tin", "#7F7F7F"], ["Nickel", "#808080"]]),
]);

export const crayonColourList: NSEColourList = Object.freeze({
  id: "crayons",
  name: "Crayons",
  colours: Object.freeze(crayonRows.flat()),
});

export const builtInColourLists: readonly NSEColourList[] = Object.freeze([syndromaticColourList, crayonColourList, webSafeColourList]);
