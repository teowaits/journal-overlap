export const BASE = "https://api.openalex.org";
export const PER_PAGE = 200;
export const DEFAULT_FROM_YEAR = 2023;
export const YEAR_OPTIONS = [2020, 2021, 2022, 2023, 2024, 2025];
export const CAP_OPTIONS = [500, 1000, 2000, 5000];
export const PAGE_SIZE = 50;

export const C = {
  bg: "#0d111c", bgDark: "#0a0e1a", surface: "#131826", surface2: "#161b2a",
  border: "#1e2436", border2: "#2d3449",
  textPrimary: "#e2e8f0", textSecondary: "#718096", textMuted: "#4a5568",
  blue: "#63b3ed", blueLight: "#90cdf4",
  amber: "#f6ad55", amberLight: "#fbd38d",
  green: "#9ae6b4", greenDark: "#68d391",
  red: "#fc8181",
};

export const ghostBtn = { padding: "8px 18px", borderRadius: 7, border: `1px solid ${C.border2}`, background: "transparent", color: C.textSecondary, cursor: "pointer", fontFamily: "inherit", fontSize: 12, transition: "all 0.15s" };

export const LEVEL_ORDER = ["domain", "field", "subfield", "topic"];
export const LEVEL_LABELS = { domain: "Domain", field: "Field", subfield: "Subfield", topic: "Topic" };
