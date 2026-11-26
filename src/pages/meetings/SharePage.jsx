// 分享預覽頁（唯讀）：獨立版面，不顯示後台選單。
import { useEffect, useState } from 'react';
import { Avatar, Box, Button, Chip, CircularProgress, Divider, Link, Paper, Stack, Typography } from '@mui/material';
import EventOutlined from '@mui/icons-material/EventOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import PersonOutline from '@mui/icons-material/PersonOutline';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import ArrowBack from '@mui/icons-material/ArrowBack';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import ReadOnlyContent from '../../features/editor/ReadOnlyContent';
import { StatusChip, UserAvatar, fmtRel } from '../../components/common/ui';

const fullDate = (d) => {
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getFullYear()} 年 ${dt.getMonth() + 1} 月 ${dt.getDate()} 日（${'日一二三四五六'[dt.getDay()]}）`;
};

function Info({ icon: I, label, children }) {
  return (
    <Stack direction="row" gap={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
      <I sx={{ fontSize: 18, color: 'text.disabled', mt: '2px' }} />
      <Box minWidth={0}>
        <Typography fontSize={12} color="text.disabled">{label}</Typography>
        <Box sx={{ fontSize: 14, color: 'text.primary', wordBreak: 'break-word' }}>{children}</Box>
      </Box>
    </Stack>
  );
}

export default function SharePage({ api, token, onBackToApp, onLogin }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    api.getSharedMeeting(token).then((d) => alive && setData(d)).catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [api, token]);

  const topBar = (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'rgba(255,255,255,.9)', backdropFilter: 'blur(8px)', borderBottom: 1, borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" gap={1.25} sx={{ maxWidth: 920, mx: 'auto', px: { xs: 2, md: 3 }, height: 56 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: 'primary.main', color: '#fff', display: 'grid', placeItems: 'center' }}>
          <DescriptionOutlined sx={{ fontSize: 17 }} />
        </Box>
        <Typography fontWeight={650} fontSize={15}>會議紀錄</Typography>
        <Chip size="small" icon={<VisibilityOutlined sx={{ fontSize: '15px !important' }} />} label="唯讀預覽" sx={{ height: 24, bgcolor: 'grey.100' }} />
        <Box flex={1} />
        {onBackToApp && <Button size="small" startIcon={<ArrowBack />} onClick={onBackToApp} color="inherit">返回系統</Button>}
      </Stack>
    </Box>
  );

  if (error) {
    const expired = error.status === 410, login = error.status === 401;
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        {topBar}
        <Stack alignItems="center" justifyContent="center" gap={1.5} sx={{ py: 14, px: 3, textAlign: 'center' }}>
          {login ? <LockOutlined sx={{ fontSize: 42, color: 'text.disabled' }} /> : <LinkOffOutlined sx={{ fontSize: 42, color: 'text.disabled' }} />}
          <Typography variant="h6">{login ? '需要登入' : expired ? '連結已過期' : '無法開啟此連結'}</Typography>
          <Typography color="text.secondary" maxWidth={420}>{error.message}{!login && '。如需檢視，請向分享者索取新的連結。'}</Typography>
          {login && onLogin && <Button variant="contained" onClick={onLogin} sx={{ mt: 1 }}>前往登入</Button>}
        </Stack>
      </Box>
    );
  }
  if (!data) return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>{topBar}<Stack alignItems="center" py={14}><CircularProgress size={28} /></Stack></Box>;

  const { meeting: m, host, attendees } = data;
  const urlOk = /^https?:\/\//.test(m.onlineUrl || '');

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', overflowY: 'auto', height: '100vh' }}>
      {topBar}
      <Box sx={{ maxWidth: 920, mx: 'auto', px: { xs: 0, sm: 2, md: 3 }, py: { xs: 0, sm: 3 }, pb: 10 }}>
        <Paper variant="outlined" sx={{ borderRadius: { xs: 0, sm: 3 }, overflow: 'hidden' }}>
          {/* ── 會議資訊 ── */}
          <Box sx={{ px: { xs: 2.5, md: 6 }, pt: { xs: 3, md: 5 }, pb: 3, bgcolor: '#fcfcfd', borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction="row" gap={1} alignItems="center" mb={1.25}>
              <Chip size="small" label={m.type} sx={{ height: 22, bgcolor: 'primary.light', color: 'primary.dark' }} />
              <StatusChip status={m.status} />
            </Stack>
            <Typography component="h1" sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 700, lineHeight: 1.3, mb: 3 }}>{m.title}</Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.25 }}>
              <Info icon={EventOutlined} label="日期">{fullDate(m.date)}</Info>
              <Info icon={ScheduleOutlined} label="時間">{m.start} – {m.end}</Info>
              {m.location && <Info icon={PlaceOutlined} label="地點">{m.location}</Info>}
              {urlOk && <Info icon={VideocamOutlined} label="線上會議"><Link href={m.onlineUrl} target="_blank" rel="noopener noreferrer">{m.onlineUrl.replace(/^https?:\/\//, '')}</Link></Info>}
              <Info icon={PersonOutline} label="主持人">
                <Stack direction="row" alignItems="center" gap={0.75}><UserAvatar user={host} size={22} />{host?.name}</Stack>
              </Info>
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Info icon={GroupOutlined} label={`參與人員（${attendees.length}）`}>
                  <Stack direction="row" flexWrap="wrap" gap={0.75} mt={0.5}>
                    {attendees.map((a) => (
                      <Chip key={a.id} size="small" variant="outlined" label={a.name}
                        avatar={<Avatar sx={{ bgcolor: `${a.color} !important`, color: '#fff !important', fontSize: '9px !important', fontWeight: 600, width: '20px !important', height: '20px !important', ml: '3px !important', mr: '-2px !important' }}>{a.name.replace(/[A-Za-z]+ /, '').slice(0, 1)}</Avatar>}
                        sx={{ bgcolor: '#fff', borderColor: 'divider', height: 28 }} />
                    ))}
                  </Stack>
                </Info>
              </Box>
            </Box>
          </Box>

          {/* ── 內容（唯讀） ── */}
          <Box sx={{ '& .prose': { minHeight: 200, px: { xs: 2.5, md: 6 }, py: { xs: 3, md: 4 } } }}>
            <ReadOnlyContent doc={data.doc} />
          </Box>

          <Divider />
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={0.5} justifyContent="space-between" sx={{ px: { xs: 2.5, md: 6 }, py: 2, color: 'text.disabled', fontSize: 12.5 }}>
            <span>最後更新於 {fmtRel(data.updatedAt)}</span>
            <span>{data.scope === 'public' ? '此頁面透過公開連結分享' : '此頁面僅限公司成員檢視'}{data.expiresAt ? `・${new Date(data.expiresAt).toLocaleDateString('zh-TW')} 到期` : ''}</span>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
