import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
        chunkSizeWarningLimit: 600,
        terserOptions: {
            compress: { drop_console: true, drop_debugger: true },
        },
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-select', '@radix-ui/react-slider', '@radix-ui/react-switch', '@radix-ui/react-progress'],
                    'vendor-ai': ['axios', 'zustand'],
                    'vendor-charts': ['recharts'],
                },
            },
        },
    },
})
