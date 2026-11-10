import { useState } from 'react';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { CropResult } from '../components/CropResult';
import { CropSelector } from '../components/CropSelector';
import { EMPTY_CONTEXT } from '../components/ChartContextForm';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { INTERVALS, MonitorPanel } from '../components/MonitorPanel';
import { OnboardingGate } from '../components/OnboardingGate';
import { RiskNotice } from '../components/RiskNotice';
import { SessionControls } from '../components/SessionControls';
import { SourceCard } from '../components/SourceCard';
import { VISION_MODELS, type VisionModel } from '../analysis/ollama';
import type { ChartContext } from '../types/market';
import { sendRequest } from './api';
import { useCaptureFlow } from './hooks/useCaptureFlow';
import { useCrop } from './hooks/useCrop';
import { useMonitor } from './hooks/useMonitor';
import { useOnboarding } from './hooks/useOnboarding';
import { useSession } from './hooks/useSession';
import { useSourceVisible } from './hooks/useSourceVisible';

type Tab = 'capture' | 'dev' | 'about';

export default function App() {
  const [tab, setTab] = useState<Tab>('capture');
  const onboarding = useOnboarding();
  const session = useSession();
  const flow = useCaptureFlow(session);
  const sourceVisible = useSourceVisible(session?.source ?? null);
  const crop = useCrop(flow.frame, flow.selection, flow.stale === null);
  const [context, setContext] = useState<ChartContext>(EMPTY_CONTEXT);
  const [model, setModel] = useState<VisionModel>(VISION_MODELS[0]);
  const [intervalSec, setIntervalSec] = useState(INTERVALS[1]!);
  // Monitoring runs exactly while the session is active: Pause, Stop, tab loss or closing the panel end it.
  const monitor = useMonitor({
    active: session?.status === 'active' && onboarding.accepted === true,
    frame: flow.frame,
    selection: flow.selection,
    selectionLayout: session?.selection?.layout ?? null,
    stale: flow.stale !== null,
    captureOnce: flow.captureOnce,
    context,
    intervalSec,
    model,
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

      <div role="tablist" aria-label="Sections" className="grid grid-cols-3 gap-1 rounded-md bg-zinc-900 p-1 text-sm">
        {(
          [
            ['capture', 'Monitor'],
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
          <p className="text-xs text-zinc-500">ChartSense v0.1.0 · Phase 2 + live local-AI monitoring · paper trading only</p>
        </section>
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
            context={context}
            onContext={(patch) => setContext((c) => ({ ...c, ...patch }))}
            model={model}
            onModel={setModel}
            intervalSec={intervalSec}
            onInterval={setIntervalSec}
          />

          {flow.frame ? (
            <>
              <CropSelector
                frame={flow.frame}
                selection={flow.selection}
                stale={flow.stale}
                onCommit={flow.commitSelection}
                onClear={flow.clearSelection}
              />
              <CropResult crop={crop} />
            </>
          ) : null}

          <footer className="mt-auto pt-2 text-[11px] leading-relaxed text-zinc-500">
            Screenshots stay in this panel’s memory and are cleared on Stop. Only the cropped chart goes to Ollama on this computer; nothing is uploaded. Not financial advice.
          </footer>
        </>
      )}
    </main>
  );
}
