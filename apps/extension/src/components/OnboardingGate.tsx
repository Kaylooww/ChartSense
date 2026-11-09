import { RiskNotice } from './RiskNotice';

export function OnboardingGate({ onAccept }: { onAccept: () => void }) {
  return (
    <section
      aria-labelledby="onboarding-title"
      className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
    >
      <h2 id="onboarding-title" className="text-sm font-semibold">
        Before you start
      </h2>
      <RiskNotice />
      <button
        type="button"
        onClick={onAccept}
        className="w-full rounded-md bg-sky-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400"
      >
        I understand. Continue
      </button>
    </section>
  );
}
