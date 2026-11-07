import type { TrustedSynWareBundle } from "../../BundleLoader/bundleTypes";
import {
  createSynCloudOSHostContribution,
  createSynCloudOSHostInstallContext,
  prepareSynCloudOSHostContributions,
  type SynCloudOSHostContributionCleanup,
} from "../../HostContributions/hostContribution";
import type { SynCloudOSRuntime } from "../../SynCloudOS";
import type { SynWareTestApplicationDocumentsConfiguration } from "./testHostTypes";

export interface HostDocumentProvision {
  install(signal: AbortSignal): Promise<void>;
  dispose(): Promise<void>;
}

type DocumentInstallResult = void | SynCloudOSHostContributionCleanup;

/** Revocation settles the host wait, not the installer's independent work. Its
 * eventual result remains observed and any late cleanup still runs once. */
function awaitDocumentInstallation(
  install: () => DocumentInstallResult | Promise<DocumentInstallResult>,
  signal: AbortSignal,
): Promise<SynCloudOSHostContributionCleanup | undefined> {
  const revoked = () => new DOMException("Document test-host provision was revoked.", "AbortError");
  if (signal.aborted) return Promise.reject(revoked());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(revoked()));
    signal.addEventListener("abort", onAbort, { once: true });
    void Promise.resolve().then(() => {
      if (signal.aborted) throw revoked();
      return install();
    }).then(async returned => {
      if (returned !== undefined && typeof returned !== "function") throw new TypeError("Document test-host cleanup must be a function.");
      const cleanup = typeof returned === "function" ? returned : undefined;
      if (settled) {
        await cleanup?.();
        return;
      }
      finish(() => resolve(cleanup));
    }, error => finish(() => reject(error))).catch(error => {
      // A cancelled owner cannot receive a late installer/cleanup failure, but
      // the promise must remain observed after its render has settled.
      finish(() => reject(error));
    });
  });
}

/** Keeps production contribution authority inside the trusted testing host. */
export function createHostDocumentProvision(
  runtime: SynCloudOSRuntime,
  bundle: TrustedSynWareBundle,
  configuration: SynWareTestApplicationDocumentsConfiguration | undefined,
): HostDocumentProvision | null {
  if (!configuration?.install) return null;
  const { install, trustedDocumentKinds, ...applicationDocuments } = configuration;
  const contribution = createSynCloudOSHostContribution(
    "synware-test-documents",
    `synware-test-host:${bundle.manifest.bundleIdentifier}:documents`,
    () => ({
      initialBundles: [bundle],
      trustedDocumentKinds,
      applicationDocuments,
      install(context) {
        return install(Object.freeze({
          documents: context.documents,
          seed: context.seed,
          environment: context.environment,
          signal: context.signal,
        }));
      },
    }),
  );
  let installation: Promise<void> | null = null;
  let installCleanup: SynCloudOSHostContributionCleanup | undefined;
  let contextCleanup: (() => Promise<void>) | undefined;
  let disposed = false;

  const cleanup = async () => {
    const disposeInstall = installCleanup;
    const disposeContext = contextCleanup;
    installCleanup = undefined;
    contextCleanup = undefined;
    const errors: unknown[] = [];
    try { await disposeInstall?.(); } catch (error) { errors.push(error); }
    try { await disposeContext?.(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, "Document test-host provision cleanup failed.");
  };

  return Object.freeze({
    install(signal: AbortSignal) {
      if (disposed || signal.aborted) return Promise.reject(new DOMException("Document test-host provision was revoked.", "AbortError"));
      if (installation) return installation;
      installation = (async () => {
        const [prepared] = await prepareSynCloudOSHostContributions([contribution], runtime.environment);
        if (disposed || signal.aborted) throw new DOMException("Document test-host provision was revoked.", "AbortError");
        const handle = createSynCloudOSHostInstallContext(prepared!, runtime, {}, signal);
        contextCleanup = handle.cleanup;
        try {
          installCleanup = await awaitDocumentInstallation(
            () => prepared!.install?.(handle.context),
            handle.context.signal,
          );
          if (disposed || signal.aborted) throw new DOMException("Document test-host provision was revoked.", "AbortError");
        } catch (error) {
          try { await cleanup(); } catch { /* Preserve the installation failure. */ }
          throw error;
        }
      })();
      return installation;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await cleanup();
    },
  });
}
