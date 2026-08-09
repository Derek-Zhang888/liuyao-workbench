/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        panel2: 'var(--panel2)',
        panelHalf: 'var(--panel-half)',
        border: 'var(--border)',
        borderDim: 'var(--border-dim)',
        borderDim70: 'var(--border-dim70)',
        gold: 'rgb(var(--gold-rgb) / <alpha-value>)',
        goldSoft: 'var(--gold-soft)',
        goldSoft30: 'var(--gold-soft30)',
        toolbarBg: 'var(--toolbar-bg)',
        red: 'rgb(var(--red-rgb) / <alpha-value>)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        primary: 'rgb(var(--primary-rgb) / <alpha-value>)',
        primarySoft: 'var(--primary-soft)',
        accent: 'var(--accent)',
        accentSoft: 'var(--accent-soft)',
        ok: 'var(--ok)',
        bad: 'var(--bad)',
        wuxing: {
          mu: 'var(--wuxing-mu)',
          huo: 'var(--wuxing-huo)',
          tu: 'var(--wuxing-tu)',
          jin: 'var(--wuxing-jin)',
          shui: 'var(--wuxing-shui)',
        },
      },
      fontFamily: {
        serif: ['var(--serif)'],
        sans: ['var(--sans)'],
      },
      boxShadow: {
        card1: 'var(--shadow-1)',
        card2: 'var(--shadow-2)',
      },
    },
  },
  plugins: [],
}
