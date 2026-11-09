# Sources

These are references used while writing `PROJECT_CONTEXT.md`. They are **not** evidence that ChartSense
has been validated as a trading tool. Re-check platform terms and Chrome API behavior before relying on
them; both change. Review date of the source list: 2026-11-09.

| ID | Source | Used for |
|---|---|---|
| S1 | `reference/trading_buy_sell_guide.pdf`, *Trading: When to Buy or Sell*, pp. 1-3 (user-supplied) | Trend confirmation, breakout/pullback entries, predefined entry/exit, risk discipline, trade journal. It is oriented toward conventional trading and gives no validated fixed-expiry strategy or screenshot-extraction method. |
| S2 | Chrome for Developers, Side Panel API. https://developer.chrome.com/docs/extensions/reference/api/sidePanel | Persistent side panel UI beside the active tab. |
| S3 | Chrome for Developers, Tabs API (`captureVisibleTab`, `activeTab`). https://developer.chrome.com/docs/extensions/reference/api/tabs | Visible-tab capture, documented limit of two captures per second, temporary `activeTab` access. |
| S4 | Chrome for Developers, Screen capture. https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture | Capture options for extensions. |
| S5 | ExpertOption, Terms & Conditions (section 6.2 among others). https://en.expertoption.com/company/policy/terms/ | Restrictions on bots and abusive software; reason to avoid any automation. |
| S6 | ExpertOption, FAQ. https://en.expertoption.com/trade/faq/ | Virtual demo funds. |
| S7 | U.S. CFTC/SEC, *Investor Alert: Binary Options and Fraud*. https://www.cftc.gov/LearnAndProtect/AdvisoriesAndArticles/fraudadv_binaryoptions.html | All-or-nothing payoff character and risks; wording of the risk notice. |
| S8 | Chromium, Extensions Security FAQ. https://chromium.googlesource.com/chromium/src/+/main/extensions/docs/security_faq.md | Manifest V3 and remote-code rules. |

## Provenance of design decisions

React, Tailwind, Vite, the 5-second capture default, EMA20/EMA50, RSI14/MACD, the baseline strategy
rules, schemas, architecture, phase plan and evaluation design are **proposed engineering decisions**,
not claims made by any source above and not validated profitable settings.

## Observed during Phase 1 (checked in a real Chrome 153 window, 2026-11-09)

- `captureVisibleTab` rejects host-specific permissions: it needs `activeTab` or `<all_urls>`. ChartSense ships with `activeTab` only, so capturing works only after a toolbar-icon click on the chart tab.
- Without that user gesture Chrome returns "Either the '<all_urls>' or 'activeTab' permission is required." ChartSense maps this to a visible "Capture permission expired" state.
