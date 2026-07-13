/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Identidade Grupo BF — preto e branco
        brand: {
          DEFAULT: '#ffffff',
          dark: '#d4d4d4',
        },
      },
    },
  },
  plugins: [],
}
