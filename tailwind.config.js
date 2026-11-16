/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mars: {
          50: '#fdf4f0',
          100: '#fbe6dd',
          200: '#f7cbb9',
          300: '#f1a588',
          400: '#e87650',
          500: '#df5329',
          600: '#c93c1c',
          700: '#a72e19',
          800: '#87281a',
          900: '#6e2419',
          950: '#3b0f0a',
        },
        tambo: {
          gold: '#f59e0b',
          cyan: '#06b6d4',
          emerald: '#10b981',
          crimson: '#ef4444',
          slate: '#0f172a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
