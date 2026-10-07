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

import { AFXLayer } from './AFXLayer';
import type { AFXEmitterParticle } from './AFXLayerContent';
import { GFXImage } from '../GraphicsFX/GFXImage';
import { GFXColour } from '../GraphicsFX/GFXColour';

/** A bounded particle presentation supplied by an owner's simulation or timeline.
 * Publishes one layer snapshot per frame; it does not create a clock per sprite.
 * Particle images are borrowed. Position, colour, rotation and scale are local
 * to this layer, with scale applied to the image's natural pixel dimensions.
 */
export class AFXParticleLayer extends AFXLayer {
  setParticles(particles: readonly AFXEmitterParticle[]): void {
    if (!Array.isArray(particles) || particles.length > 8192)
      throw new RangeError('Particle batches must contain at most 8192 particles.');
    const ids = new Set<number>();
    const owned = particles.map(p => {
      if (!Number.isSafeInteger(p.id) || ids.has(p.id)) throw new RangeError('Particle IDs must be unique integers.');
      ids.add(p.id);
      if (!(p.contents instanceof GFXImage) || !(p.colour instanceof GFXColour))
        throw new TypeError('Particles require GFX image and colour values.');
      if (![p.position.x, p.position.y, p.zPosition, p.renderOrder, p.scale, p.rotation].every(Number.isFinite) || p.scale < 0)
        throw new RangeError('Particle geometry must be finite with nonnegative scale.');
      return Object.freeze({ ...p, position: Object.freeze({ ...p.position }) });
    });
    this.setLayerContent(Object.freeze({ kind: 'emitter', particles: Object.freeze(owned) }));
  }
}
