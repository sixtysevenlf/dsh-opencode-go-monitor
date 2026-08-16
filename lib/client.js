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
.opencg-mini {
  border: 1px solid var(--dsw-alias-border-l2, #ccc);
  background: var(--dsw-specific-tip, transparent);
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 10px;
  line-height: 1.4;
  padding: 1px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.opencg-mini:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.14)); }
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
    const SETTINGS_KEY = 'dsh-opencode-go-monitor:settings';
    const DEFAULT_SETTINGS = { visible: true, saveMode: false, costLimit: 0, tokenLimit: 0, hourlyTokenLimit: 0, autoMode: 'off', peakMaxTokensOn: false, peakMaxTokens: 0, soundAlert: true };
    const settingsListeners = new Set();

    function loadSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const s = { ...DEFAULT_SETTINGS, ...parsed };
          // 旧版迁移：autoLimit=true → 7天平均模式
          if (parsed.autoMode === undefined && parsed.autoLimit === true) s.autoMode = '7d';
          return s;
        }
      } catch (e) { /* 可选项 */ }
      return { ...DEFAULT_SETTINGS };
    }
    function saveSettings(next) {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) { /* 可选项 */ }
      for (const fn of [...settingsListeners]) { try { fn(next); } catch (e2) { /* ignore */ } }
    }
    function subscribeSettings(fn) {
      settingsListeners.add(fn);
      return () => settingsListeners.delete(fn);
    }

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
    // 距额度重置的倒计时文本
    const fmtLeft = (iso) => {
      if (!iso) return '';
      const diff = new Date(iso).getTime() - Date.now();
      if (!Number.isFinite(diff)) return '';
      if (diff <= 0) return '已重置';
      const s = Math.floor(diff / 1000);
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
      if (d > 0) return d + '天' + h + 'h';
      if (h > 0) return h + 'h' + (m > 0 ? m + 'm' : '');
      if (m > 0) return m + 'm' + (s % 60 > 0 ? s % 60 + 's' : '');
      return s + 's';
    };
    // 语音提醒（TTS）：接近限额小音量 / 达到限额大音量
    const speak = (text, volume) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.volume = volume;
        u.rate = 1;
        synth.cancel();
        synth.speak(u);
      } catch (e) { /* 忽略 */ }
    };

    // 设置行：显示开关 + 省钱模式 + 每日限额（设置 → 常规）
    function BalanceSettingsRow() {
      const [settings, setSettings] = React.useState(loadSettings);
      const update = (patch) => {
        const next = { ...settings, ...patch };
        setSettings(next);
        saveSettings(next);
      };
      const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
      };
      const inputStyle = { width: 84, font: 'inherit', fontSize: 12 };
      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 0' } },
        React.createElement('div', { key: 'r1', style: { display: 'flex', alignItems: 'center', gap: 10 } },
          React.createElement('span', { key: 'l', style: { flex: 1, fontSize: 13 } },
            '余额悬浮窗（DeepSeek / OpenCode Go）'),
          React.createElement('input', {
            key: 'vis',
            type: 'checkbox',
            checked: settings.visible !== false,
            onChange: (e) => update({ visible: e.target.checked }),
          }),
        ),
        React.createElement('div', { key: 'r2', style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 } },
          React.createElement('span', { key: 'sm', style: { flex: 1, color: 'var(--dsw-alias-label-secondary,#888)' } },
            '省钱模式（限额 + 时段分析）'),
          React.createElement('input', {
            key: 'smcb',
            type: 'checkbox',
            checked: settings.saveMode === true,
            onChange: (e) => update({ saveMode: e.target.checked }),
          }),
        ),
        React.createElement('div', { key: 'r3', style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 } },
          React.createElement('span', { key: 'cl', style: { color: 'var(--dsw-alias-label-secondary,#888)' } }, '每日金额上限 $'),
          React.createElement('input', {
            key: 'cost',
            type: 'number',
            min: 0,
            step: 0.01,
            style: inputStyle,
            value: settings.costLimit || '',
            placeholder: '不限',
            onChange: (e) => update({ costLimit: num(e.target.value) }),
          }),
          React.createElement('span', { key: 'tl', style: { color: 'var(--dsw-alias-label-secondary,#888)' } }, '每日 tok 上限'),
          React.createElement('input', {
            key: 'tok',
            type: 'number',
            min: 0,
            step: 1000,
            style: inputStyle,
            value: settings.tokenLimit || '',
            placeholder: '不限',
            onChange: (e) => update({ tokenLimit: num(e.target.value) }),
          }),
        ),
        React.createElement('div', { key: 'r4', style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 } },
          React.createElement('span', { key: 'hl', style: { color: 'var(--dsw-alias-label-secondary,#888)' } },
            '每小时 tok 上限（高峰自动减半）'),
          React.createElement('input', {
            key: 'htok',
            type: 'number',
            min: 0,
            step: 1000,
            style: inputStyle,
            value: settings.hourlyTokenLimit || '',
            placeholder: '不限',
            onChange: (e) => update({ hourlyTokenLimit: num(e.target.value) }),
          }),
        ),
        React.createElement('div', { key: 'r5', style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 } },
          React.createElement('span', { key: 'al', style: { flex: 1, color: 'var(--dsw-alias-label-secondary,#888)' } },
            '自动限额'),
          React.createElement('select', {
            key: 'alm',
            style: { font: 'inherit', fontSize: 12, width: 120 },
            value: settings.autoMode,
            onChange: (e) => update({ autoMode: e.target.value }),
          },
            React.createElement('option', { value: 'off' }, '关闭'),
            React.createElement('option', { value: '7d' }, '7 天平均'),
            React.createElement('option', { value: 'hourly' }, '单日小时平均'),
          ),
        ),
        React.createElement('div', { key: 'r6', style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 } },
          React.createElement('span', {
            key: 'mtl',
            style: { color: 'var(--dsw-alias-label-secondary,#888)', cursor: 'help' },
            title: '额外功能：高峰时段把 DSH 每次回复的输出硬性截断在设定值内，任务可能被打断（不丢会话历史）',
          }, '高峰限 max_tokens（额外功能）'),
          React.createElement('input', {
            key: 'mton',
            type: 'checkbox',
            checked: settings.peakMaxTokensOn === true,
            onChange: (e) => {
              if (e.target.checked) {
                const ok = window.confirm(
                  '⚠ 额外功能确认\n\n开启后，高峰时段（09:00-12:00 / 14:00-18:00）DSH 每次回复的输出会被硬性截断在 max_tokens 值内。\n\n代价：高峰时段的任务可能被中途打断（会话历史不丢失）。\n\n确定开启？',
                );
                if (!ok) return;
              }
              update({ peakMaxTokensOn: e.target.checked });
            },
          }),
          React.createElement('input', {
            key: 'mtv',
            type: 'number',
            min: 0,
            step: 1024,
            style: inputStyle,
            value: settings.peakMaxTokens || '',
            placeholder: '关闭',
            onChange: (e) => update({ peakMaxTokens: num(e.target.value) }),
          }),
        ),
        React.createElement('div', { key: 'r7', style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 } },
          React.createElement('span', { key: 'sl', style: { flex: 1, color: 'var(--dsw-alias-label-secondary,#888)' } },
            '语音提醒（接近2%小音量 / 超限大音量）'),
          React.createElement('input', {
            key: 'slt',
            type: 'checkbox',
            checked: settings.soundAlert !== false,
            onChange: (e) => update({ soundAlert: e.target.checked }),
          }),
        ),
      );
    }

    function apply(ctx) {
      // 注册设置行
      const slotsSvc = ctx.get('slots');
      if (slotsSvc !== void 0) {
        ctx.effect(() => slotsSvc.inject('settings.general.item', () => slotsSvc.register(
          { name: 'settings.general.item', id: 'opencode-go-monitor', order: 80 },
          BalanceSettingsRow,
        )), 'opencode-go-monitor: settings row');
      }
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

          // 设置 → 常规：显示/隐藏 + 省钱模式 + 限额（订阅全部设置项）
          const [settings, setSettings] = React.useState(loadSettings);
          React.useEffect(() => subscribeSettings((s) => setSettings(s)), []);

          // 自动限额：7天平均 或 单日小时平均（小时模式高峰时段自动减半 tok 上限）
          React.useEffect(() => {
            const mode = settings.autoMode;
            if (mode === 'off') return;
            const h = use && use.history;
            if (!h) return;
            if (mode === '7d') {
              if (!h.avg) return;
              const nextTok = h.avg.tokens;
              const nextCost = Math.round(h.avg.cost * 100) / 100;
              if (settings.tokenLimit !== nextTok || settings.costLimit !== nextCost) {
                saveSettings({ ...settings, tokenLimit: nextTok, costLimit: nextCost });
              }
            } else if (mode === 'hourly') {
              if (!h.refDay) return;
              const nextHour = Math.max(1, Math.round(h.refDay.tokens / 24));
              const nextTok = h.refDay.tokens;
              const nextCost = Math.round(h.refDay.cost * 100) / 100;
              if (settings.hourlyTokenLimit !== nextHour || settings.tokenLimit !== nextTok || settings.costLimit !== nextCost) {
                saveSettings({ ...settings, hourlyTokenLimit: nextHour, tokenLimit: nextTok, costLimit: nextCost });
              }
            }
          }, [use, settings]);

          // 每秒滴答：驱动额度重置倒计时
          const [, setTick] = React.useState(0);
          React.useEffect(() => ctx.interval(() => setTick((t) => t + 1), 1000), []);

          // 高峰 max_tokens 强制：同步配置到 host（挂载时 + 设置变化时）
          React.useEffect(() => {
            const cap = settings.peakMaxTokensOn === true ? (Number(settings.peakMaxTokens) || 0) : 0;
            fetch('/api/opencode-go/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ peakMaxTokens: cap }),
            }).catch(() => { /* 下次重试 */ });
          }, [settings.peakMaxTokensOn, settings.peakMaxTokens]);

          const switchTab = (next) => {
            setTab((prev) => {
              if (prev === next) return prev;
              setDir(next === 'go' ? 'right' : 'left');
              return next;
            });
          };

          // 语音限额提醒：接近（剩余≤2%）小音量 / 达到（超限）大音量，各自触发一次
          const alertRef = React.useRef({ near: {}, over: {} });
          React.useEffect(() => {
            if (settings.saveMode !== true || settings.soundAlert === false) {
              alertRef.current = { near: {}, over: {} };
              return;
            }
            const a = use && use.analysis;
            if (!a || !a.today) return;
            const st = alertRef.current;
            const hourlyCapRaw = Number(settings.hourlyTokenLimit) || 0;
            const isPeakNow = a.current && a.current.status === 'peak';
            const effHour = (settings.autoMode === 'hourly' && hourlyCapRaw > 0 && isPeakNow)
              ? Math.max(1, Math.round(hourlyCapRaw / 2))
              : hourlyCapRaw;
            const check = (key, used, cap, nearText, overText) => {
              if (cap <= 0) return;
              const ratio = used / cap;
              if (ratio >= 1) {
                if (!st.over[key]) { st.over[key] = true; speak(overText, 1); }
              } else if (ratio >= 0.98) {
                if (!st.near[key]) { st.near[key] = true; speak(nearText, 0.3); }
              } else {
                st.near[key] = false;
                st.over[key] = false;
              }
            };
            check('cost', a.today.cost, Number(settings.costLimit) || 0,
              '今日金额已用百分之九十八，即将达到上限', '今日金额已达上限，建议停止使用');
            check('tok', a.today.tokens, Number(settings.tokenLimit) || 0,
              '今日token已用百分之九十八，即将达到上限', '今日token已达上限，建议停止使用');
            check('hour', (a.hourNow && a.hourNow.tokens) || 0, effHour,
              '本小时token即将达到上限',
              isPeakNow ? '高峰时段token上限已到，建议暂停或等待空闲时段' : '本小时token已达上限');
          }, [use, settings]);

          if (settings.visible === false) return null;

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
              React.createElement('span', {
                className: 'opencg-reset',
                title: w && w.resetsAt ? '重置: ' + fmtReset(w.resetsAt) : '',
              }, w && w.resetsAt ? fmtLeft(w.resetsAt) : ''),
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

          const an = use && use.analysis;

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
          // DeepSeek 官方高低价时段（北京时间高峰 09-12 / 14-18，空闲半价）
          if (an && an.windows) {
            const cur = an.current;
            const isPeakNow = cur && cur.status === 'peak';
            const mins = cur ? cur.nextChangeMin : 0;
            const fmtMin = (m) => (m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60 ? m % 60 + 'm' : '') : m + 'm');
            dsChildren.push(React.createElement('div', { className: 'opencg-row simple', key: 'w1' },
              React.createElement('span', { className: 'opencg-name' }, '官方时段'),
              React.createElement('span', { style: { fontSize: 11 } }, '高峰 09-12 / 14-18 (UTC+8) · 空闲半价')));
            dsChildren.push(React.createElement('div', { className: 'opencg-row simple', key: 'w2' },
              React.createElement('span', { className: 'opencg-name' }, '当前时段'),
              React.createElement('span', { style: { fontSize: 11, fontWeight: 600, color: isPeakNow ? '#D97706' : '#16A34A' } },
                isPeakNow ? '高峰 · 距空闲 ' + fmtMin(mins) : '空闲(半价) · 距高峰 ' + fmtMin(mins))));
          }
          // ---- 省钱分析（常驻显示） ----
          if (an) {
            const isPeakNow = an.current && an.current.status === 'peak';
            const peakRatio = an.today.msgs > 0 ? Math.round((an.peak.msgs / an.today.msgs) * 100) : 0;
            dsChildren.push(React.createElement('div', {
              key: 'an1',
              style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary,#888)', marginTop: 3 },
            }, '时段分布: 高峰 ' + an.peak.msgs + ' 次 · 空闲 ' + an.offpeak.msgs + ' 次'
              + (peakRatio > 0 ? '（高峰占 ' + peakRatio + '%）' : '')));
            let advice;
            if (an.peak.msgs > 0) {
              advice = '建议: 高峰 ' + an.peak.msgs + ' 次挪到空闲可省 ~$' + an.savingsEstimate.toFixed(4) + '/日（半价）';
            } else if (isPeakNow) {
              advice = '建议: 当前高峰时段(2倍价)，重任务等空闲再跑';
            } else {
              advice = '建议: 当前空闲时段(半价)，适合跑重任务';
            }
            dsChildren.push(React.createElement('div', { key: 'an2', style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary,#888)' } }, advice));
            if (use && use.history && use.history.avg) {
              const h = use.history;
              let autoInfo = '';
              if (settings.autoMode === '7d') {
                autoInfo = '（自动限额: 7天平均 · tok ' + fmtTokens(settings.tokenLimit) + ' · $' + Number(settings.costLimit).toFixed(2) + '）';
              } else if (settings.autoMode === 'hourly') {
                const hc = Number(settings.hourlyTokenLimit) || 0;
                autoInfo = '（自动限额: 单日小时平均 · 每小时 ' + fmtTokens(hc)
                  + ' tok，高峰自动减半→' + fmtTokens(Math.max(1, Math.round(hc / 2))) + '）';
              }
              dsChildren.push(React.createElement('div', {
                key: 'an3',
                style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary,#888)' },
              }, '近7天日均: ' + fmtTokens(h.avg.tokens) + ' tok · $' + h.avg.cost.toFixed(3) + '/日' + autoInfo));
            }
            if (settings.peakMaxTokensOn === true) {
              const mtCap = Number(settings.peakMaxTokens) || 0;
              const enf = use && use.enforcement;
              dsChildren.push(React.createElement('div', {
                key: 'an4',
                style: { fontSize: 10, color: enf && enf.active ? '#D97706' : 'var(--dsw-alias-label-secondary,#888)' },
              }, '高峰 max_tokens: ' + mtCap + (enf ? (enf.active ? '（生效中）' : '（空闲已恢复）') : '（同步中）')));
            }
          }
          // ---- 省钱：限额监控（金额 + tok，省钱模式开启时显示进度条） ----
          const saveOn = settings.saveMode === true;
          const autoMode = settings.autoMode;
          const isPeakNowAny = an && an.current && an.current.status === 'peak';
          if (saveOn && an && an.today) {
            const cost = an.today.cost;
            const costCap = Number(settings.costLimit) || 0;
            const tokens = an.today.tokens;
            const tokenCap = Number(settings.tokenLimit) || 0;
            const hourTok = (an.hourNow && an.hourNow.tokens) || 0;
            const hourlyCapRaw = Number(settings.hourlyTokenLimit) || 0;
            // 单日小时平均模式：高峰时段每小时 tok 上限自动减半（花费等价）
            const effHourlyCap = (autoMode === 'hourly' && hourlyCapRaw > 0 && isPeakNowAny)
              ? Math.max(1, Math.round(hourlyCapRaw / 2))
              : hourlyCapRaw;
            const costOver = costCap > 0 && cost > costCap;
            const tokenOver = tokenCap > 0 && tokens > tokenCap;
            const hourOver = effHourlyCap > 0 && hourTok > effHourlyCap;
            const over = costOver || tokenOver || hourOver;
            const budgetRow = (label, text, used, cap) => React.createElement('div', {
              key: label,
              style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, lineHeight: 1.7, whiteSpace: 'nowrap' },
            },
              React.createElement('span', { style: { width: 34, color: 'var(--dsw-alias-label-secondary,#888)' } }, label),
              React.createElement('span', { style: { width: 104, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }, text),
              cap > 0
                ? React.createElement('div', {
                    style: { flex: 1, height: 5, borderRadius: 3, background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,.18))', overflow: 'hidden' },
                  }, React.createElement('div', {
                    style: {
                      height: '100%', borderRadius: 3,
                      background: used > cap ? '#DC2626' : '#16A34A',
                      width: Math.min(100, (used / cap) * 100) + '%',
                    },
                  }))
                : React.createElement('span', { style: { flex: 1 } }),
            );
            dsChildren.push(budgetRow('金额', '$' + cost.toFixed(4) + (costCap > 0 ? '/$' + costCap.toFixed(2) : ''), cost, costCap));
            dsChildren.push(budgetRow('tok', fmtTokens(tokens) + (tokenCap > 0 ? '/' + fmtTokens(tokenCap) : ''), tokens, tokenCap));
            dsChildren.push(budgetRow('小时', fmtTokens(hourTok) + (effHourlyCap > 0 ? '/' + fmtTokens(effHourlyCap) : ''), hourTok, effHourlyCap));
            if (over) {
              let msg = '⚠ 已达上限，建议暂停使用';
              if (hourOver && isPeakNowAny) msg = '⚠ 本小时已达高峰 tok 上限（自动减半），建议暂停或等空闲时段';
              else if (hourOver) msg = '⚠ 本小时已达 tok 上限';
              else if (tokenOver) msg = '⚠ 今日 tok 已达上限';
              else if (costOver) msg = '⚠ 今日金额已达上限';
              dsChildren.push(React.createElement('div', {
                key: 'over',
                style: { fontSize: 11, fontWeight: 600, color: '#DC2626' },
              }, msg));
            }
          }
          dsChildren.push(React.createElement('div', { key: 'save-btns', style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 } },
            React.createElement('button', {
              type: 'button',
              className: 'opencg-mini',
              title: '开关省钱模式（限额进度条）',
              onPointerDown: (e) => e.stopPropagation(),
              onClick: (e) => {
                e.stopPropagation();
                const s = loadSettings();
                saveSettings({ ...s, saveMode: !s.saveMode });
              },
            }, saveOn ? '省钱:开' : '省钱:关'),
            React.createElement('button', {
              type: 'button',
              className: 'opencg-mini',
              title: '自动限额：7天平均 / 单日小时平均（高峰自动减半 tok）',
              onPointerDown: (e) => e.stopPropagation(),
              onClick: (e) => {
                e.stopPropagation();
                const s = loadSettings();
                const next = s.autoMode === 'off' ? '7d' : (s.autoMode === '7d' ? 'hourly' : 'off');
                saveSettings({ ...s, autoMode: next });
              },
            }, autoMode === '7d' ? '自动:7天' : (autoMode === 'hourly' ? '自动:小时' : '自动:关')),
            React.createElement('button', {
              type: 'button',
              className: 'opencg-mini',
              title: '把上限设为今日已用量（金额 + tok，超限提醒）',
              onPointerDown: (e) => e.stopPropagation(),
              onClick: (e) => {
                e.stopPropagation();
                const s = loadSettings();
                if (an && an.today) {
                  saveSettings({
                    ...s,
                    saveMode: true,
                    tokenLimit: an.today.tokens,
                    costLimit: Math.round(an.today.cost * 100) / 100,
                  });
                }
              },
            }, '一键限额'),
          ));
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
