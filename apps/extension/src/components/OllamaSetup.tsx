import { PlugZap } from 'lucide-react';
import { useState } from 'react';
import { checkOllama, OLLAMA_URL, type OllamaStatus, type VisionModel } from '../analysis/ollama';

const button =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40';

/** Manual connection check plus setup steps. Nothing is contacted until the button is pressed. */
export function OllamaSetup({ model, showSteps }: { model: VisionModel; showSteps: boolean }) {
  const [status, setStatus] = useState<{ model: VisionModel; value: OllamaStatus } | 'checking' | null>(null);
  const current = status !== null && status !== 'checking' && status.model === model ? status.value : null;
  const steps = showSteps || current?.state === 'unreachable';

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={status === 'checking'}
          onClick={() => {
            setStatus('checking');
            void checkOllama(model).then((value) => setStatus({ model, value }));
          }}
        >
          <PlugZap className="size-4" aria-hidden />
          {status === 'checking' ? 'Checking…' : 'Check Ollama'}
        </button>
        <span role="status" className="text-zinc-300">
          {current?.state === 'ready' ? `Connected · ${model} installed` : null}
          {current?.state === 'model_missing' ? `Connected, but ${model} is not installed. Run: ollama pull ${model}` : null}
          {current?.state === 'error' ? current.message : null}
          {current?.state === 'unreachable' ? `Not reachable at ${OLLAMA_URL}` : null}
        </span>
      </div>
      {steps ? (
        <ol className="list-decimal space-y-0.5 pl-4 text-zinc-300">
          <li>Install Ollama for Windows from ollama.com (free), then run <code>ollama pull {model}</code>.</li>
          <li>
            Allow this extension: set the user environment variable <code>OLLAMA_ORIGINS</code> to{' '}
            <code className="break-all">chrome-extension://{chrome.runtime.id}</code>, then quit and restart Ollama.
          </li>
          <li>Press Check Ollama. Until it connects, monitoring shows INSUFFICIENT DATA, never a guessed signal.</li>
        </ol>
      ) : null}
    </div>
  );
}
