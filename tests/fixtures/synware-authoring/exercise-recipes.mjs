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

import assert from "node:assert/strict";

// The same behavior assertions run against source-backed fixtures and, separately,
// a parent-built installed archive. Device doubles are never hardware evidence.
export const families = Object.freeze(["animation", "graphics", "image", "text", "audio", "haptics", "motion", "media", "video", "midi", "location", "lumina"]);
export async function exerciseRecipes(load) {
  const expected = {
    animation: "Timing at halfway: 0.5", graphics: "Offset rectangle: 12, 23",
    image: "Cropped extent: 32 x 16", text: "Paragraph alignment: center",
    audio: "Audio duration: 1 second", haptics: "Pattern duration: 0.25 seconds",
    motion: "Identity yaw: 0", media: "Media duration: 1.5 seconds",
  };
  for (const [family, result] of Object.entries(expected)) assert.equal(await (await load(family)).runRecipe(), result, family);
  let cameraRequests = 0;
  const video = await load("video");
  assert.equal(await video.runRecipe({ capabilities: { camera: false }, requestCamera() { throw Error("must not prompt"); } }), "Camera unavailable");
  assert.equal(await video.runRecipe({ capabilities: { camera: true }, async requestCamera() { cameraRequests++; return { width: 640, height: 480 }; } }), "Camera active: 640 x 480");
  assert.equal(cameraRequests, 1);
  await assert.rejects(() => video.runRecipe({ capabilities: { camera: true }, async requestCamera() { throw Error("Camera denied"); } }), /Camera denied/);
  const midi = await load("midi");
  for (const state of ["denied", "unavailable", "policy-denied", "granted"]) {
    assert.equal(await midi.runRecipe({ async requestAuthorization(request) { assert.deepEqual(request, { sysex: false }); return { state }; } }), `MIDI authorization: ${state}`);
  }
  const location = await load("location");
  assert.equal(await location.runRecipe({ async current(options) { assert.equal(options.timeoutSeconds, 10); return { coordinate: { latitude: 51.5, longitude: -0.1 } }; } }), "Location: 51.5, -0.1");
  await assert.rejects(() => location.runRecipe({ async current() { throw Error("Location denied"); } }), /Location denied/);
  const lumina = await load("lumina");
  let disposed = 0;
  assert.equal(await lumina.runRecipe({ createIndex() { return { async query(value) { assert.equal(value.text, "hello"); return { results: [{}, {}] }; }, dispose() { disposed++; } }; } }), "Search results: 2");
  await assert.rejects(() => lumina.runRecipe({ createIndex() { return { async query() { throw Error("Index unavailable"); }, dispose() { disposed++; } }; } }), /Index unavailable/);
  assert.equal(disposed, 2, "both success and failure release the index session");
  return { families: [...families], deterministicBehavior: "passed", browser: "not-run", nativeDevice: "not-run" };
}
