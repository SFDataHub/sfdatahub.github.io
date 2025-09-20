/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        'sd-bg': '#0C1C2E',
        'sd-tile': '#152A42',
        'sd-tile-hover': '#1E3A5C',
        'sd-nav': '#0A1728',
        'sd-nav-active': '#1F3B5D',
        'sd-nav-text-inactive': '#8AA5C4',
        'sd-nav-hover': '#2D4E78',
        'sd-card': '#1A2F4A',
        'sd-card-hover': '#25456B',
        'sd-card-border': '#2B4C73',
        'sd-icon': '#5C8BC6',
        'sd-text': '#FFFFFF',
        'sd-text-2': '#B0C4D9',
        'sd-title': '#F5F9FF',
        'sd-table-bg': '#14273E',
        'sd-table-head': '#1E3657',
        'sd-table-line': '#2C4A73',
        'sd-table-head-text': '#D6E4F7',
        'sd-table-value-text': '#FFFFFF',
        'sd-table-hover': '#20385C',
        'sd-btn': '#1E2F47',
        'sd-btn-hover': '#2A4C72'
      },
      borderRadius: { '2xl': '1rem' },
      boxShadow: { soft: '0 6px 24px rgba(0,0,0,0.25)' }
    },
  },
  plugins: [],
}
