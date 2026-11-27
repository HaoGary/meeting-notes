// 目前裝置類型：mobile（≤767）、tablet（768–1199）、desktop（≥1200）
import { useMediaQuery } from '@mui/material';

export function useDevice() {
  const isMobile = useMediaQuery((t) => t.breakpoints.down('sm'), { noSsr: true });
  const isDesktop = useMediaQuery((t) => t.breakpoints.up('lg'), { noSsr: true });
  return { isMobile, isTablet: !isMobile && !isDesktop, isDesktop };
}
