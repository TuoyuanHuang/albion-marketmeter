import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ao: {
          bg: "#0d1117",
          panel: "#161b22",
          border: "#30363d",
          gold: "#d4a72c",
          green: "#2ea043",
          red: "#da3633",
          muted: "#8b949e",
        },
      },
    },
  },
  plugins: [],
};
export default config;
