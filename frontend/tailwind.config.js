/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm terracotta palette
        terracotta: {
          50: '#fef7f4',
          100: '#fdeee7',
          200: '#fad9c9',
          300: '#f5bda0',
          400: '#ed9670',
          500: '#e4714a',
          600: '#c45d35',
          700: '#a3492b',
          800: '#873d28',
          900: '#6f3526',
        },
        // Deep olive greens
        olive: {
          50: '#f6f7f4',
          100: '#e8ebe2',
          200: '#d2d8c7',
          300: '#b3bea3',
          400: '#939f7e',
          500: '#778462',
          600: '#5d694c',
          700: '#4a5d3a',
          800: '#3d4332',
          900: '#343a2c',
        },
        // Golden saffron
        saffron: {
          50: '#fefbf3',
          100: '#fdf5df',
          200: '#fae7ba',
          300: '#f5d48b',
          400: '#eebb5a',
          500: '#d4a84b',
          600: '#c48b2a',
          700: '#a36b22',
          800: '#855522',
          900: '#6d461f',
        },
        // Warm cream backgrounds
        cream: {
          50: '#fdfcfb',
          100: '#faf7f0',
          200: '#f5efe3',
          300: '#ece2cf',
          400: '#dfd0b5',
          500: '#d0bc9a',
          600: '#bca07a',
          700: '#a38562',
          800: '#866d51',
          900: '#6d5a44',
        },
        // Rich charcoal
        charcoal: {
          50: '#f6f6f6',
          100: '#e7e7e7',
          200: '#d1d1d1',
          300: '#b0b0b0',
          400: '#888888',
          500: '#6d6d6d',
          600: '#5d5d5d',
          700: '#4f4f4f',
          800: '#2d2d2d',
          900: '#1a1a1a',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.6s ease-out forwards',
        'slide-in-right': 'slideInRight 0.5s ease-out forwards',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'scale-in': 'scaleIn 0.3s ease-out forwards',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(196, 93, 53, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(196, 93, 53, 0.5)' },
        },
      },
      boxShadow: {
        'inner-glow': 'inset 0 2px 20px 0 rgba(255, 255, 255, 0.1)',
        'warm': '0 10px 40px -10px rgba(196, 93, 53, 0.3)',
        'warm-lg': '0 20px 60px -15px rgba(196, 93, 53, 0.4)',
      },
    },
  },
  plugins: [],
}
