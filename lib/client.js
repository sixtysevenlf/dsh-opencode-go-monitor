/**
 * OpenCode Go 余额悬浮窗 —— client 半
 * 注册到全局悬浮层 shell.overlay，同源 fetch 调用 host 半接口：
 *   /api/opencode-go/balance（月度/滚动/每周额度，60s 轮询）
 *   /api/opencode-go/usage   （本地用量，5s 轮询）
 * 可拖动（位置记忆）、右下角手动调整大小（尺寸记忆），风格与余额悬浮窗一致。
 */
window.__OCGM_LOADED = true;
console.log('[opencode-go-monitor] bundle executed');
window.__ModuleLoader__.load({
  id: 'dsh-opencode-go-monitor',
  factory: (require) => {
    console.log('[opencode-go-monitor] factory running');
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
  min-width: 200px;
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
.opencg-title { font-weight: 600; }
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
.opencg-row {
  display: grid;
  grid-template-columns: 34px 48px 1fr 44px 74px;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  line-height: 1.7;
  white-space: nowrap;
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
      } catch (e) { /* 位置记忆为可选项 */ }
      return null;
    }
    function loadSize() {
      try {
        const raw = localStorage.getItem(KEY_SIZE);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.w === 'number' && typeof parsed.h === 'number') {
            return {
              w: Math.max(200, Math.min(520, parsed.w)),
              h: Math.max(118, Math.min(600, parsed.h)),
            };
          }
        }
      } catch (e) { /* 尺寸记忆为可选项 */ }
      return { w: 250, h: 150 };
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
      console.log('[opencode-go-monitor] apply start, slots=', !!ctx.slots, 'timer=', !!ctx.interval);
      window.__OCGM_APPLIED = true;
      ctx.effect(() => {
        try {
          ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'opencode-go-monitor', order: 0, label: 'OpenCode Go 余额' },
        (props) => {
          const [bal, setBal] = React.useState(null);
          const [balErr, setBalErr] = React.useState(null);
          const [use, setUse] = React.useState(null);
          const [useErr, setUseErr] = React.useState(null);
          const [pos, setPos] = React.useState(loadPos);
          const [size, setSize] = React.useState(loadSize);
          const [dragging, setDragging] = React.useState(false);
          const [resizing, setResizing] = React.useState(false);
          const dragRef = React.useRef(null);
          const resizeRef = React.useRef(null);
          const sizeRef = React.useRef(size);

          const applySize = (next) => {
            sizeRef.current = next;
            setSize(next);
          };

          const refreshBal = React.useCallback(async () => {
            try {
              const res = await fetch('/api/opencode-go/balance');
              const data = await res.json();
              if (data && (data.ok || data.stale)) {
                setBal(data);
                setBalErr(null);
              } else {
                setBal(null);
                setBalErr(data && data.error ? data.error : '获取失败');
              }
            } catch (e) {
              setBal(null);
              setBalErr(String((e && e.message) || e));
            }
          }, []);

          const refreshUse = React.useCallback(async () => {
            try {
              const res = await fetch('/api/opencode-go/usage');
              const data = await res.json();
              if (data && data.ok) {
                setUse(data);
                setUseErr(null);
              } else {
                setUseErr(data && data.error ? data.error : '获取失败');
              }
            } catch (e) {
              setUseErr(String((e && e.message) || e));
            }
          }, []);

          const refresh = React.useCallback(() => {
            refreshBal();
            refreshUse();
          }, [refreshBal, refreshUse]);

          React.useEffect(() => {
            refresh();
            const stop1 = ctx.interval(refreshBal, 60000);
            const stop2 = ctx.interval(refreshUse, 5000);
            return () => { stop1(); stop2(); };
          }, [refresh, refreshBal, refreshUse]);

          // ---- 拖动（位置记忆） ----
          const onPointerDown = (e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = {
              sx: e.clientX,
              sy: e.clientY,
              bx: pos ? pos.x : 16,
              by: pos ? pos.y : 168,
            };
            setDragging(true);
          };
          const onPointerMove = (e) => {
            const d = dragRef.current;
            if (!d) return;
            const next = { x: d.bx + (e.clientX - d.sx), y: d.by - (e.clientY - d.sy) };
            setPos(next);
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

          // ---- 右下角调整大小（尺寸记忆） ----
          const onResizeDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            resizeRef.current = {
              sx: e.clientX,
              sy: e.clientY,
              sw: sizeRef.current.w,
              sh: sizeRef.current.h,
            };
            setResizing(true);
          };
          const onResizeMove = (e) => {
            const d = resizeRef.current;
            if (!d) return;
            const w = Math.max(200, Math.min(520, d.sw + (e.clientX - d.sx)));
            const h = Math.max(118, Math.min(600, d.sh - (e.clientY - d.sy)));
            applySize({ w, h });
          };
          const onResizeUp = (e) => {
            const d = resizeRef.current;
            resizeRef.current = null;
            setResizing(false);
            if (d) {
              try { localStorage.setItem(KEY_SIZE, JSON.stringify(sizeRef.current)); } catch (e2) { /* 可选项 */ }
            }
          };

          // ---- 渲染 ----
          const dotClass = (balErr || useErr)
            ? 'opencg-dot err'
            : (bal ? 'opencg-dot' : 'opencg-dot idle');

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
              React.createElement('span', { className: 'opencg-rem', style: rem != null ? { color } : undefined },
                rem != null ? rem + '%' : '--'),
              bar,
              React.createElement('span', { className: 'opencg-used' },
                used != null ? '已用' + Math.round(used) + '%' : (w && w.status ? w.status : '')),
              React.createElement('span', { className: 'opencg-reset' },
                w && w.resetsAt ? fmtReset(w.resetsAt) : ''),
            );
          };

          const header = React.createElement('div', { className: 'opencg-header', key: 'h' },
            React.createElement('span', { className: dotClass }),
            React.createElement('span', { className: 'opencg-title' }, 'OpenCode Go 余额'),
            React.createElement('button', {
              type: 'button',
              className: 'opencg-refresh',
              title: '立即刷新',
              'aria-label': '立即刷新',
              onPointerDown: (e) => e.stopPropagation(),
              onClick: (e) => { e.stopPropagation(); refresh(); },
            }, '↻'),
          );

          const bodyChildren = [];
          bodyChildren.push(quotaRow('m', '月度', bal && bal.monthly));
          bodyChildren.push(quotaRow('r', '滚动', bal && bal.rolling));
          bodyChildren.push(quotaRow('w', '每周', bal && bal.weekly));
          bodyChildren.push(React.createElement('div', { className: 'opencg-sep', key: 'sep' }));
          const today = use && use.today;
          const total = use && use.total;
          if (today) {
            const newTok = today.input + today.output + today.reasoning;
            bodyChildren.push(React.createElement('div', { className: 'opencg-usage', key: 'u1' },
              '今日 ' + fmtTokens(newTok) + ' tok · $' + today.cost.toFixed(4) + ' · ' + today.msgs + ' 条'));
          }
          if (total) {
            bodyChildren.push(React.createElement('div', { className: 'opencg-usage dim', key: 'u2' },
              '累计 ' + fmtTokens(total.input + total.output + total.reasoning) + ' tok · $' + total.cost.toFixed(4) + ' · ' + total.sessions + ' 会话'));
          }
          const statusText = (balErr ? '余额失败' : (bal ? '余额 ' + fmtTime(bal.fetchedAt) : '余额 --'))
            + ' · '
            + (useErr ? '用量失败' : (use ? '用量 ' + fmtTime(use.ts) : '用量 --'))
            + (bal && bal.stale ? ' · 数据过期' : '');
          bodyChildren.push(React.createElement('div', {
            className: (balErr || useErr) ? 'opencg-status err' : 'opencg-status',
            key: 'st',
            title: (balErr ? '余额: ' + balErr : '') + ((balErr && useErr) ? '\n' : '') + (useErr ? '用量: ' + useErr : ''),
          }, statusText));
          bodyChildren.push(React.createElement('div', { className: 'opencg-hint', key: 'tip' },
            '按住拖动 · 右下角调整大小 · 余额每 60s'));

          const body = React.createElement('div', { className: 'opencg-body', key: 'body' }, bodyChildren);

          const resizeHandle = React.createElement('div', {
            key: 'rz',
            className: 'opencg-resize',
            title: '调整大小',
            'aria-label': '调整大小',
            onPointerDown: onResizeDown,
            onPointerMove: onResizeMove,
            onPointerUp: onResizeUp,
          });

          let tip = 'OpenCode Go 余额';
          const parts = [];
          if (bal) {
            for (const pair of [['月度', bal.monthly], ['滚动', bal.rolling], ['每周', bal.weekly]]) {
              const w = pair[1];
              if (w && typeof w.percent === 'number') {
                parts.push(pair[0] + '剩余' + Math.round(100 - w.percent) + '%');
              }
            }
            if (parts.length) tip = parts.join(' · ');
            if (bal.stale) tip += ' · 数据过期';
          }
          if (use && use.last) {
            tip += (parts.length ? ' · ' : '') + '最近: ' + (use.last.title || '(未命名会话)');
          }

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
          }, header, body, resizeHandle);
        },
      ));
          console.log('[opencode-go-monitor] overlay slot registered');
        } catch (e) {
          window.__OCGM_ERROR = String((e && e.stack) || e);
          console.error('[opencode-go-monitor] slot inject failed:', e);
        }
      }, 'opencode-go-monitor: overlay effect');
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
