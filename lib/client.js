/**
 * 余额悬浮窗（合并版）—— client 半
 * 双标签页：DeepSeek 余额 / OpenCode Go 余额，标签切换带滑动+淡入动画。
 * 同源接口：
 *   /api/deepseek/balance     — DeepSeek 余额（30s 轮询）
 *   /api/opencode-go/balance  — OpenCode Go 额度（60s 轮询）
 *   /api/opencode-go/usage    — 本地用量（5s 轮询，可选）
 */
window.__ModuleLoader__.load({
  id: 'dsh-opencode-go-monitor',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    let React = require('react');

    //#region styles
    const CSS = `
.opencg {
  position: fixed;
  pointer-events: auto;
  z-index: 40;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28));
  background: var(--dsw-alias-bg-overlay, #fff);
  border-radius: 10px;
  box-shadow: 0 4px 18px rgba(0,0,0,.18);
  padding: 8px 10px;
  font: inherit;
  color: var(--dsw-alias-label-primary, #222);
  user-select: none;
  cursor: grab;
  min-width: 220px;
  min-height: 118px;
  overflow: hidden;
}
.opencg.dragging { cursor: grabbing; }
.opencg.resizing { cursor: nwse-resize; }
.opencg-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  flex: none;
}
.opencg-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary, #2f9e44);
  animation: opencg-pulse 2s ease infinite;
  flex: none;
}
.opencg-dot.err { background: var(--dsw-alias-state-error-primary, #e03131); animation: none; }
.opencg-dot.idle { background: var(--dsw-alias-label-secondary, #888); animation: none; }
@keyframes opencg-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .35; }
}
.opencg-tabs { display: flex; gap: 2px; margin-left: 2px; flex: none; }
.opencg-tab {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #888);
  font: inherit;
  font-size: 11px;
  line-height: 1.4;
  padding: 2px 9px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.opencg-tab:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.10)); }
.opencg-tab.active {
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.16));
  color: var(--dsw-alias-label-primary, #222);
  font-weight: 600;
}
.opencg-refresh {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #888);
  cursor: pointer;
  border-radius: 6px;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex: none;
}
.opencg-refresh:hover {
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.14));
  color: var(--dsw-alias-label-primary, #222);
}
.opencg-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 6px;
  min-height: 0;
}
/* 标签切换动画：淡入 + 方向滑动 */
.opencg-pane { animation: opencg-tab-in .22s ease both; }
.opencg-pane.left { animation-name: opencg-tab-in-left; }
.opencg-pane.right { animation-name: opencg-tab-in-right; }
@keyframes opencg-tab-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
@keyframes opencg-tab-in-left {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: none; }
}
@keyframes opencg-tab-in-right {
  from { opacity: 0; transform: translateX(12px); }
  to { opacity: 1; transform: none; }
}
.opencg-row {
  display: grid;
  grid-template-columns: 34px 48px 1fr 44px 74px;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  line-height: 1.7;
  white-space: nowrap;
}
.opencg-row.simple {
  grid-template-columns: 60px 1fr;
  line-height: 1.8;
}
.opencg-name { color: var(--dsw-alias-label-secondary, #888); }
.opencg-rem { font-weight: 700; font-variant-numeric: tabular-nums; font-size: 14px; }
.opencg-used { font-size: 10px; color: var(--dsw-alias-label-secondary, #888); }
.opencg-reset { font-size: 10px; color: var(--dsw-alias-label-secondary, #888); text-align: right; }
.opencg-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.18));
  overflow: hidden;
}
.opencg-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width .4s ease;
}
.opencg-value { font-weight: 700; font-variant-numeric: tabular-nums; font-size: 15px; }
.opencg-sep {
  height: 1px;
  background: var(--dsw-alias-border-l1, rgba(128,128,128,.22));
  margin: 6px 0;
  flex: none;
}
.opencg-usage {
  font-size: 11px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary, #222);
  white-space: nowrap;
}
.opencg-usage.dim { color: var(--dsw-alias-label-secondary, #888); font-size: 10px; }
.opencg-status {
  font-size: 10px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary, #888);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.opencg-status.err { color: var(--dsw-alias-state-warn-primary, #f08c00); }
.opencg-hint { font-size: 10px; color: var(--dsw-alias-label-secondary, #888); margin-top: 3px; }
.opencg-resize {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  z-index: 1;
}
.opencg-resize::after {
  content: '';
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 7px;
  height: 7px;
  border-right: 2px solid var(--dsw-alias-label-secondary, #888);
  border-bottom: 2px solid var(--dsw-alias-label-secondary, #888);
}
`;
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-opencode-go-monitor"]') === null) {
      const tag = document.createElement('style');
      tag.setAttribute('data-plugin-css', 'dsh-opencode-go-monitor');
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }
    //#endregion

    const inject = ['slots', 'timer'];

    const KEY_POS = 'dsh-opencode-go-monitor-pos';
    const KEY_SIZE = 'dsh-opencode-go-monitor-size';

    function loadPos() {
      try {
        const raw = localStorage.getItem(KEY_POS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
        }
      } catch (e) { /* 可选项 */ }
      return null;
    }
    function loadSize() {
      try {
        const raw = localStorage.getItem(KEY_SIZE);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.w === 'number' && typeof parsed.h === 'number') {
            return { w: Math.max(220, Math.min(560, parsed.w)), h: Math.max(118, Math.min(620, parsed.h)) };
          }
        }
      } catch (e) { /* 可选项 */ }
      return { w: 270, h: 160 };
    }
    const fmtTokens = (n) => {
      if (n == null || !Number.isFinite(n)) return '--';
      if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
      if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
      return String(Math.round(n));
    };
    const fmtReset = (iso) => {
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const p = (n) => String(n).padStart(2, '0');
        return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
      } catch (e) { return ''; }
    };
    const fmtTime = (ms) => {
      try {
        const d = new Date(ms);
        const p = (n) => String(n).padStart(2, '0');
        return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
      } catch (e) { return '--:--:--'; }
    };

    function apply(ctx) {
      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'opencode-go-monitor', order: 0, label: '余额悬浮窗' },
        (props) => {
          const [go, setGo] = React.useState(null);
          const [goErr, setGoErr] = React.useState(null);
          const [use, setUse] = React.useState(null);
          const [useErr, setUseErr] = React.useState(null);
          const [ds, setDs] = React.useState(null);
          const [dsErr, setDsErr] = React.useState(null);
          const [tab, setTab] = React.useState('go');
          const [dir, setDir] = React.useState('right');
          const [pos, setPos] = React.useState(loadPos);
          const [size, setSize] = React.useState(loadSize);
          const [dragging, setDragging] = React.useState(false);
          const [resizing, setResizing] = React.useState(false);
          const dragRef = React.useRef(null);
          const resizeRef = React.useRef(null);
          const sizeRef = React.useRef(size);

          const applySize = (next) => { sizeRef.current = next; setSize(next); };

          const refreshGo = React.useCallback(async () => {
            try {
              const res = await fetch('/api/opencode-go/balance');
              const data = await res.json();
              if (data && (data.ok || data.stale)) { setGo(data); setGoErr(null); }
              else { setGo(null); setGoErr(data && data.error ? data.error : '获取失败'); }
            } catch (e) { setGo(null); setGoErr(String((e && e.message) || e)); }
          }, []);

          const refreshUse = React.useCallback(async () => {
            try {
              const res = await fetch('/api/opencode-go/usage');
              const data = await res.json();
              if (data && data.ok) { setUse(data); setUseErr(null); }
              else { setUseErr(data && data.error ? data.error : '获取失败'); }
            } catch (e) { setUseErr(String((e && e.message) || e)); }
          }, []);

          const refreshDs = React.useCallback(async () => {
            try {
              const res = await fetch('/api/deepseek/balance');
              const data = await res.json();
              if (data && (data.ok || data.stale)) { setDs(data); setDsErr(null); }
              else { setDs(null); setDsErr(data && data.error ? data.error : '获取失败'); }
            } catch (e) { setDs(null); setDsErr(String((e && e.message) || e)); }
          }, []);

          const refresh = React.useCallback(() => { refreshGo(); refreshUse(); refreshDs(); }, [refreshGo, refreshUse, refreshDs]);

          React.useEffect(() => {
            refresh();
            const stop1 = ctx.interval(refreshGo, 60000);
            const stop2 = ctx.interval(refreshUse, 5000);
            const stop3 = ctx.interval(refreshDs, 30000);
            return () => { stop1(); stop2(); stop3(); };
          }, [refresh, refreshGo, refreshUse, refreshDs]);

          const switchTab = (next) => {
            setTab((prev) => {
              if (prev === next) return prev;
              setDir(next === 'go' ? 'right' : 'left');
              return next;
            });
          };

          // ---- 拖动 ----
          const onPointerDown = (e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { sx: e.clientX, sy: e.clientY, bx: pos ? pos.x : 16, by: pos ? pos.y : 168 };
            setDragging(true);
          };
          const onPointerMove = (e) => {
            const d = dragRef.current;
            if (!d) return;
            setPos({ x: d.bx + (e.clientX - d.sx), y: d.by - (e.clientY - d.sy) });
          };
          const onPointerUp = (e) => {
            const d = dragRef.current;
            dragRef.current = null;
            setDragging(false);
            if (d) {
              if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 4) {
                refresh();
              } else {
                const next = { x: d.bx + (e.clientX - d.sx), y: d.by - (e.clientY - d.sy) };
                try { localStorage.setItem(KEY_POS, JSON.stringify(next)); } catch (e2) { /* 可选项 */ }
              }
            }
          };

          // ---- 调整大小 ----
          const onResizeDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            resizeRef.current = { sx: e.clientX, sy: e.clientY, sw: sizeRef.current.w, sh: sizeRef.current.h };
            setResizing(true);
          };
          const onResizeMove = (e) => {
            const d = resizeRef.current;
            if (!d) return;
            applySize({
              w: Math.max(220, Math.min(560, d.sw + (e.clientX - d.sx))),
              h: Math.max(118, Math.min(620, d.sh - (e.clientY - d.sy))),
            });
          };
          const onResizeUp = () => {
            const d = resizeRef.current;
            resizeRef.current = null;
            setResizing(false);
            if (d) { try { localStorage.setItem(KEY_SIZE, JSON.stringify(sizeRef.current)); } catch (e2) { /* 可选项 */ } }
          };

          // ---- 渲染 ----
          const goErrActive = tab === 'go' && (goErr || useErr);
          const dsErrActive = tab === 'ds' && dsErr;
          const curErr = tab === 'go' ? (goErr || useErr) : dsErr;
          const curData = tab === 'go' ? go : ds;
          const dotClass = curErr ? 'opencg-dot err' : (curData ? 'opencg-dot' : 'opencg-dot idle');

          const quotaRow = (k, name, w) => {
            let rem = null, used = null, color = '#9AA0A6';
            if (w && typeof w.percent === 'number') {
              used = w.percent;
              rem = Math.max(0, Math.min(100, Math.round(100 - used)));
              color = rem >= 50 ? '#16A34A' : (rem >= 25 ? '#D97706' : '#DC2626');
            }
            const bar = React.createElement('div', { className: 'opencg-bar', key: k + '-bar' },
              rem != null ? React.createElement('i', { style: { width: rem + '%', background: color } }) : null);
            return React.createElement('div', { className: 'opencg-row', key: k },
              React.createElement('span', { className: 'opencg-name' }, name),
              React.createElement('span', { className: 'opencg-rem', style: rem != null ? { color } : undefined }, rem != null ? rem + '%' : '--'),
              bar,
              React.createElement('span', { className: 'opencg-used' }, used != null ? '已用' + Math.round(used) + '%' : (w && w.status ? w.status : '')),
              React.createElement('span', { className: 'opencg-reset' }, w && w.resetsAt ? fmtReset(w.resetsAt) : ''),
            );
          };

          // OpenCode Go 面板
          const goChildren = [];
          goChildren.push(quotaRow('m', '月度', go && go.monthly));
          goChildren.push(quotaRow('r', '滚动', go && go.rolling));
          goChildren.push(quotaRow('w', '每周', go && go.weekly));
          goChildren.push(React.createElement('div', { className: 'opencg-sep', key: 'sep' }));
          const today = use && use.today;
          const total = use && use.total;
          if (today) {
            goChildren.push(React.createElement('div', { className: 'opencg-usage', key: 'u1' },
              '今日 ' + fmtTokens(today.input + today.output + today.reasoning) + ' tok · $' + today.cost.toFixed(4) + ' · ' + today.msgs + ' 条'));
          }
          if (total) {
            goChildren.push(React.createElement('div', { className: 'opencg-usage dim', key: 'u2' },
              '累计 ' + fmtTokens(total.input + total.output + total.reasoning) + ' tok · $' + total.cost.toFixed(4) + ' · ' + total.sessions + ' 会话'));
          }
          const goStatus = (goErr ? '余额失败' : (go ? '余额 ' + fmtTime(go.fetchedAt) : '余额 --'))
            + ' · ' + (useErr ? '用量不可用' : (use ? '用量 ' + fmtTime(use.ts) : '用量 --'))
            + (go && go.stale ? ' · 数据过期' : '');
          goChildren.push(React.createElement('div', {
            className: (goErr || useErr) ? 'opencg-status err' : 'opencg-status',
            key: 'st',
            title: (goErr ? '余额: ' + goErr : '') + ((goErr && useErr) ? '\n' : '') + (useErr ? '用量: ' + useErr : ''),
          }, goStatus));

          // DeepSeek 面板
          const dsChildren = [];
          const dsCur = ds && ds.currency === 'CNY' ? '¥' : (ds && ds.currency ? ds.currency + ' ' : '¥');
          const dsBalanceText = ds ? dsCur + ds.balance.toFixed(2) : '--';
          const dsTokenText = ds ? '≈' + fmtTokens(ds.estTokens) + ' tok' : '--';
          dsChildren.push(React.createElement('div', { className: 'opencg-row simple', key: 'd1' },
            React.createElement('span', { className: 'opencg-name' }, '余额'),
            React.createElement('span', { className: 'opencg-value' }, dsBalanceText)));
          dsChildren.push(React.createElement('div', { className: 'opencg-row simple', key: 'd2' },
            React.createElement('span', { className: 'opencg-name' }, '预计剩余'),
            React.createElement('span', { className: 'opencg-value', style: { fontSize: 13 } }, dsTokenText)));
          if (ds && ds.model) {
            dsChildren.push(React.createElement('div', { className: 'opencg-row simple', key: 'd3' },
              React.createElement('span', { className: 'opencg-name' }, '模型'),
              React.createElement('span', { className: 'opencg-value', style: { fontSize: 12, fontWeight: 600 } }, ds.model)));
          }
          const dsStatus = dsErr ? '余额获取失败' : (ds ? '余额 ' + fmtTime(ds.fetchedAt) + ' · 每 30s 刷新' : '余额 --');
          dsChildren.push(React.createElement('div', {
            className: dsErr ? 'opencg-status err' : 'opencg-status',
            key: 'st',
            title: dsErr ? '余额: ' + dsErr : (ds ? '预计剩余按 ¥' + ds.pricePerMillion + '/百万 token 估算' : ''),
          }, dsStatus));

          const paneChildren = tab === 'go' ? goChildren : dsChildren;
          const pane = React.createElement('div', {
            key: tab,
            className: 'opencg-pane ' + dir,
          }, paneChildren);

          const body = React.createElement('div', { className: 'opencg-body', key: 'body' }, pane);

          const header = React.createElement('div', { className: 'opencg-header', key: 'h' },
            React.createElement('span', { className: dotClass }),
            React.createElement('div', { className: 'opencg-tabs' },
              React.createElement('button', {
                type: 'button',
                className: tab === 'ds' ? 'opencg-tab active' : 'opencg-tab',
                onClick: () => switchTab('ds'),
                onPointerDown: (e) => e.stopPropagation(),
              }, 'DeepSeek'),
              React.createElement('button', {
                type: 'button',
                className: tab === 'go' ? 'opencg-tab active' : 'opencg-tab',
                onClick: () => switchTab('go'),
                onPointerDown: (e) => e.stopPropagation(),
              }, 'OpenCode Go'),
            ),
            React.createElement('button', {
              type: 'button',
              className: 'opencg-refresh',
              title: '立即刷新',
              'aria-label': '立即刷新',
              onPointerDown: (e) => e.stopPropagation(),
              onClick: (e) => { e.stopPropagation(); refresh(); },
            }, '↻'),
          );

          const hint = React.createElement('div', { className: 'opencg-hint', key: 'tip' },
            '点击面板刷新 · 拖动 · 右下角调整大小');

          let tip = '余额悬浮窗';
          if (tab === 'go') {
            const parts = [];
            if (go) {
              for (const pair of [['月度', go.monthly], ['滚动', go.rolling], ['每周', go.weekly]]) {
                const w = pair[1];
                if (w && typeof w.percent === 'number') parts.push(pair[0] + '剩余' + Math.round(100 - w.percent) + '%');
              }
              if (parts.length) tip = 'OpenCode Go: ' + parts.join(' · ');
              if (go.stale) tip += ' · 数据过期';
            }
            if (use && use.last) tip += (parts.length ? ' · ' : '') + '最近: ' + (use.last.title || '(未命名会话)');
          } else {
            if (ds) {
              tip = 'DeepSeek 余额 ' + dsBalanceText + (ds.model ? ' · ' + ds.model : '')
                + ' · 预计剩余 ' + fmtTokens(ds.estTokens) + ' tokens（按 ¥' + ds.pricePerMillion + '/百万估算）';
              if (ds.stale) tip += ' · 数据过期';
            } else if (dsErr) tip = 'DeepSeek 余额获取失败：' + dsErr + '（点击重试）';
          }

          const resizeHandle = React.createElement('div', {
            key: 'rz',
            className: 'opencg-resize',
            title: '调整大小',
            'aria-label': '调整大小',
            onPointerDown: onResizeDown,
            onPointerMove: onResizeMove,
            onPointerUp: onResizeUp,
          });

          return React.createElement('div', {
            className: (dragging ? 'opencg dragging ' : 'opencg ') + (resizing ? 'resizing' : ''),
            style: {
              left: (pos ? pos.x : 16) + 'px',
              bottom: (pos ? pos.y : 168) + 'px',
              width: size.w + 'px',
              height: size.h + 'px',
            },
            title: tip,
            'aria-label': tip,
            onPointerDown,
            onPointerMove,
            onPointerUp,
          }, header, body, hint, resizeHandle);
        },
      )), 'opencode-go-monitor: overlay slot');
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
