/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sleeper-dark': '#121A24',
        'sleeper-card': '#1D2736',
        'sleeper-accent': '#00CEB8',
        'sleeper-border': '#2B384E',
        'sleeper-muted': '#8B9BAE',
      },
    },
  },
  plugins: [],
}
