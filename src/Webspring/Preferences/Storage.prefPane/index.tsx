/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useEffect, useState, useSyncExternalStore } from "react";
import { NSEButton, NSEGroupBox } from "../../../NSE/public/controls";
import { definePreferencePane } from "../../../SynCloudOS/Preferences";
import { useKernelSynCloudOS } from "../../../SynCloudOSReact";
import { useSystemText } from "../useSystemText";
import { StorageDiagnosticsController, initialStorageDiagnostics } from "./StorageDiagnosticsController";
import "./storageDiagnostics.css";

const subscribeIdle = () => () => {};
const getIdle = () => initialStorageDiagnostics;
function StoragePane() {
  const runtime = useKernelSynCloudOS(), t = useSystemText();
  const [controller, setController] = useState<StorageDiagnosticsController | null>(null);
  useEffect(() => {
    const owned = new StorageDiagnosticsController(runtime);
    setController(owned);
    return () => owned.dispose();
  }, [runtime]);
  const snapshot = useSyncExternalStore(controller?.subscribe ?? subscribeIdle, controller?.getSnapshot ?? getIdle, getIdle);
  const estimate = snapshot.observation?.estimate, persistence = snapshot.observation?.persistence;
  const unavailable = (state: "unsupported" | "denied" | "failed") => state === "unsupported" ? t("preferences.storage.unsupported", "Not supported by this browser") : state === "denied" ? t("preferences.storage.denied", "The browser refused this query") : t("preferences.storage.failed", "The query failed");
  const bytes = (value: number | null) => value === null ? t("preferences.storage.omitted", "Not reported by the browser") : t("preferences.storage.bytes", "About {bytes} bytes", { bytes: String(value) });
  return <section className="nse-storage-diagnostics" aria-label={t("preferences.storage", "Storage")}>
    <NSEGroupBox><div className="nse-storage-diagnostics-section">
      <h2>{t("preferences.storage.heading", "Browser storage")}</h2>
      <NSEButton
        title={snapshot.state === "completed" ? t("preferences.storage.refresh", "Refresh storage status") : t("preferences.storage.inspect", "Check storage status")}
        isEnabled={!(!controller || snapshot.state === "ended")}
        onClick={() => { void controller?.refresh(); }}
      />
      <p role="status" aria-live="polite" aria-atomic="true">{snapshot.state === "checking" ? t("preferences.storage.checking", "Checking browser storage…") : snapshot.state === "completed" ? t("preferences.storage.observed", "Storage check completed. Refresh to check again.") : snapshot.state === "ended" ? t("preferences.storage.ended", "This observation has ended. Reopen Storage to check again.") : t("preferences.storage.idle", "Storage has not been checked.")}</p>
      <p className="nse-prefs-note">{t("preferences.storage.scope", "Estimates cover this website's browser storage, not one account or document. Values are approximate and may change.")}</p>
      {estimate ? <dl className="nse-storage-diagnostics-values">
        <div><dt>{t("preferences.storage.usage", "Estimated usage")}</dt><dd>{estimate.state === "observed" ? bytes(estimate.usageBytes) : unavailable(estimate.state)}</dd></div>
        <div><dt>{t("preferences.storage.quota", "Estimated quota")}</dt><dd>{estimate.state === "observed" ? bytes(estimate.quotaBytes) : unavailable(estimate.state)}</dd></div>
      </dl> : null}
      {persistence ? <p><strong>{t("preferences.storage.persistence", "Current persistence status")}: </strong>{persistence.state !== "observed" ? unavailable(persistence.state) : persistence.persisted ? t("preferences.storage.persistent", "The browser reports persistent storage") : t("preferences.storage.bestEffort", "The browser does not report persistent storage")}</p> : null}
      <p className="nse-prefs-note">{t("preferences.storage.limit", "Persistence is not a backup or a guarantee of offline availability or update readiness. This check does not request persistence or change stored data.")}</p>
    </div></NSEGroupBox>
  </section>;
}
function StorageSummary() {
  const t = useSystemText();
  return <>{t("preferences.storage.summary", "Read-only browser observations")}</>;
}
export default definePreferencePane({ id: "storage", title: { key: "preferences.storage", fallback: "Storage" }, order: 650, summary: StorageSummary, view: StoragePane });
