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

export { IFXImage } from "./IFXImage";
export { IFXShader } from './IFXShader';
export type { IFXShaderUniform, IFXShaderUniformType } from './IFXShader';
export { createIFXTextImage, createIFXAttributedTextImage } from "./IFXTextImage";
export type { IFXTextImageOptions } from "./IFXTextImage";
export { IFXFilterGraph } from "./IFXFilterGraph";
export type { IFXSerializedGraph } from "./IFXFilterGraph";
export { IFXContext } from "./IFXContext";
export type { IFXContextBudgets, IFXResolvedContextBudgets, IFXRenderOptions, IFXTileRenderInfo } from "./IFXContext";
export { IFXRenderDestination } from "./IFXRenderDestination";
export { IFXTileRenderDestination } from "./IFXTileRenderDestination";
export type { IFXRenderedTile, IFXTileRenderDestinationOptions } from "./IFXTileRenderDestination";
export { IFXTilePlan } from "./IFXTilePlan";
export type { IFXTileDescriptor } from "./IFXTilePlan";
export { IFXRenderTask } from "./IFXRenderTask";
export type { IFXPeakBytes, IFXRenderInfo, IFXRenderResult } from "./IFXRenderTask";
export type { IFXBackendRenderOptions, IFXRenderBackend, IFXRenderBackendCapabilities, IFXRenderBackendKind, IFXRenderDestinationKind } from "./IFXRenderBackend";
export { IFXRenderPipeline } from "./IFXRenderPipeline";
export { IFXSampler } from "./IFXSampler";
export type { IFXPremultipliedSample } from "./IFXSampler";
export { IFXImageAccumulator } from "./IFXImageAccumulator";
export type { IFXExtent } from "./extent";
export { IFXImageResource } from "./IFXImageResource";
export type { IFXImageResourcePort, IFXResourceHandle } from "./IFXImageResource";
export { IFXFilter,IFXFilterRegistry } from "./IFXFilterRegistry";
export type { IFXFilterName,IFXFilterParameters,IFXFilterCategory,IFXBlendMode,IFXColourComponents } from "./filterTypes";
export { IFXProcessorDefinition } from "./IFXProcessorDefinition";
export type { IFXProcessorDefinitionOptions, IFXProcessorDescriptor, IFXProcessorOutputDeclaration, IFXProcessorParameterRule, IFXProcessorROIDeclaration, IFXProcessorPortableBinding, IFXProcessorPortableKernelProgram, IFXProcessorPortableProgram } from "./IFXProcessorDefinition";
export { IFXGraphCodec } from "./IFXGraphCodec";
export type { IFXSerializedGraphV2, IFXSerializedGraphV3, IFXPortableGraph } from "./IFXGraphCodec";
export { IFXAztecCodeDescriptor,IFXBarcodeDescriptor,IFXDataMatrixCodeDescriptor,IFXPDF417CodeDescriptor,IFXQRCodeDescriptor } from "./IFXBarcodeDescriptor";
export type {
    IFXAztecCodeDescriptorData,
    IFXBarcodeDescriptorData,
    IFXBarcodePayloadKind,
    IFXDataMatrixCodeDescriptorData,
    IFXPDF417CodeDescriptorData,
    IFXQRCodeDescriptorData,
    IFXQRCodeErrorCorrectionLevel,
} from "./IFXBarcodeDescriptor";
export type { IFXAztecCodeDescriptorOptions,IFXDataMatrixCodeDescriptorOptions,IFXPDF417CodeDescriptorOptions } from "./barcodeDescriptors";
export { IFXDetector } from "./analysis/IFXDetector";
export type { IFXDetectorOptions, IFXDetectionRequest } from "./analysis/IFXDetector";
export { IFXUnsupportedAnalysisError, IFXAnalysisExecutionError, IFXPortableAnalysisBackend } from "./analysis/IFXAnalysisBackend";
export type { IFXAnalysisBackend, IFXAnalysisCapability, IFXAnalysisCapabilityName, IFXAnalysisOrientation, IFXAnalysisRaster } from "./analysis/IFXAnalysisBackend";
export { IFXModelAnalysisBackend } from "./analysis/IFXModelAnalysisBackend";
export type { IFXModelAnalysisBackendOptions, IFXModelFeatureConfiguration } from "./analysis/IFXModelAnalysisBackend";
export { IFXModelIntegrityError, IFXPortableModelBackend } from "./analysis/IFXModelBackend";
export type { IFXModelAsset, IFXModelBackend, IFXModelHeadDescriptor, IFXModelLoadContext, IFXModelProvenance, IFXModelPurpose, IFXModelQualityLevel, IFXModelSession } from "./analysis/IFXModelBackend";
export type { IFXFeature, IFXFeatureKind, IFXRectangleFeature, IFXQRCodeFeature, IFXTextRegionFeature, IFXFaceFeature } from "./analysis/IFXFeature";
export { IFXRAWFilter } from "./raw/IFXRAWFilter";
export type { IFXRAWSourceDescriptor } from "./raw/IFXRAWFilter";
export { IFXPortableDNGRAWBackend, IFXRAWDecodeError, IFXRAWUnsupportedError } from "./raw/IFXRAWBackend";
export type { IFXRAWBackend, IFXRAWBackendCapabilities, IFXRAWDecodeErrorCode, IFXRAWDevelopmentOptions, IFXRAWDevelopmentProvenance, IFXRAWDevelopmentResult, IFXRAWUnsupportedReason } from "./raw/IFXRAWBackend";
export { IFXRAWMetadata } from "./raw/IFXRAWMetadata";
export type { IFXRAWCFA, IFXRAWCFAColor, IFXRAWDecoderDescriptor, IFXRAWMetadataDescriptor, IFXRAWOrientation, IFXRAWOutputSampleFormat, IFXRAWWorkingColourSpace } from "./raw/IFXRAWMetadata";
export { IFXKernel,IFXColourKernel,IFXBlendKernel,IFXWarpKernel } from "./kernels/IFXKernel";
export type { IFXKernelInstruction,IFXKernelProgram } from "./kernels/IFXKernel";
