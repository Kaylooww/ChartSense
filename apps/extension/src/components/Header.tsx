import { ShieldAlert } from 'lucide-react';

export function Header() {
  return (
    <header className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <img src="/icons/icon-48.png" alt="" className="size-7 rounded" />
        <h1 className="text-base font-semibold tracking-tight">ChartSense</h1>
      </div>
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300"
        title="ChartSense never places real orders."
      >
        <ShieldAlert className="size-3.5" aria-hidden="true" />
        Simulation · No real orders
      </span>
    </header>
  );
}
