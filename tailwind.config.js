/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      animation: {
        'gradient': 'gradient 3s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'typewriter': 'typewriter 3s steps(40) 1s forwards',
        'blink': 'blink 0.5s step-end infinite',
        'fadeIn': 'fadeIn 1s ease-out forwards',
        'slideUp': 'slideUp 1s ease-out forwards',
        'wave': 'wave 1s ease-in-out infinite',
        'rainbow': 'rainbow 3s linear infinite',
        'glitch': 'glitch 3s infinite',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
      },
    },
  },
  plugins: [],
};