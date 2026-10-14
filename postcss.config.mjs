/**
 * PostCSS configuration.
 *
 * Tailwind v4 runs entirely through its PostCSS plugin —
 * there is no `tailwind.config.js`, no `content` glob, and
 * no separate `autoprefixer` pass. The `@import "tailwindcss"`
 * directive in `app/globals.css` is what pulls everything in.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;