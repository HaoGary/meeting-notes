import { Box, Breadcrumbs, Link, Stack, Typography } from '@mui/material';
import NavigateNext from '@mui/icons-material/NavigateNext';

// 後台頁面標題：麵包屑 + 標題 + 右側操作
export default function PageHeader({ crumbs = [], title, subtitle, actions, children }) {
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pt: { xs: 1.5, sm: 2 }, pb: 1.5 }}>
      {crumbs.length > 0 && (
        <Breadcrumbs separator={<NavigateNext sx={{ fontSize: 16 }} />} sx={{ fontSize: 12.5, mb: 0.5 }}>
          {crumbs.map((c, i) => c.onClick
            ? <Link key={i} component="button" underline="hover" color="text.secondary" onClick={c.onClick} sx={{ fontSize: 12.5 }}>{c.label}</Link>
            : <Typography key={i} fontSize={12.5} color="text.disabled" noWrap sx={{ maxWidth: 280 }}>{c.label}</Typography>)}
        </Breadcrumbs>
      )}
      <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
        <Box flex={1} minWidth={0}>
          {title && <Typography variant="h5" fontWeight={700} fontSize={{ xs: 20, sm: 22 }}>{title}</Typography>}
          {subtitle && <Typography fontSize={13} color="text.secondary" mt={0.25}>{subtitle}</Typography>}
          {children}
        </Box>
        {actions && <Stack direction="row" gap={1} alignItems="center">{actions}</Stack>}
      </Stack>
    </Box>
  );
}
