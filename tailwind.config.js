/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
            colors: {
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
            },
        },
    },
    plugins: [require('tailwindcss-animate')],
}