import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// WICHTIG: relative Assets, damit /preview/ funktioniert
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' }
})
