/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        // Hero only. `display` is the headline/body pair, `serif` is reserved
        // for the italic accent inside headings — never for body copy.
        display: ['Poppins', 'Inter', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
      },

      // ── Type scale ───────────────────────────────────────────────────────
      // Nine steps, named by role rather than by size, so a component asks for
      // "a caption" instead of "12.5px". Replaces the 21 one-off `text-[Npx]`
      // values that used to be scattered across the pages: the difference
      // between 12.5 and 13 was invisible to readers and expensive to keep.
      //
      // 11px is the floor and only carries labels (map legend, axis ticks,
      // uppercase eyebrows); body copy starts at 13px.
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.45' }],   // labels, axis ticks, legends
        xs: ['12px', { lineHeight: '1.5' }],       // hints, captions
        sm: ['13px', { lineHeight: '1.55' }],      // dense body, table cells
        base: ['14px', { lineHeight: '1.6' }],     // body copy
        md: ['15px', { lineHeight: '1.5' }],       // panel titles, lead-in
        lg: ['18px', { lineHeight: '1.35' }],      // sub-headings
        xl: ['22px', { lineHeight: '1.25' }],      // secondary numbers
        '2xl': ['26px', { lineHeight: '1.12' }],   // KPI numbers
        '3xl': ['34px', { lineHeight: '1.08' }],   // page numbers
      },

      // ── Radius scale ─────────────────────────────────────────────────────
      // Four steps instead of thirteen. `xl` is the inner element, `2xl` the
      // panel, `3xl` the hero surface — so nesting reads as a hierarchy.
      borderRadius: {
        sm: '4px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },

      // ── Line tokens ──────────────────────────────────────────────────────
      // Three border weights replace six ad-hoc white opacities. Focus rings
      // are not in here: they come from the global :focus-visible rule.
      borderColor: {
        line: 'var(--line)',
        'line-soft': 'var(--line-soft)',
        'line-strong': 'var(--line-strong)',
      },
      backgroundColor: {
        fill: 'var(--fill)',
        'fill-hover': 'var(--fill-hover)',
        'fill-active': 'var(--fill-active)',
        // Hairlines and icon-badge backgrounds draw from the line tokens, so a
        // 1px rule and the border beside it can never drift apart.
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
      },
      colors: {
        good: 'var(--good)',
        mid: 'var(--mid)',
        bad: 'var(--bad)',
        muted: 'var(--muted)',
      },
    },
  },
  plugins: [],
}
