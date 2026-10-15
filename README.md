<div align="center">

# 🌍 World Clock

**An interactive 3D globe for exploring local time anywhere on Earth.**

Rotate the planet, search 180+ cities, and time-travel to the next solstice, an equinox, or tomorrow's sunrise in Tokyo. Every clock, every sky, and every shadow on the globe agrees on the same instant.

[![CI](https://github.com/shaurya-10000/world-clock/actions/workflows/ci.yml/badge.svg)](https://github.com/shaurya-10000/world-clock/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[**Live demo**](https://world-clock-gray.vercel.app) · [**Watch the demo**](<DEMO_VIDEO_URL>) · [**Test results**](#test-results) · [**Lighthouse**](#lighthouse) · [**Report a bug**](https://github.com/shaurya-10000/world-clock/issues)

![World Clock hero](docs/images/hero.png)

</div>

---

## Contents

- [Highlights](#highlights)
- [Quick start](#quick-start)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Testing](#testing)
  - [Test results](#test-results)
- [Deployment](#deployment)
- [Accessibility](#accessibility)
- [Performance](#performance)
- [Lighthouse](#lighthouse)
- [Credits](#credits)
- [License](#license)

## Highlights

- **Real 3D Earth** with a live sun terminator, night-side city lights, and drifting clouds.
- **Time travel.** Jump to any solstice, equinox, sunrise, sunset, or solar noon, and the whole app follows.
- **180+ cities** with WGS84 coordinates and IANA time zones, plus favorites that persist across reloads.
- **Accessible by design:** full keyboard support, screen-reader labels, and reduced-motion support throughout.
- **Fast:** one shared ticker, cached `Intl` formatters, and zero allocations in the frame loop.
- **Well tested:** 2,804 tests across 130 files, with 88.79% statement coverage. See [Test results](#test-results).
- **Audited:** Lighthouse scores of 100 for Best Practices and SEO on both desktop and mobile. See [Lighthouse](#lighthouse).

### At a glance

| Check | Result |
| --- | --- |
| **Tests** | 2,804 passing across 130 files ([details](#test-results)) |
| **Coverage** | 88.79% statements, 80.26% branches, 90.14% functions, 89.79% lines |
| **Lighthouse, desktop** | Performance 90, Accessibility 96, Best Practices 100, SEO 100 ([details](#lighthouse)) |
| **Lighthouse, mobile** | Performance 71, Accessibility 100, Best Practices 100, SEO 100 |

<sub>Measured on 15 October 2026. Lighthouse figures are single runs against the production deployment.</sub>

<table>
  <tr>
    <td align="center" width="50%"><img src="docs/images/globe.png" alt="Interactive 3D globe" /><br /><sub><b>Interactive 3D globe</b></sub></td>
    <td align="center" width="50%"><img src="docs/images/clock.png" alt="Analog and digital clock faces" /><br /><sub><b>Analog and digital clocks</b></sub></td>
  </tr>
  <tr>
    <td align="center" width="50%"><img src="docs/images/cities.png" alt="Cities drawer with live times" /><br /><sub><b>Cities drawer with live times</b></sub></td>
    <td align="center" width="50%"><img src="docs/images/events.png" alt="Astronomical event picker" /><br /><sub><b>Astronomical event picker</b></sub></td>
  </tr>
</table>

## Quick start

**Prerequisites:** Node.js **20.9.0+** (required by Next.js 16), npm, yarn, pnpm, or bun, and a current evergreen browser (Chrome, Edge, Firefox, or Safari) with **WebGL 2** enabled.

```bash
git clone https://github.com/shaurya-10000/world-clock.git
cd world-clock
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment variables are needed to run locally.

To run a production build:

```bash
npm run build
npm run start
```

## Features

### The globe

- Rendered with `three-globe` and `@react-three/fiber`.
- **Two visual modes**, switchable at any time: a stylized minimal shader sphere, and a photorealistic Earth with an atmospheric rim, cloud shell, and bump-mapped terrain.
- Drag to spin, release to glide. After a few idle seconds, the globe resumes a slow auto-rotation.
- Favorited cities float to the top of the drawer and get their own marker color on the globe.

### The clocks

- **Analog and digital faces**, set against the local sky of the selected city: dawn, day, dusk, or night.
- **12H / 24H** formats with tabular-aligned digits.
- **Automatic local detection:** your browser's time zone is resolved to the nearest catalogued city on first load.
- Per-second updates from one shared ticker.

### Astronomical time travel

- **Solstices and equinoxes**, computed from Meeus's *Astronomical Algorithms*.
- **Sunrise, sunset, and solar noon** for the selected city, accurate to within a minute below 66° latitude. Polar day and night are reported explicitly instead of returning a wrong time.
- **App-wide consistency:** every clock, city row, sky classification, and sun direction reflects the same instant.
- A **"Back to now"** banner returns to live time in one click.

### Resilience

Corrupt storage, blocked `localStorage`, and quota errors degrade silently to in-memory state. If WebGL is unavailable, the globe is replaced by a fallback message and the clocks, search, and cities drawer keep working normally.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack, React Server Components) |
| UI | [React 19](https://react.dev) |
| Language | [TypeScript](https://www.typescriptlang.org) (strict) |
| 3D | [three.js](https://threejs.org), [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber), [@react-three/drei](https://github.com/pmndrs/drei), [three-globe](https://github.com/vasturiano/three-globe) |
| Animation | [Framer Motion](https://www.framer.com/motion/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) (PostCSS plugin, no config file) |
| Icons | [lucide-react](https://lucide.dev) |
| Geo data | [world-atlas](https://github.com/topojson/world-atlas), [topojson-client](https://github.com/topojson/topojson-client) |
| Testing | [Vitest](https://vitest.dev), [Testing Library](https://testing-library.com), [happy-dom](https://github.com/capricorn86/happy-dom) |
| Linting | [ESLint 9](https://eslint.org) with `eslint-config-next` |

## Configuration

Both environment variables are **optional**. Put them in `.env.local`.

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical origin used for `metadataBase` in `app/layout.tsx`. **Set this in production** so Open Graph and Twitter card URLs resolve to absolute paths. |
| `NEXT_PUBLIC_LOG_LEVEL` | `debug` in dev, `error` in prod | Minimum client log level: `debug`, `info`, `warn`, `error`, or `silent`. |

```bash
# .env.local
NEXT_PUBLIC_SITE_URL=https://your-domain.example
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript in `--noEmit` mode |
| `npm test` | Vitest in watch mode |
| `npm run test:run` | Vitest once (CI-friendly) |
| `npm run test:ui` | Vitest UI |
| `npm run test:coverage` | Tests with coverage |

**Pre-flight before any deploy or PR:**

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
```

## Project structure

```
.
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx            # Root layout, fonts, metadata, viewport
│   │   ├── page.tsx              # Home: desktop and mobile layouts
│   │   ├── error.tsx             # Route-level error boundary
│   │   ├── loading.tsx           # Route-level loading fallback
│   │   ├── globals.css           # Tailwind import, design tokens, a11y overrides
│   │   ├── manifest.ts           # Web app manifest
│   │   ├── icon.tsx              # Favicon (build-time PNG)
│   │   ├── apple-icon.tsx        # Apple touch icon (build-time PNG)
│   │   └── opengraph-image.tsx   # Social card (build-time PNG)
│   │
│   ├── components/
│   │   ├── Globe.tsx             # Globe chrome, tier selector, search
│   │   ├── GlobeCanvas.tsx       # R3F <Canvas> and children
│   │   ├── GlobeAtmosphere.tsx   # Background crossfade behind the canvas
│   │   ├── WorldClockSection.tsx # Analog/digital clocks + sky
│   │   ├── CitiesSection.tsx     # Cities drawer, favorites, search
│   │   ├── Header.tsx            # Site header, nav, mobile view toggle
│   │   ├── DayNightFavicon.tsx   # Runtime favicon swap (sun ↔ moon)
│   │   ├── clock/                # AnalogClock, DigitalClock, SkyAtmosphere, ControlBar
│   │   ├── globe/                # Globe sub-components and contexts
│   │   └── search/               # Searchable input and result rows
│   │
│   └── lib/                      # Pure modules: no React, no JSX
│       ├── atmosphere.ts         # Canonical dawn/day/dusk/night classification
│       ├── locations.ts          # City catalog and lookups
│       ├── search.ts             # Ranking shared by both search surfaces
│       ├── solar.ts              # Subsolar point and solar elevation (Meeus)
│       ├── solar-events.ts       # Solstices, equinoxes, sunrise, sunset, noon
│       ├── starfield.ts          # Deterministic, index-seeded star positions
│       ├── time.ts               # Cached Intl formatters, local-time snapshots
│       ├── time-override.ts      # App-wide "which instant are we showing?" seam
│       ├── useNow.ts             # Shared ticker
│       ├── useFavorites.ts       # Favorites persistence with cross-tab sync
│       ├── useVisualMode.ts      # Minimal/realistic globe preference
│       ├── quaternion.ts         # Dependency-free quaternion rotation
│       ├── globe-geometry.ts     # Lat/lng → world-space position and direction
│       ├── events.ts             # Small typed event bus
│       ├── logger.ts             # Leveled console wrapper
│       └── math.ts               # clamp, lerp, easeInOut, normalizeDegrees
│
├── public/textures/earth/        # Albedo, bump, water, night, clouds
├── vitest.config.mts
├── vitest.setup.ts
├── eslint.config.mjs
├── postcss.config.mjs
├── next.config.ts                # Intentionally empty; see file header
└── tsconfig.json                 # Strict, with the `@/` alias
```

Test files live next to the module they test. File-header docstrings explain *why* a module exists, so read the header of any file before changing it.

## Architecture

### One React tree, two reconcilers

React Three Fiber runs its own reconciler inside `<Canvas>`, in a separate React root. Context providers above `<Canvas>` are **not** visible inside it, and vice versa. Three module-level refs bridge the gap:

| Ref | Written by | Read by |
| --- | --- | --- |
| `solarContext` | `SolarSampler` (in canvas) | `Globe.tsx`, `Terminator` |
| `cameraDistanceContext` | `CameraDistanceSampler` (in canvas) | `Globe.tsx`, `CityArrivalCard` |
| `globeAtmosphereContext` | `GlobeAtmosphereSampler` (in canvas) | `Globe.tsx` poller |

Contract: each ref has a single writer, any module may read it, and it is never reactive. Consumers that need updates poll from `useFrame` or `useNow`.

### One ticker for the whole app

`useNow(intervalMs)` runs one shared `setInterval` per distinct interval, regardless of subscriber count. The scheduler pauses while the document is hidden, which is the biggest battery win for a page that would otherwise re-render clocks every second in the background.

### App-wide time override

Time travel needs every clock, atmosphere classification, and sun direction to agree on one instant. `lib/time-override.ts` is a module-level ref with a minimal pub/sub, and every `useNow` consumer respects it automatically. There is no prop drilling, no context provider, and no second code path.

### Cached `Intl` formatters

Constructing `Intl.DateTimeFormat` is expensive. Every formatter in `lib/time.ts` is cached by `(canonicalTimeZone, preset)` for the life of the page. Time zone IDs are canonicalized first, so `Asia/Calcutta` and `Asia/Kolkata` share one entry.

### Deterministic star fields

`lib/starfield.ts` derives each star's position from its index rather than `Math.random()`. The field is identical on the server, the client, and across reloads, so there are no hydration mismatches and no flicker.

## Testing

```bash
npm test                 # watch
npm run test:run         # once
npm run test:ui          # interactive UI
npm run test:coverage    # coverage report
```

Naming conventions are deliberate:

| Pattern | Purpose | Example |
| --- | --- | --- |
| `*.test.ts` | Pure functions, no DOM | `lib/math.test.ts` |
| `*.component.test.tsx` | One component in isolation, children mocked | `components/Globe.component.test.tsx` |
| `*.integration.test.tsx` | Several components composed, real seams | `components/Globe.integration.test.tsx` |

### Setup order matters

Two setup files run per suite, **in this order**:

1. `src/lib/vitest-console-filter.ts` installs `console.warn` / `console.error` filters. It must run first so any dependency that captures `console.error` at module-evaluation time sees the wrapper.
2. `vitest.setup.ts` registers `jest-dom` matchers, installs browser-API stubs, and wires the Framer Motion abort suppressor.

The header of `vitest.config.mts` has the full reasoning.

### Testing R3F

- **Module-level mocking for hooks.** `vi.mock("@react-three/fiber", ...)` replaces `useFrame` and `useThree` with stubs that push callbacks into a module-scope array the test can fire manually. See `SolarSampler.component.test.tsx`.
- **`@react-three/test-renderer` for intrinsics.** `<mesh>`, `<group>`, and friends are strings, not module exports, so they can't be mocked. The test renderer provides a real reconciler so each intrinsic becomes a real THREE object. See `GlobeMarker.component.test.tsx`.

### Test results

Latest full run, Vitest 5.0.0, 15 October 2026:

| Metric | Result |
| --- | --- |
| Test files | **130 passed** (130) |
| Tests | **2,804 passed** (2,804) |
| Duration | 62 to 68 s for the full suite |

<table>
  <tr>
    <td align="center" width="50%"><img src="docs/images/vitest.png" alt="Vitest run: 130 test files and 2,804 tests passing" /><br /><sub><b>npm run test:run</b></sub></td>
    <td align="center" width="50%"><img src="docs/images/coverage.png" alt="Coverage report summary by folder: 88.79% statements, 80.26% branches, 90.14% functions, 89.79% lines" /><br /><sub><b>npm run test:coverage</b></sub></td>
  </tr>
</table>

#### Coverage (v8)

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| **All files** | **88.79%** | **80.26%** | **90.14%** | **89.79%** |
| `lib/` | 93.35% | 89.26% | 94.11% | 93.34% |
| `components/clock/` | 100% | 96.12% | 100% | 100% |
| `components/globe/` | 88.89% | 78.63% | 93.17% | 90.04% |
| `components/search/` | 83.83% | 64.58% | 72.97% | 85.35% |
| `app/` | 96.84% | 100% | 92.85% | 98.85% |
| `components/` (top level) | 78.89% | 69.53% | 82.30% | 80.83% |

In absolute terms that is 2,630 of 2,962 statements, 1,228 of 1,530 branches, 549 of 609 functions, and 2,498 of 2,782 lines. `npm run test:coverage` also writes an HTML report to `coverage/index.html` with a per-file breakdown.

The pure solar, time, search, and atmosphere modules in `lib/` sit at or near 100%, because they are where a wrong answer is silent. The lowest-covered files are `Header.tsx` (57%), `Globe.tsx` (64%), and `GlobeScene.tsx` (66%). `Globe.tsx` and `GlobeScene.tsx` sit on the WebGL boundary, where a headless DOM cannot create a real GPU context.

The two `stderr` lines about a non-unit quaternion in the output are expected. They come from tests that deliberately pass a zero quaternion to confirm the math never throws.

## Deployment

### Vercel (recommended)

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Leave the **Root Directory** at its default — the app is at the repository root.
4. Add environment variables (Vercel does **not** set these for you):
   - `NEXT_PUBLIC_SITE_URL`: your production origin, e.g. `https://world-clock.example`
   - `NEXT_PUBLIC_LOG_LEVEL`: optional, e.g. `error`
5. Deploy. Vercel detects Next.js and runs `next build`.

### Self-hosting

The output is a standard Next.js bundle that runs on any Node 20.9+ host:

```bash
npm run build
npm run start
```

Behind a reverse proxy, preserve the `Host` and `X-Forwarded-Proto` headers. Next.js uses them to build absolute URLs for Open Graph tags.

### Post-deploy checklist

- [ ] The globe renders at the deployed URL.
- [ ] `/manifest.webmanifest`, `/icon`, `/apple-icon`, and `/opengraph-image` return 200.
- [ ] Lighthouse scores for mobile and desktop match or beat the [Lighthouse](#lighthouse) table.
- [ ] The globe rotates on drag on a real phone.
- [ ] The Open Graph preview looks right when shared in Slack or Discord.

## Accessibility

Accessibility is a first-class requirement, not an end-of-project audit.

- **Every interactive element has an accessible name.** Icon-only buttons use `aria-label`, and decorative icons are `aria-hidden`.
- **Visible focus rings** on every control, including under `forced-colors: active` (Windows High Contrast).
- **Event picker implements the listbox pattern.** DOM focus stays on the trigger and `aria-activedescendant` tracks the highlighted option. Arrow keys, Home, End, Enter, and Escape all work. The display mode toggle is a proper radiogroup.
- **Analog clock** is a `role="img"` named `"Analog clock showing {time}"`, updated as time changes. Its SVG internals are `aria-hidden`.
- **Digital clock** is a `role="timer"` with `aria-live="off"`. Any other live-region value would make screen readers announce the time every second.
- **Cities drawer** traps focus, marks `<main>` as `inert` while open, and restores focus to the opener on close.
- **`prefers-reduced-motion`** collapses every animation to 0.01ms through a global override in `globals.css`.
- **Dark-only by design.** The palette is built around a night-sky aesthetic, and a light theme would need a full design pass.

## Performance

Target: 60 fps on mid-tier mobile hardware.

- **One ticker, one interval.** N subscribers produce one `setInterval`, not N.
- **Cached `Intl.DateTimeFormat` instances**, reused for the page lifetime.
- **Solar state sampled at 4 Hz.** Visible-hemisphere atmosphere is recomputed on a 250 ms throttle, plus an immediate update when the camera moves.
- **DPR clamped to 1.75.** That is roughly a third of the fill-rate cost of a DPR-3 canvas, with no visible difference at marker and polygon scale.
- **No allocations in the frame loop.** Scratch quaternions and vectors are module-level singletons.
- **One `ThreeGlobe` instance per page**, with GPU resources disposed on unmount to prevent leaks across route changes.

## Lighthouse

Audited on the production deployment at [world-clock-gray.vercel.app](https://world-clock-gray.vercel.app) with Chrome DevTools Lighthouse, 15 October 2026, once per form factor. Each figure is a single run.

| Category | Desktop | Mobile |
| --- | :---: | :---: |
| Performance | 90 | 71 |
| Accessibility | 96 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |
| Agentic Browsing | 2/3 | 2/2 |

Agentic Browsing is one of Lighthouse's newer categories. It reports passed audits out of the total checked, not a 0 to 100 score.

<table>
  <tr>
    <td align="center" width="50%"><img src="docs/images/lighthouse-desktop.png" alt="Lighthouse scores on desktop, including Agentic Browsing" /><br /><sub><b>Desktop</b></sub></td>
    <td align="center" width="50%"><img src="docs/images/lighthouse-mobile.png" alt="Lighthouse scores on mobile, including Agentic Browsing" /><br /><sub><b>Mobile</b></sub></td>
  </tr>
</table>

**Reading the Performance score.** The app is a full-screen WebGL scene. three.js, the Earth textures, and shader compilation all land on the first paint of the globe, so Performance is the category most affected by network speed and GPU. Lighthouse's mobile profile throttles both the CPU and the network, which is why mobile Performance (71) is the lowest score and desktop (90) is much higher.

**To reproduce:**

1. Open the deployed site in an Incognito window with extensions disabled, since extensions skew the score.
2. Open DevTools, go to the **Lighthouse** panel, and select all categories.
3. Run it once with **Desktop** selected and once with **Mobile**.

Scores vary from run to run. Treat them as a range, not an exact figure.

## Credits

- Earth textures: NASA Visible Earth / Blue Marble (public domain)
- Country boundaries: [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, public domain)
- Solar algorithms: Jean Meeus, *Astronomical Algorithms* (Willmann-Bell)
- 3D globe layers: [three-globe](https://github.com/vasturiano/three-globe) by Vasco Asturiano

## License

Released under the MIT license. See [LICENSE](./LICENSE).

---

<div align="center">

Built by [shaurya-10000](https://github.com/shaurya-10000) · [Report a bug](https://github.com/shaurya-10000/world-clock/issues)

</div>