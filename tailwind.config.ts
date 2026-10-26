import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}', './src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#090b10',
        panel: '#10141c',
        panel2: '#151b25',
        line: '#26303d',
        lime: '#c9ff4a',
        cyan: '#4ce2d1',
        coral: '#ff836b',
        soft: '#b8c2d1',
        meta: '#98a5b6',
        quiet: '#7f8b9c',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(201,255,74,.12), 0 20px 80px rgba(0,0,0,.26)',
      },
      fontFamily: {
        sans: ['var(--font-geist)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
