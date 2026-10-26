/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#090b10',
        panel: '#10141c',
        panel2: '#151b25',
        line: '#26303d',
        muted: '#7f8b9c',
        soft: '#b8c2d1',
        lime: '#c9ff4a',
        cyan: '#4ce2d1',
        coral: '#ff836b',
        gold: '#f59e0b',
        violet: '#8b5cf6',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(201,255,74,.12), 0 20px 80px rgba(0,0,0,.26)',
        'glow-cyan': '0 0 0 1px rgba(76,226,209,.15), 0 20px 80px rgba(0,0,0,.26)',
        'glow-coral': '0 0 0 1px rgba(255,131,107,.15), 0 20px 80px rgba(0,0,0,.26)',
      },
    },
  },
  plugins: [],
};
