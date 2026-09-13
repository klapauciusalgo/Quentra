/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        floor: {
          bg: "#1A1D26",
          wall: "#232838",
          dark: "#12151D",
          darker: "#0C0E14",
          desk: "#4B3B31",
          deskBorder: "#644e40",
          border: "#2D344B",
          borderLight: "#3E4663",
        },
        signal: {
          bull: "#39FF88",
          bear: "#FF4B5C",
          warn: "#FFC145",
          cyan: "#4FE0FF",
          purple: "#A855F7"
        },
        retro: {
          text: "#EDEDF2",
          muted: "#8A8FA3",
          dim: "#5A5F73",
        }
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', '"Silkscreen"', 'monospace'],
        mono: ['"JetBrains Mono"', '"Space Mono"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'pixel-cyan': '0 0 15px rgba(79, 224, 255, 0.4), 0 0 3px rgba(79, 224, 255, 0.8)',
        'pixel-green': '0 0 15px rgba(57, 255, 136, 0.4), 0 0 3px rgba(57, 255, 136, 0.8)',
        'pixel-red': '0 0 15px rgba(255, 75, 92, 0.4), 0 0 3px rgba(255, 75, 92, 0.8)',
        'pixel-amber': '0 0 15px rgba(255, 193, 69, 0.4), 0 0 3px rgba(255, 193, 69, 0.8)',
        'arcade': 'inset 0 0 10px rgba(0, 0, 0, 0.8), 0 4px 0 #0C0E14',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ticker': 'ticker 25s linear infinite',
        'flicker': 'flicker 0.15s infinite',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.94' },
        }
      }
    },
  },
  plugins: [],
}
