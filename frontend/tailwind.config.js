/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#040912',
          900: '#071120',
          850: '#0a1626',
          800: '#0e1c31',
          700: '#132441',
          600: '#1b3055',
        },
        charcoal: {
          950: '#0a0f17',
          900: '#0f172a',
          850: '#121c30',
          800: '#17233b',
        },
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 18px 50px -28px rgba(2, 8, 23, 0.9)',
        glow: '0 0 0 1px rgba(34, 211, 238, 0.25), 0 12px 40px -12px rgba(6, 182, 212, 0.45)',
        'glow-sm': '0 0 24px -6px rgba(34, 211, 238, 0.35)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)',
        'radial-glow':
          'radial-gradient(60% 60% at 50% 0%, rgba(8,145,178,0.28) 0%, rgba(4,9,18,0) 70%)',
        'hero-sheen':
          'linear-gradient(120deg, rgba(34,211,238,0.12) 0%, rgba(15,23,42,0) 45%, rgba(34,211,238,0.06) 100%)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        scanline: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(900%)' } },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(34,211,238,0.25)' },
          '70%': { boxShadow: '0 0 0 12px rgba(34,211,238,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(34,211,238,0)' },
        },
        floatSlow: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.4s linear infinite',
        scanline: 'scanline 3.2s linear infinite',
        fadeUp: 'fadeUp 0.45s ease-out both',
        pulseRing: 'pulseRing 2s ease-out infinite',
        floatSlow: 'floatSlow 7s ease-in-out infinite',
      },
      backgroundSize: { grid: '42px 42px' },
    },
  },
  plugins: [],
};
