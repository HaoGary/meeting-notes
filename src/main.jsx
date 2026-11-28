import { createRoot } from 'react-dom/client';
import { CssBaseline, GlobalStyles, ThemeProvider } from '@mui/material';
import App from './App';
import theme, { proseStyles } from './styles/theme';
import { ToastProvider } from './components/common/ui';
import { handleAuthRedirect } from './services/supabaseClient';

// 從邀請信、重設密碼信回來時，先建立 session 再顯示畫面
handleAuthRedirect().finally(() => createRoot(document.getElementById('root')).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <GlobalStyles styles={proseStyles} />
    <ToastProvider><App /></ToastProvider>
  </ThemeProvider>
));
