/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        border: 'var(--border)',
        gold: 'var(--gold)',
        goldSoft: 'var(--gold-soft)',
        red: 'var(--red)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        wuxing: {
          mu: 'var(--wuxing-mu)',
          huo: 'var(--wuxing-huo)',
          tu: 'var(--wuxing-tu)',
          jin: 'var(--wuxing-jin)',
          shui: 'var(--wuxing-shui)',
        },
      },
    },
  },
  plugins: [],
}
