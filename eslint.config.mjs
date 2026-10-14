import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * ESLint flat config.
 *
 * Composes Next.js's two official presets — Core Web Vitals
 * (runtime performance and a11y rules) and TypeScript (type-
 * aware lint rules) — and layers the project's overrides and
 * ignore globs on top.
 *
 * `globalIgnores` is the flat-config-native way to express
 * ignores; it is preferred over the legacy `ignorePatterns`
 * field because it composes correctly when configs are
 * merged. The globs mirror Next.js's own defaults so that
 * generated output is never linted.
 *
 * ## Overrides
 *
 * - `react-hooks/set-state-in-effect` is reported as a warning
 *   rather than an error. The rule flags every synchronous
 *   `setState` inside an effect. This codebase uses that
 *   pattern deliberately in a few places: reading the browser
 *   (`matchMedia`, `localStorage`, the local time zone) after
 *   hydration so server and client markup match, and resetting
 *   transient UI state when a panel closes. Those cases are
 *   documented where they occur. Keeping the rule as a warning
 *   leaves every occurrence visible without blocking the lint
 *   step.
 *
 * - `react/no-children-prop` is turned off for test files only.
 *   Tests build elements with `React.createElement` and pass
 *   `children` as a prop on purpose.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "react/no-children-prop": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
