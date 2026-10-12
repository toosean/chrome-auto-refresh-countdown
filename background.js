/* service worker：只负责把「当前站点是否开启 + 间隔」画到工具栏图标的 badge 上。
   真正的刷新逻辑在 content.js 里；这里不做任何注入。 */
const FALLBACK_MS = 5 * 60 * 1000;

const originOf = (url) => {
  try {
    const u = new URL(url || '');
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch (e) {
    return null;
  }
};

const badgeLabel = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)}s` : `${ms / 60000}m`);

async function paintBadge(tabId, url) {
  try {
    const origin = originOf(url);
    if (!origin) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }
    const key = `site:${origin}`;
    const got = await chrome.storage.local.get([key]);
    const rec = got[key];
    if (rec && rec.enabled) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#2f9e44' });
      await chrome.action.setBadgeText({ tabId, text: badgeLabel(Number(rec.interval) || FALLBACK_MS) });
    } else {
      await chrome.action.setBadgeText({ tabId, text: '' });
    }
  } catch (e) {}
}

async function paintActive() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id != null) await paintBadge(tab.id, tab.url);
  } catch (e) {}
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await paintBadge(tabId, tab.url);
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'loading' || info.status === 'complete' || info.url) paintBadge(tabId, tab.url);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') paintActive();
});

chrome.runtime.onStartup.addListener(paintActive);
chrome.runtime.onInstalled.addListener(paintActive);
