// 左右分割預覽：原始圖片 | SVG。兩邊同步縮放與拖曳（滑鼠滾輪、拖曳、觸控雙指縮放）。
// 以改變圖片的版面尺寸（而非 CSS scale）來縮放，SVG 放大時會重新繪製，保持清晰。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import Add from '@mui/icons-material/Add';
import Remove from '@mui/icons-material/Remove';
import FitScreenOutlined from '@mui/icons-material/FitScreenOutlined';

const MIN = 0.02, MAX = 32;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const checker = { backgroundColor: '#fff', backgroundImage: 'repeating-conic-gradient(#eceef2 0 25%, #fff 0 50%)', backgroundSize: '16px 16px' };

const OUTLINE_STYLE = '<style>path,rect,circle,ellipse,polygon{fill:none!important;stroke:#1f2937!important;stroke-width:1px!important;vector-effect:non-scaling-stroke}</style>';

export default function CompareViewer({ originalUrl, svg, width, height, busy, layout = 'split', emptySvg }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [fill, setFill] = useState('fill'); // fill | outline
  const paneRef = useRef(null);
  const fitted = useRef(false);
  const drag = useRef(null);
  const pointers = useRef(new Map());

  // SVG 以 Blob URL 搭配 <img> 顯示（不直接插入 DOM，避免執行任何內嵌內容）
  const svgUrl = useMemo(() => {
    if (!svg) return null;
    const src = fill === 'outline' ? svg.replace(/<svg\b[^>]*>/, (m) => m + OUTLINE_STYLE) : svg;
    return URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
  }, [svg, fill]);
  useEffect(() => () => svgUrl && URL.revokeObjectURL(svgUrl), [svgUrl]);

  const fit = useCallback(() => {
    const el = paneRef.current;
    if (!el || !width || !height) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = clamp(Math.min((r.width - 32) / width, (r.height - 32) / height), MIN, MAX);
    setView({ scale: s, x: 0, y: 0 });
  }, [width, height]);

  // 換圖片時自動符合視窗；容器尺寸改變時若尚未手動縮放也重新符合
  useLayoutEffect(() => { fitted.current = true; fit(); }, [originalUrl, fit]);
  useEffect(() => {
    const el = paneRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { if (fitted.current) fit(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, layout]);

  const zoomAt = useCallback((factor, cx = 0, cy = 0) => {
    fitted.current = false;
    setView((v) => {
      const s = clamp(v.scale * factor, MIN, MAX);
      const k = s / v.scale;
      return { scale: s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  // 以 pane 中心為原點的座標
  const local = (e, el) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  // 滾輪縮放需 passive: false 才能阻止頁面捲動
  const panes = useRef([]);
  useEffect(() => {
    const onWheel = (e) => {
      e.preventDefault();
      const p = local(e, e.currentTarget);
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      zoomAt(f, p.x, p.y);
    };
    const els = panes.current.filter(Boolean);
    els.forEach((el) => el.addEventListener('wheel', onWheel, { passive: false }));
    return () => els.forEach((el) => el.removeEventListener('wheel', onWheel));
  }, [zoomAt, layout, svgUrl, originalUrl]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // 雙指縮放
      const [a, b] = [...pointers.current.values()];
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)[1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      if (before > 0) {
        const r = e.currentTarget.getBoundingClientRect();
        zoomAt(after / before, (a.x + b.x) / 2 - r.left - r.width / 2, (a.y + b.y) / 2 - r.top - r.height / 2);
      }
      return;
    }
    fitted.current = false;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = (e) => { pointers.current.delete(e.pointerId); if (!pointers.current.size) drag.current = null; };

  const w = width * view.scale, h = height * view.scale;
  const imgSx = {
    position: 'absolute', left: '50%', top: '50%', width: w, height: h, maxWidth: 'none',
    transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
    userSelect: 'none', pointerEvents: 'none', boxShadow: '0 0 0 1px rgba(17,24,39,.08)',
  };

  const paneSx = {
    position: 'relative', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', ...checker,
    cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none',
  };
  const handlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: () => { fitted.current = true; fit(); } };
  const label = (text) => (
    <Typography sx={{ position: 'absolute', top: 10, left: 10, zIndex: 1, px: 1, py: 0.25, borderRadius: 1, fontSize: 12, fontWeight: 600,
      bgcolor: 'rgba(255,255,255,.92)', color: 'text.secondary', boxShadow: '0 1px 2px rgba(0,0,0,.08)', pointerEvents: 'none' }}>{text}</Typography>
  );

  const showOriginal = layout !== 'svg';
  const showSvg = layout !== 'original';

  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: '1px', bgcolor: 'divider' }}>
        {showOriginal && (
          <Box ref={(el) => { panes.current[0] = el; if (layout === 'original' || layout === 'split') paneRef.current = el; }} sx={paneSx} {...handlers}
            role="img" aria-label="原始圖片預覽">
            {label('原始圖片')}
            {originalUrl && <Box component="img" src={originalUrl} alt="" draggable={false}
              sx={{ ...imgSx, imageRendering: view.scale >= 3 ? 'pixelated' : 'auto' }} />}
          </Box>
        )}
        {showSvg && (
          <Box ref={(el) => { panes.current[1] = el; if (layout === 'svg') paneRef.current = el; }} sx={paneSx} {...handlers}
            role="img" aria-label="SVG 向量圖預覽">
            {label(fill === 'outline' ? 'SVG（外框）' : 'SVG 向量圖')}
            {svgUrl && <Box component="img" src={svgUrl} alt="SVG 預覽" data-testid="svg-preview" draggable={false}
              sx={{ ...imgSx, opacity: busy ? 0.45 : 1, transition: 'opacity .2s' }} />}
            {!svgUrl && emptySvg}
          </Box>
        )}
      </Box>

      {/* 縮放控制 */}
      <Stack direction="row" alignItems="center" gap={0.5}
        sx={{ position: 'absolute', right: 12, bottom: 12, zIndex: 2, p: 0.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,.96)', boxShadow: '0 1px 3px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.04)' }}>
        <ToggleButtonGroup size="small" exclusive value={fill} onChange={(_, v) => v && setFill(v)} aria-label="SVG 顯示方式"
          sx={{ mr: 0.5, '& .MuiToggleButton-root': { px: 1, py: 0.25, fontSize: 12, border: 0, borderRadius: '6px !important' } }}>
          <ToggleButton value="fill">填色</ToggleButton>
          <ToggleButton value="outline">外框</ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title="縮小"><IconButton size="small" aria-label="縮小" onClick={() => zoomAt(1 / 1.25)}><Remove fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="實際大小（100%）">
          <Box component="button" type="button" onClick={() => { fitted.current = false; setView({ scale: 1, x: 0, y: 0 }); }} aria-label="實際大小"
            sx={{ border: 0, bgcolor: 'transparent', font: 'inherit', fontSize: 12, fontVariantNumeric: 'tabular-nums', minWidth: 48, cursor: 'pointer', color: 'text.secondary', borderRadius: 1, py: 0.5, '&:hover': { bgcolor: 'action.hover' } }}>
            {Math.round(view.scale * 100)}%
          </Box>
        </Tooltip>
        <Tooltip title="放大"><IconButton size="small" aria-label="放大" onClick={() => zoomAt(1.25)}><Add fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="符合視窗（雙擊預覽區也可）"><IconButton size="small" aria-label="符合視窗" onClick={() => { fitted.current = true; fit(); }}><FitScreenOutlined fontSize="small" /></IconButton></Tooltip>
      </Stack>
    </Box>
  );
}
