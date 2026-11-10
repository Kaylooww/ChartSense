const ITEMS = [
  'ChartSense is analysis-only. It never places orders, never clicks on a trading site, and never logs in for you.',
  'Nothing here is financial advice. No rule, indicator or model can guarantee a profitable trade, and fixed-expiry products can lose the whole stake.',
  'It captures only the one tab you authorize by clicking the ChartSense toolbar icon, and only while you monitor (Start monitoring until Pause or Stop) or press Capture once.',
  'Signals are read from screenshots by a local vision model and can be wrong. They contain no exact prices or indicator values.',
  'Screenshots stay in this panel’s memory and are discarded when you press Stop or the tab changes. Only the cropped chart is sent, to Ollama on this computer. Nothing is uploaded or saved to disk.',
  'Keep balances, usernames and messages out of your selection. Select just the chart.',
  'You are responsible for following the terms of any website you use. Start with the local mock chart or a demo account.',
];

export function RiskNotice() {
  return (
    <ul className="space-y-2 text-sm leading-relaxed text-zinc-300">
      {ITEMS.map((text) => (
        <li key={text} className="flex gap-2">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-zinc-500" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
