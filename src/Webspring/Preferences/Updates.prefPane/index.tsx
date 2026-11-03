import { useSyncExternalStore } from 'react';
import { NSEPushButton, NSEGroupBox } from '../../../NSE/public/controls';
import { definePreferencePane } from '../../../SynCloudOS/Preferences';
import type { HostUpdateReadinessSnapshot, HostReadinessGap } from '../../../SynCloudOS/SynCloudOS';
import { useKernelSynCloudOS } from '../../../SynCloudOSReact';
import { useSystemText } from '../useSystemText';
import './updatesReadiness.css';

const gapLabels: Record<HostReadinessGap, string> = {
  'document-admission': 'Documents being opened or admitted',
  'recovery-cleanup': 'Queued recovery writes and closing-document cleanup',
  'resource-terminal-work': 'Document resource and reconciliation cleanup',
  'editing-participants': 'Custom editing participants without read-only evidence',
  'editing-owner-census': 'Editing controllers and text sessions outside the observed inventory',
  'underlying-operation-work': 'Callbacks that may continue after logical cancellation',
  'private-job-admissions': 'Jobs using private backend admission',
  'managed-task-owners': 'Managed tasks without a host-wide owner inventory',
  'application-lifecycle-owners': 'Application, background and unpublished owner work',
  'command-lifecycle-undo': 'Command preparation, lifecycle callbacks and undo work',
  'persistence-work': 'Persistence work without completion evidence',
  'service-network-media': 'Unobserved service, network, media and device work',
  'native-picker-instrumentation': 'Native pickers without this host’s operation instrumentation',
  'native-write-permission': 'Native file writes and permission requests',
  'clipboard-download': 'Clipboard operations and download completion',
  'runtime-store-publication': 'Host store without an owned readiness publication boundary',
};
export function UpdateReadinessDetails({ snapshot }: { readonly snapshot: HostUpdateReadinessSnapshot }) {
  const t = useSystemText();
  const counts = snapshot.counts;
  const busy = counts.documentStorageWork + counts.operationWork + counts.lifecycleWork + counts.documentEditingWork + counts.persistenceMutations + counts.dirtyDocuments + counts.savingDocuments + counts.conflictedDocuments + counts.operations + counts.activeJobs + counts.queuedJobs + counts.nativeOperations + counts.documentAdmissions + counts.documentRecovery + counts.documentCleanup > 0 || snapshot.client.blockers.some(blocker => blocker !== 'provider-unavailable' && blocker !== 'owner-ended');
  const headline = snapshot.ended ? t('preferences.updates.closed', 'Host observation has ended') : busy ? t('preferences.updates.busy', 'Work is still in progress') : t('preferences.updates.incomplete', 'Some work cannot be inspected');
  const rows = [
    [t('preferences.updates.documents', 'Published documents'), counts.documents],
    [t('preferences.updates.admissions', 'Pending document admission stages'), counts.documentAdmissions],
    [t('preferences.updates.recoveryWork', 'Pending recovery stages'), counts.documentRecovery],
    [t('preferences.updates.cleanupWork', 'Pending document cleanup stages'), counts.documentCleanup],
    [t('preferences.updates.persistenceWork', 'Pending observed document-store mutations'), counts.persistenceMutations],
    [t('preferences.updates.storageCallbacks', 'Pending document storage callback stages'), counts.documentStorageWork],
    [t('preferences.updates.editingParticipants', 'Registered document editing participants'), counts.documentEditingParticipants],
    [t('preferences.updates.editingWork', 'Pending document editing stages'), counts.documentEditingWork],
    [t('preferences.updates.dirty', 'Documents with unsaved work'), counts.dirtyDocuments],
    [t('preferences.updates.saving', 'Documents saving'), counts.savingDocuments],
    [t('preferences.updates.conflicts', 'Conflicted documents'), counts.conflictedDocuments],
    [t('preferences.updates.windows', 'Application windows'), counts.windows],
    [t('preferences.updates.operations', 'Observed runtime operations'), counts.operations],
    [t('preferences.updates.operationWork', 'Pending operation callback stages'), counts.operationWork],
    [t('preferences.updates.lifecycleWork', 'Pending application and managed-task stages'), counts.lifecycleWork],
    [t('preferences.updates.jobs', 'Active / queued jobs'), `${counts.activeJobs} / ${counts.queuedJobs}`],
    [t('preferences.updates.native', 'Pending observed native operations'), counts.nativeOperations],
  ];
  const domainLabels = { documents: t('preferences.updates.domain.documents', 'Documents'), editing: t('preferences.updates.domain.editing', 'Editing'), tasks: t('preferences.updates.domain.tasks', 'Background work'), native: t('preferences.updates.domain.native', 'Native operations') };
  const inspection = snapshot.inspection;
  return <div className="nse-update-readiness">
    <NSEGroupBox><div className="nse-update-readiness-section">
      <h2>{t('preferences.updates.readiness', 'Update readiness')}</h2>
      <p role="status" aria-live="polite" aria-atomic="true">{headline}</p>
      <p className="nse-prefs-note">{t('preferences.updates.scope', 'These observations do not authorize an update. Missing coverage always defers; zero observed work does not prove the host is idle.')}</p>
      <dl className="nse-update-readiness-counts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </div></NSEGroupBox>
    <NSEGroupBox><div className="nse-update-readiness-section">
      <h3>{t('preferences.updates.coverage', 'Inspection coverage')}</h3>
      {snapshot.coverage.map(row => <details key={row.domain}>
        <summary>{domainLabels[row.domain]} — {row.status === 'observed' ? t('preferences.updates.documentOwnersObserved', 'Controller-owned work observed') : t('preferences.updates.partial', 'Incomplete')}</summary>
        {row.gaps.length ? <ul>{row.gaps.map(gap => <li key={gap}>{t(`preferences.updates.gap.${gap}`, gapLabels[gap])}</li>)}</ul> : <p>{t('preferences.updates.documentScope', 'Published documents and their admission stages are observed through the document controller. Other domains remain incomplete.')}</p>}
      </details>)}
    </div></NSEGroupBox>
    <NSEGroupBox><div className="nse-update-readiness-section">
      <h3>{t('preferences.updates.compatibility', 'Build compatibility')}</h3>
      <p>{t('preferences.updates.currentBuild', 'Host build')}: {snapshot.client.hostBuild === 'unconfigured' ? t('preferences.updates.buildNotConfigured', 'Not configured') : snapshot.client.hostBuild}</p>
      <p>{t('preferences.updates.generation', 'Observation generation')}: {snapshot.client.generation}</p>
      <p>{snapshot.compatibility.status === 'restricted' ? t('preferences.updates.restricted', 'The host restricts update compatibility.') : t('preferences.updates.unverified', 'No replacement build or storage compatibility has been verified.')}</p>
      <p className="nse-prefs-note">{t('preferences.updates.disabled', 'Installation, automatic reload and update activation controls are disabled here.')}</p>
    </div></NSEGroupBox>
    <NSEGroupBox><div className="nse-update-readiness-section">
      <h3>{t('preferences.updates.otherWindows', 'Other window observations')}</h3>
      <p>{inspection.state === 'checking' ? t('preferences.updates.checking', 'Inspecting configured participants…') : inspection.state === 'stale' ? t('preferences.updates.stale', 'The previous observation is stale. Work, membership or its observation lifetime may have changed.') : inspection.state === 'failed' ? t('preferences.updates.failed', 'Participant evidence could not be established. Defer the update.') : inspection.state === 'observed' && inspection.result?.status === 'ready-at-observation' ? t('preferences.updates.observedReady', 'The inspected participants reported no blocking work at that observation.') : inspection.state === 'observed' ? t('preferences.updates.observedDefer', 'The inspected participants require deferral.') : t('preferences.updates.notInspected', 'Other windows have not been inspected.')}</p>
      {inspection.result ? <p>{t('preferences.updates.participants', 'Participants observed')}: {inspection.result.participantCount}</p> : null}
      <p className="nse-prefs-note">{t('preferences.updates.observationLimit', 'An observation cannot lock other windows or prevent later edits. It is not permission to activate or reload.')}</p>
    </div></NSEGroupBox>
  </div>;
}
function UpdatesPane() {
  const runtime = useKernelSynCloudOS(), t = useSystemText();
  const snapshot = useSyncExternalStore(runtime.updateReadiness.subscribe, runtime.updateReadiness.getSnapshot, runtime.updateReadiness.getSnapshot);
  return <section aria-label={t('preferences.updates.readiness', 'Update readiness')}>
    <UpdateReadinessDetails snapshot={snapshot} />
    <div className="nse-update-readiness-actions">
      <NSEPushButton disabled={snapshot.ended} onClick={() => { runtime.updateReadiness.inspect(); }}>{t('preferences.updates.inspect', 'Inspect current work')}</NSEPushButton>
      {snapshot.inspection.available ? <NSEPushButton disabled={snapshot.ended || snapshot.inspection.state === 'checking'} onClick={() => { void runtime.updateReadiness.inspectParticipants(); }}>{t('preferences.updates.inspectOthers', 'Inspect other windows')}</NSEPushButton> : null}
    </div>
  </section>;
}
function UpdatesSummary() {
  const runtime = useKernelSynCloudOS(), t = useSystemText();
  const snapshot = useSyncExternalStore(runtime.updateReadiness.subscribe, runtime.updateReadiness.getSnapshot, runtime.updateReadiness.getSnapshot);
  return <>{snapshot.ended ? t('preferences.updates.unavailable', 'Unavailable') : t('preferences.updates.partial', 'Incomplete')}</>;
}
export default definePreferencePane({ id: 'updates', title: { key: 'preferences.updates', fallback: 'Updates' }, order: 600, summary: UpdatesSummary, view: UpdatesPane });
