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

import type { IFXImage } from "../IFXImage";
import {
  IFXPortableModelBackend,
  normaliseIFXModelAsset,
  type IFXModelAsset,
  type IFXModelHeadDescriptor,
  type IFXModelQualityLevel,
  type IFXModelSession,
} from "../analysis/IFXModelBackend";
import type { ProcessingAccess } from "../processing";
import { fields, premult, processor, straight, type Definition } from "./common";

export const models: Record<string, Definition> = {};
const backend = new IFXPortableModelBackend();

function requiredModel(value: unknown, purpose: IFXModelAsset["purpose"]): IFXModelAsset {
  const model = normaliseIFXModelAsset(value);
  if (model.purpose !== purpose) throw new TypeError(`ImageFX model purpose must be '${purpose}'.`);
  return model;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean.`);
  return value;
}

function requiredInteger(value: unknown, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) throw new RangeError(`${label} is invalid.`);
  return value as number;
}

function requiredQuality(value: unknown): IFXModelQualityLevel {
  if (!(["fast", "balanced", "accurate"] as const).includes(value as IFXModelQualityLevel)) throw new TypeError("Person-segmentation quality level is invalid.");
  return value as IFXModelQualityLevel;
}

function assertMaskHead(model: IFXModelAsset): IFXModelHeadDescriptor {
  if (model.heads.length !== 1 || model.heads[0]?.channels !== 1 || model.heads[0]?.activation !== "sigmoid")
    throw new TypeError("Mask model must expose one sigmoid single-channel head.");
  return model.heads[0];
}

function sampleInput(access: ProcessingAccess, position: Readonly<{ x: number; y: number }>): readonly [number, number, number, number] {
  const value = straight(access.sample(0, position, "nearest"));
  return Object.freeze([value.r, value.g, value.b, value.a]);
}

function modelProcessor(
  name: string,
  input: IFXImage,
  parameters: Readonly<Record<string, unknown>>,
  model: IFXModelAsset,
  evaluate: (session: IFXModelSession, access: ProcessingAccess, position: Readonly<{ x: number; y: number }>) => Readonly<{ r: number; g: number; b: number; a: number }>,
) {
  const token = Object.freeze({});
  const session = (access: ProcessingAccess): IFXModelSession => {
    const value = access.getState<IFXModelSession>(token);
    if (!value) throw new Error("ImageFX model session was not prepared.");
    return value;
  };
  return processor(
    name,
    parameters,
    input.extent,
    (position, access) => premult(evaluate(session(access), access, position)),
    bounds => [bounds],
    async access => {
      if (!access.getState<IFXModelSession>(token)) {
        const loaded = await backend.load(model, { checkpoint: () => access.checkpoint() });
        access.setState(token, loaded);
      }
    },
    Object.freeze({ scope: "regional" as const, scratchBytes: model.data.length, work: Math.max(1, model.data.length) }),
  );
}

models.coreMLModel = {
  category: "stylize",
  inputs: 1,
  normalise(value) {
    const raw = fields(value, ["model", "headIndex", "softmaxNormalization"]);
    const model = requiredModel(raw.model, "image");
    const headIndex = requiredInteger(raw.headIndex, "Core-model head index", model.heads.length - 1);
    const softmaxNormalization = requiredBoolean(raw.softmaxNormalization, "Core-model softmax normalization");
    return Object.freeze({ model, headIndex, softmaxNormalization });
  },
  build(inputs, parameters) {
    const model = parameters.model as IFXModelAsset, headIndex = parameters.headIndex as number, softmax = parameters.softmaxNormalization as boolean;
    return modelProcessor("coreMLModel", inputs[0]!, parameters, model, (session, access, position) => {
      const output = session.evaluate(sampleInput(access, position), headIndex, softmax);
      if (output.length === 1) return Object.freeze({ r: output[0]!, g: output[0]!, b: output[0]!, a: 1 });
      if (output.length !== 4) throw new RangeError("Core-model image head must contain one or four channels.");
      return Object.freeze({ r: output[0]!, g: output[1]!, b: output[2]!, a: output[3]! });
    });
  },
};

models.personSegmentation = {
  category: "stylize",
  inputs: 1,
  normalise(value) {
    const raw = fields(value, ["model", "qualityLevel"]);
    const model = requiredModel(raw.model, "person-segmentation"), qualityLevel = requiredQuality(raw.qualityLevel);
    assertMaskHead(model);
    if (model.qualityLevel !== qualityLevel) throw new TypeError("Person-segmentation model quality does not match the requested quality level.");
    return Object.freeze({ model, qualityLevel });
  },
  build(inputs, parameters) {
    const model = parameters.model as IFXModelAsset;
    return modelProcessor("personSegmentation", inputs[0]!, parameters, model, (session, access, position) => {
      const probability = session.evaluate(sampleInput(access, position), 0)[0]!;
      return Object.freeze({ r: probability, g: probability, b: probability, a: 1 });
    });
  },
};

models.saliencyMap = {
  category: "stylize",
  inputs: 1,
  normalise(value) {
    const raw = fields(value, ["model"]), model = requiredModel(raw.model, "saliency-map");
    assertMaskHead(model);
    return Object.freeze({ model });
  },
  build(inputs, parameters) {
    const model = parameters.model as IFXModelAsset;
    return modelProcessor("saliencyMap", inputs[0]!, parameters, model, (session, access, position) => {
      const probability = session.evaluate(sampleInput(access, position), 0)[0]!;
      return Object.freeze({ r: probability, g: probability, b: probability, a: 1 });
    });
  },
};
