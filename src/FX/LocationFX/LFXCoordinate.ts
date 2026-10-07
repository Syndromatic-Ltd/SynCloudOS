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

const WGS84_SEMI_MAJOR_AXIS_METRES = 6_378_137;
const WGS84_FLATTENING = 1 / 298.257_223_563;
const WGS84_SEMI_MINOR_AXIS_METRES = WGS84_SEMI_MAJOR_AXIS_METRES * (1 - WGS84_FLATTENING);
const WGS84_AUTHALIC_RADIUS_METRES = 6_371_007.180_918_475;
const TWO_PI = Math.PI * 2;

function finiteCoordinate(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} must be finite and in [${minimum}, ${maximum}] degrees.`);
  return Object.is(value, -0) ? 0 : value;
}

function normaliseRadians(value: number): number {
  const normalized = value % TWO_PI;
  const positive = normalized < 0 ? normalized + TWO_PI : normalized;
  return Object.is(positive, -0) ? 0 : positive;
}

function normaliseLongitudeRadians(value: number): number {
  const wrapped = (value + Math.PI) % TWO_PI;
  return (wrapped < 0 ? wrapped + TWO_PI : wrapped) - Math.PI;
}

function sphericalFallback(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): Readonly<{ distance: number; bearing: number }> {
  const deltaLatitude = latitude2 - latitude1;
  const deltaLongitude = normaliseLongitudeRadians(longitude2 - longitude1);
  const sinLatitude = Math.sin(deltaLatitude / 2);
  const sinLongitude = Math.sin(deltaLongitude / 2);
  const haversine = sinLatitude * sinLatitude
    + Math.cos(latitude1) * Math.cos(latitude2) * sinLongitude * sinLongitude;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
  const bearing = Math.atan2(
    Math.sin(deltaLongitude) * Math.cos(latitude2),
    Math.cos(latitude1) * Math.sin(latitude2)
      - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(deltaLongitude),
  );
  return Object.freeze({
    distance: WGS84_AUTHALIC_RADIUS_METRES * centralAngle,
    bearing: centralAngle === 0 ? 0 : normaliseRadians(bearing),
  });
}

function wgs84Inverse(left: LFXCoordinate, right: LFXCoordinate): Readonly<{ distance: number; bearing: number }> {
  const latitude1 = left.latitude * Math.PI / 180;
  const latitude2 = right.latitude * Math.PI / 180;
  const longitude1 = left.longitude * Math.PI / 180;
  const longitude2 = right.longitude * Math.PI / 180;
  const longitudeDelta = normaliseLongitudeRadians(longitude2 - longitude1);
  const reducedLatitude1 = Math.atan((1 - WGS84_FLATTENING) * Math.tan(latitude1));
  const reducedLatitude2 = Math.atan((1 - WGS84_FLATTENING) * Math.tan(latitude2));
  const sinU1 = Math.sin(reducedLatitude1);
  const cosU1 = Math.cos(reducedLatitude1);
  const sinU2 = Math.sin(reducedLatitude2);
  const cosU2 = Math.cos(reducedLatitude2);

  let lambda = longitudeDelta;
  let sinSigma = 0;
  let cosSigma = 1;
  let sigma = 0;
  let sinAlpha = 0;
  let cosSquaredAlpha = 1;
  let cos2SigmaM = 0;
  let converged = false;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    const x = cosU2 * sinLambda;
    const y = cosU1 * sinU2 - sinU1 * cosU2 * cosLambda;
    sinSigma = Math.hypot(x, y);
    if (sinSigma === 0)
      return Object.freeze({ distance: 0, bearing: 0 });
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    cosSquaredAlpha = Math.max(0, 1 - sinAlpha * sinAlpha);
    cos2SigmaM = cosSquaredAlpha > Number.EPSILON
      ? cosSigma - 2 * sinU1 * sinU2 / cosSquaredAlpha
      : 0;
    const coefficient = WGS84_FLATTENING / 16 * cosSquaredAlpha
      * (4 + WGS84_FLATTENING * (4 - 3 * cosSquaredAlpha));
    const previous = lambda;
    lambda = longitudeDelta + (1 - coefficient) * WGS84_FLATTENING * sinAlpha
      * (sigma + coefficient * sinSigma
        * (cos2SigmaM + coefficient * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - previous) <= 1e-12) {
      converged = true;
      break;
    }
  }

  if (!converged)
    return sphericalFallback(latitude1, longitude1, latitude2, longitude2);

  const uSquared = cosSquaredAlpha
    * (WGS84_SEMI_MAJOR_AXIS_METRES ** 2 - WGS84_SEMI_MINOR_AXIS_METRES ** 2)
    / (WGS84_SEMI_MINOR_AXIS_METRES ** 2);
  const coefficientA = 1 + uSquared / 16_384
    * (4_096 + uSquared * (-768 + uSquared * (320 - 175 * uSquared)));
  const coefficientB = uSquared / 1_024
    * (256 + uSquared * (-128 + uSquared * (74 - 47 * uSquared)));
  const deltaSigma = coefficientB * sinSigma
    * (cos2SigmaM + coefficientB / 4
      * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
        - coefficientB / 6 * cos2SigmaM
        * (-3 + 4 * sinSigma * sinSigma)
        * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  const distance = WGS84_SEMI_MINOR_AXIS_METRES * coefficientA * (sigma - deltaSigma);
  const bearing = Math.atan2(
    cosU2 * Math.sin(lambda),
    cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(lambda),
  );
  return Object.freeze({ distance, bearing: normaliseRadians(bearing) });
}

/** Immutable WGS84 latitude/longitude pair in degrees. */
export class LFXCoordinate {
  readonly latitude: number;
  readonly longitude: number;

  constructor(latitude: number, longitude: number) {
    this.latitude = finiteCoordinate(latitude, -90, 90, "Latitude");
    this.longitude = finiteCoordinate(longitude, -180, 180, "Longitude");
    Object.freeze(this);
  }

  /** Approximate WGS84 ellipsoidal distance in metres. */
  distanceTo(other: LFXCoordinate): number {
    if (!(other instanceof LFXCoordinate))
      throw new TypeError("Location distance requires an LFXCoordinate.");
    return wgs84Inverse(this, other).distance;
  }

  /** Approximate initial WGS84 bearing in normalized radians [0, 2π). */
  initialBearingTo(other: LFXCoordinate): number {
    if (!(other instanceof LFXCoordinate))
      throw new TypeError("Location bearing requires an LFXCoordinate.");
    return wgs84Inverse(this, other).bearing;
  }
}
