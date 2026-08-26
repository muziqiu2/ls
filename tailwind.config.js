/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4ade80',
        secondary: '#60a5fa',
        accent: '#fbbf24',
        neutral: '#f1f5f9',
        'neutral-dark': '#334155',
        danger: '#ef4444'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'bounce-slow': 'bounce 2s infinite',
      }
    }
  },
  plugins: [],
};