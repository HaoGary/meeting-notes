// 統一的 RWD 斷點（Mobile First：樣式先寫手機版，再用 up() 往上覆寫）
//   手機  xs：0–767px
//   平板  sm：768–1023px（直向）、md：1024–1199px（橫向）
//   桌面  lg：1200px 以上；xl：1536px 以上（大螢幕）
export const BREAKPOINTS = { xs: 0, sm: 768, md: 1024, lg: 1200, xl: 1536 };

// 給純 CSS 使用（例如 GlobalStyles、styleOverrides 內）
export const MQ = {
  mobile: `@media (max-width:${BREAKPOINTS.sm - 0.05}px)`,
  tablet: `@media (min-width:${BREAKPOINTS.sm}px) and (max-width:${BREAKPOINTS.lg - 0.05}px)`,
  desktop: `@media (min-width:${BREAKPOINTS.lg}px)`,
};
