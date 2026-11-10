import { useState } from 'react';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { CropResult } from '../components/CropResult';
import { CropSelector } from '../components/CropSelector';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { JournalPanel } from '../components/JournalPanel';
import { MonitorPanel } from '../components/MonitorPanel';
import { OnboardingGate } from '../components/OnboardingGate';
import { RiskNotice } from '../components/RiskNotice';
import { SessionControls } from '../components/SessionControls';
import { SourceCard } from '../components/SourceCard';
import { TrainingExport } from '../components/TrainingExport';
import { sendRequest } from './api';
import { useCaptureFlow } from './hooks/useCaptureFlow';
import { useCrop } from './hooks/useCrop';
import { useJournal } from './hooks/useJournal';
import { useMonitor } from './hooks/useMonitor';
import { useMonitorSettings } from './hooks/useMonitorSettings';
import { useOnboarding } from './hooks/useOnboarding';
import { useSession } from './hooks/useSession';
import { useSourceVisible } from './hooks/useSourceVisible';

type Tab = 'capture' | 'journal' | 'dev' | 'about';

export default function App() {
  const [tab, setTab] = useState<Tab>('capture');
  const onboarding = useOnboarding();
  const session = useSession();
  const flow = useCaptureFlow(session);
  const sourceVisible = useSourceVisible(session?.source ?? null);
  const crop = useCrop(flow.frame, flow.selection, flow.stale === null);
  const journal = useJournal();
  const [settings, updateSettings] = useMonitorSettings();
  // Monitoring runs exactly while the session is active: Pause, Stop, tab loss or closing the panel end it.
  const monitor = useMonitor({
    active: session?.status === 'active' && onboarding.accepted === true,
    frame: flow.frame,
    selection: flow.selection,
    selectionLayout: session?.selection?.layout ?? null,
    stale: flow.stale !== null,
    sourceVisible,
    captureOnce: flow.captureOnce,
    context: settings.context,
    intervalSec: settings.intervalSec,
    model: settings.model,
  });

  const send = (type: 'START_SESSION' | 'PAUSE_SESSION' | 'RESUME_SESSION' | 'STOP_SESSION') =>
    void sendRequest({ type });

  if (session === null || onboarding.accepted === null) {
    return (
      <main className="p-3">
        <Header />
        <p className="mt-4 text-sm text-zinc-400">Loading…</p>
      </main>
    );
  }

  const error = flow.localError ?? session.lastError;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-3 p-3">
      <Header />

      <div role="tablist" aria-label="Sections" className="grid grid-cols-4 gap-1 rounded-md bg-zinc-900 p-1 text-sm">
        {(
          [
            ['capture', 'Monitor'],
            ['journal', 'Journal'],
            ['dev', 'Developer'],
            ['about', 'About & risk'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded px-2 py-1.5 font-medium ${
              tab === id ? 'bg-zinc-700 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'about' ? (
        <section aria-label="About and risk notice" className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <RiskNotice />
          <p className="text-xs text-zinc-500">ChartSense v0.1.0 · live local-AI monitoring + paper-trading journal · paper trading only</p>
        </section>
      ) : tab === 'journal' ? (
        <JournalPanel journal={journal} />
      ) : tab === 'dev' ? (
        <AnalysisPanel />
      ) : !onboarding.accepted ? (
        <OnboardingGate onAccept={onboarding.accept} />
      ) : (
        <>
          <SourceCard session={session} sourceVisible={sourceVisible} />

          {error ? (
            <ErrorBanner
              code={error.code}
              onDismiss={flow.dismissError}
            />
          ) : null}

          <SessionControls
            session={session}
            busy={flow.busy}
            sourceVisible={sourceVisible}
            onStart={() => send('START_SESSION')}
            onCaptureOnce={flow.captureOnce}
            onPause={() => send('PAUSE_SESSION')}
            onResume={() => send('RESUME_SESSION')}
            onStop={() => {
              send('STOP_SESSION');
            }}
          />

          <MonitorPanel
            view={monitor}
            settings={settings}
            onSettings={updateSettings}
            journal={journal}
          />

          {flow.frame && flow.selection && !flow.stale ? (
            // Region chosen: keep the screenshot out of the way; it stays one click away for re-selecting.
            <details className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Chart region selected · show screenshot and selection
              </summary>
              <div className="mt-3 space-y-3">
                <CropSelector frame={flow.frame} selection={flow.selection} stale={flow.stale} onCommit={flow.commitSelection} onClear={flow.clearSelection} />
                <CropResult crop={crop} />
                {/* Always mounted: monitoring re-crops every few seconds and must not reset a review in progress. */}
                <TrainingExport
                  crop={crop.status === 'done' && crop.outcome.ok ? crop.outcome.value : null}
                  sessionStartedAt={session.startedAt}
                  chartTimeframeSec={settings.context.chartTimeframeSec}
                />
              </div>
            </details>
          ) : flow.frame ? (
            <CropSelector frame={flow.frame} selection={flow.selection} stale={flow.stale} onCommit={flow.commitSelection} onClear={flow.clearSelection} />
          ) : null}

          <footer className="mt-auto pt-2 text-[11px] leading-relaxed text-zinc-500">
            Screenshots stay in this panel’s memory and are cleared on Stop. Only the cropped chart goes to Ollama on this computer; nothing is uploaded. Not financial advice.
          </footer>
        </>
      )}
    </main>
  );
}
