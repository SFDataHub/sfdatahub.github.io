import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',            // <— wichtig: relative Assets für Unterordner wie /preview
  build: { outDir: 'dist' }
})
