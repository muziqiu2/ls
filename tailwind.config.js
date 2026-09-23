/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        // 品牌亮色：用于背景/装饰
        primary: '#4ade80',
        secondary: '#60a5fa',
        accent: '#fbbf24',
        // 深色变体：用于「文字/图标」——亮色直接当文字用对比度只有 1.6~2.5:1
        'primary-dark': '#047857',
        'secondary-dark': '#1d4ed8',
        'accent-dark': '#b45309',
        neutral: '#f1f5f9',
        'neutral-dark': '#334155',
        // 危险色加深到 600 档：白字在 #ef4444 上只有 3.8:1，不满足 AA
        danger: '#b91c1c'
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