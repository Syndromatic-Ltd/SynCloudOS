import type { AppAnimationClient } from '../../src/SynCloudOS/AppSDK/appEnvironmentClientTypes';
import type { AnimationLayerHost } from '../../src/SynCloudOS/HostServices/AppSDKHostServiceTypes';
import type { NSEManagedAnimationHost, NSEManagedAFXRendererOptions } from '../../src/NSE/Application/managedAnimationRenderer';
import { createMountedAnimationLayers } from '../../src/SynCloudOS/HostServices/mountedAnimationLayers';

declare const app: AppAnimationClient;
declare const host: AnimationLayerHost;
declare const managedHost: NSEManagedAnimationHost;
declare const target: object;
declare const signal: AbortSignal;
app.createRenderer(target);
app.createRenderer(target, { layout: 'css', maximumQuads: 4096 });
host.createRenderer(target, { layout: 'css' }, signal);
managedHost.client.createRenderer(target, { layout: 'css' }, signal);
const mounted: AppAnimationClient['createRenderer'] = createMountedAnimationLayers(host, signal, () => {}).createRenderer;
mounted(target, { layout: 'css' });
// @ts-expect-error CSS is the only explicit layout override; omission retains the existing renderer-owned behavior.
app.createRenderer(target, { layout: 'absolute' });
// @ts-expect-error NSE manages layout internally; callers still supply only the established quad/error options.
const options: NSEManagedAFXRendererOptions = { layout: 'css' };
void options;
