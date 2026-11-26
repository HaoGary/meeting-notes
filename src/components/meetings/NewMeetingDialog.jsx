import { useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { MEETING_TYPES, defaultTemplate } from '../../services/seed';
import { AppDialog } from '../common/ui';
import { DateInput, TimeInput } from '../common/pickers';

const TEMPLATES = [
  ['default', '標準會議範本', '會議目的、討論事項、決議事項、待辦事項'],
  ['blank', '空白', '自由撰寫'],
];

export default function NewMeetingDialog({ open, onClose, onCreate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ title: '', date: today, start: '10:00', end: '11:00', type: MEETING_TYPES[0], template: 'default' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const bad = f.end <= f.start;

  const submit = async (e) => {
    e.preventDefault();
    if (bad || busy) return;
    setBusy(true);
    const doc = f.template === 'default' ? defaultTemplate() : { type: 'doc', content: [{ type: 'paragraph' }] };
    const ok = await onCreate({ ...f, title: f.title.trim() || '未命名會議', doc });
    setBusy(false);
    if (ok) setF((x) => ({ ...x, title: '' }));
  };

  return (
    <AppDialog open={open} title="新增會議紀錄" onClose={onClose} maxWidth="sm"
      actions={<>
        <Button color="inherit" onClick={onClose}>取消</Button>
        <Button variant="contained" type="submit" form="new-meeting" disabled={bad || busy}>{busy ? '建立中…' : '建立'}</Button>
      </>}>
      <Stack component="form" id="new-meeting" onSubmit={submit} gap={2} sx={{ pt: 1 }}>
        <TextField autoFocus fullWidth label="會議名稱" placeholder="例：每週業務例會" value={f.title} onChange={set('title')} />
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, sm: 5 }}><DateInput id="new-date" label="日期" value={f.date} onChange={(v) => setF((x) => ({ ...x, date: v }))} /></Grid>
          <Grid size={{ xs: 6, sm: 3.5 }}><TimeInput id="new-start" label="開始" value={f.start} onChange={(v) => setF((x) => ({ ...x, start: v }))} /></Grid>
          <Grid size={{ xs: 6, sm: 3.5 }}><TimeInput id="new-end" label="結束" value={f.end} onChange={(v) => setF((x) => ({ ...x, end: v }))} error={bad}
            helperText={bad ? '需晚於開始時間' : ''} minTime={f.start} /></Grid>
        </Grid>
        <TextField select fullWidth label="會議類型" value={f.type} onChange={set('type')}>
          {MEETING_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <Grid container spacing={1}>
          {TEMPLATES.map(([v, name, desc]) => {
            const on = f.template === v;
            return (
              <Grid key={v} size={6}>
                <Box component="button" type="button" onClick={() => setF((x) => ({ ...x, template: v }))} aria-pressed={on}
                  sx={{ width: '100%', height: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', p: 1.5, borderRadius: 2, border: 1,
                    borderColor: on ? 'primary.main' : 'divider', bgcolor: on ? 'primary.light' : 'background.paper' }}>
                  <Typography fontWeight={600} fontSize={13.5} color="text.primary">{name}</Typography>
                  <Typography fontSize={12} color="text.secondary">{desc}</Typography>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </Stack>
    </AppDialog>
  );
}
