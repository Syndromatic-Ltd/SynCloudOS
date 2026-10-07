/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export { createSynWareTestHost } from "./createSynWareTestHost";
export { createSynWareTesting } from "./createSynWareTesting";
export type {
  CreateSynWareTestingOptions,
  SynWareTestingDriver,
  SynWareTestingHost,
  SynWareTestingWaiter,
  SynWareTestingWatchdog,
} from "./createSynWareTesting";
export {
  createDeterministicRuntimeEnvironment,
  createDeterministicScheduler,
  createFakeCapabilityPort,
  createFakeClipboardAdapter,
  createFakeStorageAdapter,
} from "./fakeAdapters";
export type {
  CreateFakeCapabilityPortOptions,
  DeterministicRuntimeEnvironment,
  DeterministicScheduler,
  FakeClipboardAdapter,
  FakeStorageAdapter,
} from "./fakeAdapters";
export {
  createDeniedFakeServiceClient,
  createFakeWindowClient,
} from "./fakeClients";
export type { FakeWindowClientControl } from "./fakeClients";
export type {
  CreateSynWareTestHostOptions,
  SynWareFakeAnimationOperation,
  SynWareFakeAudioOperation,
  SynWareFakeBrowserOperation,
  SynWareFakeCall,
  SynWareFakeClipboard,
  SynWareFakeClipboardOperation,
  SynWareFakeControl,
  SynWareFakeCredentialOperation,
  SynWareFakeDocumentOperation,
  SynWareFakeDragOperation,
  SynWareFakeFileOperation,
  SynWareFakeImageOperation,
  SynWareFakeLocation,
  SynWareFakeLocationOperation,
  SynWareFakeMIDI,
  SynWareFakeMIDIOperation,
  SynWareFakeMediaOperation,
  SynWareFakeMode,
  SynWareFakeNavigationOperation,
  SynWareFakeOverlayOperation,
  SynWareFakePanelOperation,
  SynWareFakePermissionOperation,
  SynWareFakePolicyOperation,
  SynWareFakePort,
  SynWareFakeRecoveryOperation,
  SynWareFakeServiceOperation,
  SynWareFakeStorage,
  SynWareFakeStorageOperation,
  SynWareFakeTextOperation,
  SynWareFakeVideo,
  SynWareFakeVideoOperation,
  SynWareFakeViewportOperation,
  SynWareFakeWebContentOperation,
  SynWareFakeWindowOperation,
  SynWareFakeWorkspaceOperation,
  SynWareTestAdapters,
  SynWareTestClock,
  SynWareTestMediaClock,
  SynWareTestCommandInspection,
  SynWareTestDisposalReport,
  SynWareTestDocumentInspection,
  SynWareTestHost,
  SynWareTestLifecycle,
  SynWareTestPersistence,
  SynWareTestRenderResult,
  SynWareTestResourceLease,
  SynWareTestResources,
  SynWareTestSettlement,
} from "./testHostTypes";
