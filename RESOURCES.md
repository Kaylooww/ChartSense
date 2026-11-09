# Project Resources

> Curated references for building React, TypeScript, and Tailwind CSS applications, including projects with interactive 3D experiences. **Use selectively:** this catalog is not a requirement to install every library.

**Last reviewed:** 2026-11-09. Pricing, free-tier limits, and documentation may change. Verify the linked official sites before adopting a resource.

## How AI Coding Agents Should Use This File

1. Read the project instructions, existing dependencies, components, and design system **before** selecting a resource.
2. Check the relevant resource links below **when the current task calls for them**. If browsing or documentation access is unavailable, say so and avoid inventing API details.
3. Prefer existing code and dependencies over adding new packages. Treat each linked site as a **reference**, not as an automatic install instruction.
4. Reuse the project's established typography, spacing, colors, radii, component conventions, and accessibility practices.
5. Review compatibility, maintenance, licenses, attribution requirements, costs, and security of third-party code and assets.
6. Ask before buying a subscription, spending paid credits, or using a resource explicitly marked **approval required**.
7. Keep components responsive, keyboard accessible where relevant, and compatible with reduced-motion preferences.

## UI & Front-End Component Libraries

### Primary: Application Components

- [shadcn/ui](https://ui.shadcn.com) — **Default base component collection** for buttons, inputs, dialogs, menus, cards, forms, tables, and navigation. Keep shared UI primitives in `src/components/ui/` (or the project's configured equivalent). Preserve an existing project's underlying primitive choice and configuration.

### Supplementary: Creative & Specialized Components

- [React Bits](https://reactbits.dev) — **Preferred source for animated React components**, such as typography effects, dynamic backgrounds, reveals, and micro-interactions. Keep effects separate from fundamental application UI.
- [21st.dev](https://21st.dev) — **Preferred discovery source for distinctive React components**, including hero sections, advanced layouts, cursor effects, and creative interactions. Adapt imported components to the project's theme and accessibility requirements; check usage limits.
- [Uiverse](https://uiverse.io) — **Optional source for isolated CSS components and effects**, including buttons, loaders, switches, and decorative interactions. Audit community-contributed code for accessibility, responsiveness, and style conflicts.
- [Ant Design](https://ant.design) — **Alternative primary design system** for enterprise applications with dense tables, complex forms, and administrative workflows. Choose it **instead of** shadcn/ui when justified; avoid adopting both as competing foundational systems.

**Selection order:** Existing components → shadcn/ui → React Bits or 21st.dev for specific needs → Uiverse for isolated effects. Ant Design is a project-level alternative.

## Animation & SVG

- [Motion](https://motion.dev) — **Default React animation library** for layout transitions, entrance/exit effects, gestures, and scroll-driven animation. Prefer CSS transitions for simple cases.
- [Anime.js](https://animejs.com) — **Specialized animation option** for elaborate timelines, SVG motion paths, and intricate DOM/SVG effects. Use when Motion or CSS cannot meet the requirement cleanly.

**Rule:** Do not add multiple animation engines for the same job. Honor `prefers-reduced-motion` and avoid continuous high-cost visual effects without a clear benefit.

## Charts & Data Visualization

- [shadcn/ui Charts](https://ui.shadcn.com/charts) — **Default dashboard chart styling and examples**, built on Recharts. Start here for ordinary bar, line, area, and pie charts.
- [Bklit](https://bklit.com) — **Specialized chart/UI reference** for polished interactive visualizations. Verify the available components, installation approach, costs, and dependencies before use.
- [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/) — **Optional financial time-series chart library** for candlesticks and other market-style chart displays. Check its license and attribution requirements; a charting library does not supply live market data or trading signals.

**Rule:** Prefer one charting approach per feature. Clearly label mock, delayed, and real-time data; never present sample data as live market information.

## 3D Graphics & Interactive Experiences

- [Three.js](https://threejs.org) — **Foundational JavaScript 3D graphics library** for scenes, cameras, lighting, materials, meshes, rendering, and model loading. Use directly when building a non-React experience or when low-level Three.js control is warranted. Consult the [official documentation](https://threejs.org/docs/) and [examples](https://threejs.org/examples/) when implementing features.
- [React Three Fiber](https://r3f.docs.pmnd.rs/) — **Preferred way to build Three.js scenes in React projects**. It lets React manage the scene through components and hooks. Use it as the React renderer around Three.js, not as a second competing 3D engine.
- [Drei](https://drei.docs.pmnd.rs/) — **Optional helpers for React Three Fiber**, including commonly used scene controls and utilities. Add only when the helpers remove meaningful implementation work.

**3D implementation rules:**

1. Only add 3D when it improves the experience (e.g., an interactive portfolio, product viewer, or immersive environment). Do not use 3D for standard dashboard controls.
2. For React applications, prefer **React Three Fiber + Three.js**, with Drei only when helpful. For plain JavaScript projects, use **Three.js directly**.
3. Inspect model format, polygon count, texture size, loading behavior, and asset licensing. Prefer optimized glTF/GLB assets where appropriate.
4. Use lazy loading, clear loading/failure states, responsive sizing, and sensible performance fallbacks; dispose of unused resources where applicable.
5. Respect reduced motion, ensure essential actions remain usable without 3D interactions, and test mobile/low-power devices.
6. **Documentation is task-triggered:** AI agents should follow the linked official docs when implementing 3D, provided browsing is available. A link here alone does not guarantee that a tool can read the website.

## Cursor Effects & Interactive Vector Graphics

- [21st.dev](https://21st.dev) — **Preferred place to look for creative cursor interactions**. Use selectively on desktop and preserve precise standard cursors for charts, form fields, and other interaction-heavy areas. Provide touch fallbacks.
- [Rive](https://rive.app) — **Optional advanced tool** for interactive vector graphics, state-machine animations, and character interactions. **Approval required before integrating Rive.** Its free and paid capabilities differ; explain the proposed use and current costs/limitations before proceeding.

## Icons

- [Lucide](https://lucide.dev) — **Default icon library** for consistent SVG icons. Use consistent size and stroke weight; provide accessible names for icon-only controls.

## On-Brand AI Images & Visual Assets

- Start with user-provided logos, images, screenshots, brand guidelines, and licensed assets.
- For AI-generated visuals, follow the project's art direction, palette, aspect ratios, and intended placement. Use an available, authorized image-generation workflow; do not quietly purchase credits.
- Optimize images and document asset provenance, license/usage rights, and required attribution when relevant.
- Use meaningful alternative text for informative visuals and empty alternative text for purely decorative visuals.

## Motion Graphics & Video Prompt References

### Free Prompt Inspiration

- [Prompt Motion](https://prompt-motion.com) — **Reference for motion-prompt examples and creative direction**, including product demos, kinetic typography, and UI showcases. Prompt inspiration is not the same as access to a free video-generation service; verify capabilities and licensing.

## Suggested Component Organization

```text
src/
└── components/
    ├── ui/          # shadcn/ui foundational components
    ├── effects/     # React Bits and project-specific effects
    ├── charts/      # Reusable data visualizations
    ├── three/       # Three.js / React Three Fiber scenes and helpers
    ├── custom/      # Adapted 21st.dev and Uiverse components
    ├── layout/      # Navigation, sidebar, app shell, footer
    └── features/    # Domain-specific composed components
```

Adapt directories to the framework, routing conventions, and whether the project uses `src/`.

## Agent Implementation Checklist

- [ ] The resource addresses a real requirement and does not duplicate existing functionality.
- [ ] Official documentation was checked when access was available.
- [ ] The implementation uses the project's design tokens and conventions.
- [ ] Responsive, keyboard, mobile/touch, and reduced-motion behaviors are considered.
- [ ] Loading, empty, error, and fallback states are handled where appropriate.
- [ ] Third-party dependencies, security, licenses, and costs were reviewed.
- [ ] Any paid usage and **Rive** use were approved before integration.
- [ ] Relevant builds, type checks, and tests pass.

## Suggested AGENTS.md Reference

Add the following to your root `AGENTS.md` (or equivalent agent instructions) to make this catalog discoverable:

```md
## Resource Usage

Read `RESOURCES.md` before selecting new UI component libraries, animation
frameworks, charting libraries, 3D tools, or visual-asset resources.

Use the relevant links as references, consulting official documentation when
web access is available.

Do not install everything in the catalog; only add resources that the
current project actually needs.
```
