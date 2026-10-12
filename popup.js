/* popup：逐站点开关 + 间隔（5/10/30/60 分钟）
   写入 chrome.storage.local 后立即生效：
     - 已注入内容脚本的页面靠 storage.onChanged 自己反应
     - 还没注入的页面（例如装扩展前就打开的标签页）靠 scripting.executeScript 补一次注入 */
const PRESETS = [5, 10, 30, 60]; // 分钟
const FALLBACK_MS = 5 * 60 * 1000;
const $ = (id) => document.getElementById(id);

let tab = null;
let origin = null;
let interval = FALLBACK_MS;
let enabled = false;

const originOf = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch (e) {
    return null;
  }
};

const human = (ms) =>
  ms % 60000 === 0 ? `${ms / 60000} 分钟` : ms % 1000 === 0 ? `${ms / 1000} 秒` : `${(ms / 60000).toFixed(1)} 分钟`;

const badgeLabel = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)}s` : `${ms / 60000}m`);

const setHint = (t) => {
  $('hint').textContent = t;
};

const paint = () => {
  $('site').textContent = origin;
  $('toggle').checked = enabled;
  $('stateText').textContent = enabled ? `已开启 · 每 ${human(interval)}` : '未开启';
  for (const b of $('seg').children) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.ms) === interval));
  }
};

const persist = () =>
  chrome.storage.local.set({
    [`site:${origin}`]: { enabled, interval },
    defaultInterval: interval,
  });

const paintBadge = async () => {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#2f9e44' });
    await chrome.action.setBadgeText({ tabId: tab.id, text: enabled ? badgeLabel(interval) : '' });
  } catch (e) {}
};

const injectNow = async () => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ['content.js'] });
  } catch (e) {
    setHint('已开启，但当前页面需要手动刷新一次才会出现倒计时。');
  }
};

const main = async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  origin = originOf(tab && tab.url);

  if (!origin) {
    $('panel').hidden = true;
    $('unsupported').hidden = false;
    return;
  }

  const got = await chrome.storage.local.get([`site:${origin}`, 'defaultInterval']);
  const rec = got[`site:${origin}`];
  enabled = !!(rec && rec.enabled);
  interval = Number((rec && rec.interval) || got.defaultInterval) || FALLBACK_MS;

  for (const m of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${m} 分`;
    b.dataset.ms = String(m * 60000);
    b.addEventListener('click', async () => {
      interval = m * 60000;
      await persist();
      paint();
      await paintBadge();
      if (enabled) await injectNow();
    });
    $('seg').appendChild(b);
  }

  $('toggle').addEventListener('change', async (e) => {
    enabled = e.target.checked;
    await persist();
    paint();
    await paintBadge();
    if (enabled) await injectNow();
  });

  $('panel').hidden = false;
  paint();
};

main();
