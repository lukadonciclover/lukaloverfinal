import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#071017",
        panel: "#0d1821",
        line: "#1d3341",
        gold: "#d4a84f",
        teal: "#45b6ad",
        mist: "#8fa6b3"
      },
      boxShadow: {
        terminal: "0 18px 60px rgba(0, 0, 0, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
