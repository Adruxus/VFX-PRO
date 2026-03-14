import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: { '@': path.resolve(__dirname, './src') },
    },
    server: { port: 5173, open: true },
    build: {
        outDir: 'dist',
        sourcemap: false,
        minify: 'terser',
        chunkSizeWarningLimit: 900,
        terserOptions: {
            compress: { drop_console: true, drop_debugger: true },
        },
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return
                    if (id.includes('@react-three/drei')) return 'vendor-3d-drei'
                    if (id.includes('@react-three/fiber') || id.includes('/three/')) return 'vendor-3d-core'
                    if (id.includes('react-router-dom') || id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react'
                    if (id.includes('@radix-ui') || id.includes('class-variance-authority') || id.includes('tailwind-merge')) return 'vendor-ui'
                    if (id.includes('/axios/') || id.includes('/zustand/') || id.includes('/zod/')) return 'vendor-ai'
                    if (id.includes('/recharts/')) return 'vendor-charts'
                },
            },
        },
    },
})
