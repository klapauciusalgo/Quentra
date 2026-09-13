/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        apple: {
          dark: "#000000",
          canvas: "#07080A",
          surface: "#0F1015",
          card: "#16171F",
          elevated: "#1E202B",
          hover: "#252836",
          border: "rgba(255, 255, 255, 0.08)",
          borderLight: "rgba(255, 255, 255, 0.15)",
          borderHover: "rgba(255, 255, 255, 0.22)",
          green: "#30D158",
          red: "#FF453A",
          blue: "#0A84FF",
          cyan: "#64D2FF",
          orange: "#FF9F0A",
          purple: "#BF5AF2",
          text: "#F5F5F7",
          muted: "#86868B",
          dim: "#636366",
        },
        // Maintained for backward compatibility and semantic palette
        floor: {
          bg: "#07080A",
          wall: "#0F1015",
          dark: "#0F1015",
          darker: "#07080A",
          desk: "#16171F",
          deskBorder: "rgba(255, 255, 255, 0.1)",
          border: "rgba(255, 255, 255, 0.08)",
          borderLight: "rgba(255, 255, 255, 0.15)",
        },
        signal: {
          bull: "#30D158",
          bear: "#FF453A",
          warn: "#FF9F0A",
          cyan: "#0A84FF",
          purple: "#BF5AF2",
        },
        retro: {
          text: "#F5F5F7",
          muted: "#86868B",
          dim: "#636366",
        }
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Geist"',
          '"Inter"',
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          '"JetBrains Mono"',
          '"Geist Mono"',
          "monospace",
        ],
      },
      boxShadow: {
        'apple-glass': '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
        'apple-card': '0 4px 24px -2px rgba(0, 0, 0, 0.5)',
        'inner-bevel': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'apple-glow-blue': '0 0 20px -3px rgba(10, 132, 255, 0.35)',
        'apple-glow-green': '0 0 20px -3px rgba(48, 209, 88, 0.35)',
      },
      borderRadius: {
        '3xl': '24px',
        '2xl': '16px',
        'xl': '12px',
        'lg': '8px',
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
}
