import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuration spéciale pour VS Code Remote SSH
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Autorise les connexions externes
    port: 5173,
    hmr: {
      clientPort: 5173 // Force le tunnel WebSocket à utiliser le bon port
    }
  }
})