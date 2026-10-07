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

export interface MFXVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface MFXQuaternion extends MFXVector3 {
  readonly w: number;
}
export type MFXAttitudeReferenceFrame =
  "relative" | "gravity-aligned" | "magnetic-north" | "true-north";
export type MFXRotationMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Immutable right-handed orientation. Euler angles use intrinsic Z-Y-X (yaw, pitch, roll). */
export class MFXAttitude {
  readonly quaternion: MFXQuaternion;
  readonly rotationMatrix: MFXRotationMatrix;
  readonly roll: number;
  readonly pitch: number;
  readonly yaw: number;
  constructor(quaternion: MFXQuaternion) {
    const length = Math.hypot(
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
    );
    if (!Number.isFinite(length) || length === 0)
      throw new RangeError("A finite nonzero quaternion is required.");
    const { x, y, z, w } = (this.quaternion = Object.freeze({
      x: quaternion.x / length,
      y: quaternion.y / length,
      z: quaternion.z / length,
      w: quaternion.w / length,
    }));
    this.rotationMatrix = Object.freeze([
      1 - 2 * (y * y + z * z),
      2 * (x * y - z * w),
      2 * (x * z + y * w),
      2 * (x * y + z * w),
      1 - 2 * (x * x + z * z),
      2 * (y * z - x * w),
      2 * (x * z - y * w),
      2 * (y * z + x * w),
      1 - 2 * (x * x + y * y),
    ]);
    this.roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
    this.pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x))));
    this.yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    Object.freeze(this);
  }
  static fromEuler(roll: number, pitch: number, yaw: number): MFXAttitude {
    const cr = Math.cos(roll / 2),
      sr = Math.sin(roll / 2),
      cp = Math.cos(pitch / 2),
      sp = Math.sin(pitch / 2),
      cy = Math.cos(yaw / 2),
      sy = Math.sin(yaw / 2);
    return new MFXAttitude({
      x: sr * cp * cy - cr * sp * sy,
      y: cr * sp * cy + sr * cp * sy,
      z: cr * cp * sy - sr * sp * cy,
      w: cr * cp * cy + sr * sp * sy,
    });
  }
  static fromRotationMatrix(matrix: MFXRotationMatrix): MFXAttitude {
    if (matrix.length !== 9 || !matrix.every(Number.isFinite))
      throw new RangeError("A finite 3 by 3 rotation matrix is required.");
    for (let row = 0; row < 3; row++) {
      for (let other = 0; other < 3; other++) {
        const dot =
          matrix[row * 3] * matrix[other * 3] +
          matrix[row * 3 + 1] * matrix[other * 3 + 1] +
          matrix[row * 3 + 2] * matrix[other * 3 + 2];
        if (Math.abs(dot - (row === other ? 1 : 0)) > 1e-6)
          throw new RangeError("Rotation matrix must be orthonormal.");
      }
    }
    const [a, b, c, d, e, f, g, h, i] = matrix;
    if (
      Math.abs(
        a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g) - 1,
      ) > 1e-6
    )
      throw new RangeError("Rotation matrix must be right-handed.");
    const trace = a + e + i;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      return new MFXAttitude({
        w: s / 4,
        x: (h - f) / s,
        y: (c - g) / s,
        z: (d - b) / s,
      });
    }
    if (a > e && a > i) {
      const s = Math.sqrt(1 + a - e - i) * 2;
      return new MFXAttitude({
        w: (h - f) / s,
        x: s / 4,
        y: (b + d) / s,
        z: (c + g) / s,
      });
    }
    if (e > i) {
      const s = Math.sqrt(1 + e - a - i) * 2;
      return new MFXAttitude({
        w: (c - g) / s,
        x: (b + d) / s,
        y: s / 4,
        z: (f + h) / s,
      });
    }
    const s = Math.sqrt(1 + i - a - e) * 2;
    return new MFXAttitude({
      w: (d - b) / s,
      x: (c + g) / s,
      y: (f + h) / s,
      z: s / 4,
    });
  }
  multiply(other: MFXAttitude): MFXAttitude {
    const a = this.quaternion,
      b = other.quaternion;
    return new MFXAttitude({
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    });
  }
  inverse(): MFXAttitude {
    const q = this.quaternion;
    return new MFXAttitude({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
  }
  multiplyByInverseOf(other: MFXAttitude): MFXAttitude {
    return this.multiply(other.inverse());
  }
  /** Keep quaternion signs continuous without changing the represented rotation. */
  continuousWith(previous: MFXAttitude | null): MFXAttitude {
    const q = this.quaternion,
      p = previous?.quaternion;
    return p && q.x * p.x + q.y * p.y + q.z * p.z + q.w * p.w < 0
      ? new MFXAttitude({ x: -q.x, y: -q.y, z: -q.z, w: -q.w })
      : this;
  }
}
