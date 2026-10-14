import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Vitest configuration.
 *
 * Runs the test suite against `happy-dom` (a faster, smaller
 * DOM implementation than `jsdom`), auto-injects Vitest's
 * `describe`/`it`/`expect`/`vi` globals, and applies the
 * shared setup files that register `jest-dom` matchers,
 * install console filters, and install browser-API stubs the
 * environment does not provide.
 *
 * ## File extension
 *
 * This file uses `.mts` rather than `.ts`. Vite is moving to
 * a native ESM config loader, and under that loader a `.ts`
 * file in a package without `"type": "module"` is parsed as
 * CommonJS — which rejects the `import` statements below. The
 * `.mts` extension is unambiguous: it is ESM by definition,
 * on every loader, in every future Vite version.
 *
 * Do not rename this file back to `.ts` without also adding
 * `"type": "module"` to `package.json`, which would affect
 * every other `.ts` file in the project.
 *
 * ## tsconfig paths
 *
 * Path alias resolution (`@/` → `./src/`) is handled by
 * Vite's native `resolve.tsconfigPaths` option. The
 * `vite-tsconfig-paths` plugin this project used to depend on
 * is redundant on current Vite and has been removed.
 *
 * ## `setupFiles` ordering
 *
 * Two setup files run per test file, in the order listed:
 *
 *   1. `./src/lib/vitest-console-filter.ts` — installs
 *      `console.warn` / `console.error` filters. **Must run
 *      first.** Any module that captures a reference to
 *      `console.error` at its own module-evaluation time
 *      (React's dev runtime, Framer Motion's dev channel)
 *      must see the wrapper, not the raw original. ES
 *      module imports are hoisted ahead of any executable
 *      statement in a file, so the filter cannot live in
 *      `vitest.setup.ts` — the imports at the top of that
 *      file would evaluate before the wrapper installs.
 *
 *   2. `./vitest.setup.ts` — registers `jest-dom` matchers,
 *      installs browser-API stubs, wires the Framer Motion
 *      abort suppressor, and wraps `process.emitWarning`.
 *      Runs after the filter so that anything it imports
 *      sees the filtered console.
 *
 * Do not reorder these. Do not merge them.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    /*
     * Native tsconfig-paths resolution. Vite reads the
     * `compilerOptions.paths` field from `tsconfig.json` and
     * applies the aliases to every import.
     */
    tsconfigPaths: true,
  },

  test: {
    /*
     * `happy-dom` supports the subset of the DOM API this
     * codebase touches: `document`, `window`, `localStorage`,
     * `matchMedia`, `requestAnimationFrame`, and CSS custom
     * properties. If a future test needs `<canvas>`, swap this
     * to `"jsdom"`.
     */
    environment: "happy-dom",

    /*
     * Exposes Vitest's API as globals. The `types` entry in
     * `tsconfig.json` mirrors this so the ambient `describe`,
     * `it`, `expect`, and `vi` are typed without imports.
     */
    globals: true,

    /*
     * Runs once before the first test file, in this order.
     * See the module header for why the console filter must
     * come first.
     */
    setupFiles: [
      "./src/lib/vitest-console-filter.ts",
      "./vitest.setup.ts",
    ],

    /*
     * ## Why `@react-three/fiber` and `@react-three/drei` are
     * ## inlined
     *
     * The two R3F packages ship as ESM with heavy internal
     * state, and their modules resolve their exports on first
     * import. Without inlining, `vi.mock("@react-three/fiber",
     * ...)` in a test file runs *after* the module has been
     * required by the framework, so the mock sees an empty
     * module and does not intercept the exports the tests want
     * to override.
     *
     * Inlining forces both packages through the Vitest
     * transform pipeline, so:
     *
     *   - `vi.mock("@react-three/fiber", () => ({ useFrame,
     *     useThree, useLoader }))` correctly replaces the
     *     hooks. This is what the `SolarSampler` and
     *     `GlobeAtmosphereSampler` component tests rely on.
     *
     *   - The module itself is still loaded (as an ESM
     *     namespace) so `@react-three/drei`'s own imports of
     *     it resolve without error.
     *
     * ## What inlining does NOT do
     *
     * It does **not** make R3F *intrinsics* (`<mesh>`,
     * `<group>`, `<directionalLight>`, `<shaderMaterial>`,
     * `<points>`, etc.) mockable. Those are not module
     * exports — they are strings that R3F's reconciler
     * resolves at render time via an internal registry.
     * React's DOM renderer, when it sees `<mesh>`, has no way
     * to look up a component named `mesh`; it just creates an
     * unknown DOM element with that tag.
     *
     * Tests that need to assert on the THREE object graph
     * behind those tags — rather than on the DOM the
     * intrinsic would nominally render to — should use
     * `@react-three/test-renderer` instead. It provides a
     * real R3F reconciler, so every intrinsic becomes the
     * THREE object it would be inside a live `<Canvas>`.
     *
     * See `GlobeMarker.component.test.tsx` and
     * `RealisticEarthSphere.integration.test.tsx` for the
     * pattern.
     */
    server: {
      deps: {
        inline: ["@react-three/fiber", "@react-three/drei"],
      },
    },

    /*
     * Excludes Next.js build artifacts. Vitest picks up any
     * `*.test.*` file by default; without this it would try to
     * run tests inside compiled output.
     */
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
    ],
  },
});