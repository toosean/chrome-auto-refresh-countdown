/* Auto Refresh + Countdown —— 内容脚本（v1.3.0）
   默认：完全不注入任何 DOM，不设任何定时器。
   只有当扩展 popup 里为当前站点开启后，页面才出现一个半透明倒计时胶囊：
     - 胶囊本体鼠标穿透（pointer-events:none），只有右侧「暂停 / 继续」按钮可点
     - 暂停只作用于当前页面（不写 storage）：暂停后倒计时冻结、不再刷新；再点一次按剩余时间继续
       （手动刷新页面会回到运行状态；若希望暂停也跨刷新保留，把 paused 一并写进 storage 即可）
   配置存在 chrome.storage.local：
     { "site:<origin>": { "enabled": true, "interval": 300000 }, "defaultInterval": 300000 } */
(() => {
  'use strict';
  if (window.top !== window.self) return; // 只在顶层文档跑

  const HOST_ID = '__auto_refresh_host__';
  const KEY = 'site:' + location.origin;
  const DEFAULT_MS = 5 * 60 * 1000;
  const MIN_MS = 1000;
  const clamp = (ms) => Math.max(MIN_MS, Number(ms) || DEFAULT_MS);

  const fmt = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // 幂等：同一文档只保留一个实例。扩展热重载后旧实例的 chrome.* 会失效，
  // 此时由新实例接管并先停掉旧实例的定时器，避免双倍刷新。
  const w = window;
  const prev = w.__autoRefreshInstance;
  if (prev && prev.alive()) return;
  try {
    prev?.stop?.();
  } catch (e) {}

  const state = {
    ms: DEFAULT_MS,
    deadline: 0,
    remain: 0,
    paused: false,
    timer: null,
    ticker: null,
    observer: null,
    host: null,
    msEl: null,
    labelEl: null,
    btnEl: null,
    pillEl: null,
    lastTxt: '',
  };

  const render = () => {
    if (!state.msEl) return;
    const txt = fmt(state.paused ? state.remain : state.deadline - Date.now());
    if (txt === state.lastTxt) return;
    state.lastTxt = txt;
    state.msEl.textContent = txt;
  };

  // 把暂停状态同步到胶囊外观（文案 / 指示灯 / 按钮图标与提示）
  const syncUI = () => {
    if (!state.pillEl) return;
    state.pillEl.classList.toggle('paused', state.paused);
    state.labelEl.textContent = state.paused ? '已暂停' : '自动刷新';
    state.btnEl.title = state.paused ? '继续倒计时' : '暂停倒计时';
  };

  const teardown = () => {
    if (state.timer) clearTimeout(state.timer);
    if (state.ticker) clearInterval(state.ticker);
    if (state.observer) state.observer.disconnect();
    state.timer = state.ticker = state.observer = null;
    state.paused = false;
    state.remain = 0;
    document.getElementById(HOST_ID)?.remove();
    state.host = state.msEl = state.labelEl = state.btnEl = state.pillEl = null;
    state.lastTxt = '';
  };

  const build = () => {
    document.getElementById(HOST_ID)?.remove();

    const host = document.createElement('div');
    host.id = HOST_ID;
    // 宿主与胶囊本体都不吃鼠标事件，只有 .pp 按钮重新打开 pointer-events
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;';

    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>
      .pill{pointer-events:none;display:flex;align-items:center;gap:8px;margin:12px;padding:6px 8px 6px 10px;
        font:500 12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#fff;
        background:rgba(20,22,28,.42);border:1px solid rgba(255,255,255,.18);border-radius:999px;
        box-shadow:0 4px 16px rgba(0,0,0,.24);backdrop-filter:blur(10px) saturate(1.3);
        -webkit-backdrop-filter:blur(10px) saturate(1.3);user-select:none;opacity:.9}
      .dot{width:7px;height:7px;border-radius:50%;background:#37d67a;box-shadow:0 0 8px #37d67a}
      .label{opacity:.9}
      .ms{min-width:38px;text-align:right;opacity:.85}
      .pill.paused .dot{background:#ffb020;box-shadow:none}
      .pill.paused .label{opacity:.75}
      .pp{pointer-events:auto;flex:0 0 auto;width:18px;height:18px;margin-left:2px;padding:0;border:0;
        border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;
        cursor:pointer;transition:background .15s ease}
      .pp:hover{background:rgba(255,255,255,.3)}
      .ico{display:block;position:relative;width:8px;height:8px}
      .ico::before,.ico::after{content:"";position:absolute;top:0;width:2px;height:8px;background:#fff;border-radius:1px}
      .ico::before{left:1px}
      .ico::after{right:1px}
      .pill.paused .ico::before{left:2px;top:0;width:0;height:0;background:transparent;
        border-left:7px solid #fff;border-top:4px solid transparent;border-bottom:4px solid transparent}
      .pill.paused .ico::after{display:none}
    </style>
    <div class="pill">
      <span class="dot"></span>
      <span class="label">自动刷新</span>
      <b class="ms">--</b>
      <button class="pp" type="button" title="暂停倒计时"><span class="ico"></span></button>
    </div>`;

    (document.body || document.documentElement).appendChild(host);

    state.host = host;
    state.pillEl = sr.querySelector('.pill');
    state.msEl = sr.querySelector('.ms');
    state.labelEl = sr.querySelector('.label');
    state.btnEl = sr.querySelector('.pp');
    state.btnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      state.paused ? resume() : pause();
    });
  };

  const arm = (ms) => {
    if (state.timer) clearTimeout(state.timer);
    state.deadline = Date.now() + ms;
    state.timer = setTimeout(() => location.reload(), ms);
  };

  const pause = () => {
    if (state.paused) return;
    state.remain = Math.max(0, state.deadline - Date.now());
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.paused = true;
    state.lastTxt = '';
    syncUI();
    render();
  };

  const resume = () => {
    if (!state.paused) return;
    const left = Math.max(MIN_MS, state.remain); // 从剩余时间继续，而不是重新计时
    state.paused = false;
    state.remain = 0;
    arm(left);
    state.lastTxt = '';
    syncUI();
    render();
  };

  const start = (ms) => {
    const v = clamp(ms);
    state.ms = v;
    state.paused = false;
    if (!state.host) build();

    if (state.ticker) clearInterval(state.ticker);
    arm(v);
    state.ticker = setInterval(render, 200);
    state.lastTxt = '';
    syncUI();
    render();

    if (!state.observer) {
      // 有些 SPA 会整块换掉 body，UI 被删掉就补回来（保留暂停状态）
      state.observer = new MutationObserver(() => {
        if (document.getElementById(HOST_ID)) return;
        build();
        state.lastTxt = '';
        syncUI();
        render();
      });
      state.observer.observe(document.documentElement, { childList: true });
    }
  };

  const apply = (rec, defInterval) => {
    const enabled = !!(rec && rec.enabled);
    const interval = clamp((rec && rec.interval) || defInterval || DEFAULT_MS);
    if (enabled) start(interval);
    else teardown(); // 未开启：连带清掉可能残留的旧版 UI，页面保持完全静默
  };

  const read = () => chrome.storage.local.get([KEY, 'defaultInterval']);

  const boot = async () => {
    let got;
    try {
      got = await read();
    } catch (e) {
      return; // 扩展上下文失效，交给下次注入
    }
    apply(got[KEY], got.defaultInterval);

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!(KEY in changes) && !('defaultInterval' in changes)) return;
        read()
          .then((g) => apply(g[KEY], g.defaultInterval))
          .catch(() => {});
      });
    } catch (e) {}
  };

  w.__autoRefreshInstance = {
    alive: () => {
      try {
        return !!chrome.runtime?.id;
      } catch (e) {
        return false;
      }
    },
    stop: teardown,
  };

  boot();
})();
