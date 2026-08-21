/** @type {import('tailwindcss').Config} */
export default {
  // Tell Tailwind to scan these files for class names
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Iskon brand colors - can be adjusted later
      colors: {
        brand: {
          primary: '#1a56db',   // Blue - main brand color
          secondary: '#7e3af2', // Purple - accent
          dark: '#1e2a4a',      // Dark navy - header/footer
        },
      },
    },
  },
  plugins: [],
}
