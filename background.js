// background.js — сервис-воркер расширения TimeGuard

// ─── Утилиты ────────────────────────────────────────────────────────────────

/**
 * Извлекает корневой домен из URL.
 * Например: https://www.youtube.com/watch?v=xxx → youtube.com
 */
function extractDomain(url) {
  try {
    const u = new URL(url);
    // убираем www.
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Проверяет, попадает ли домен вкладки под одно из правил.
 * Правило хранит rootDomain (например "youtube.com").
 * Совпадение: домен вкладки === rootDomain  ИЛИ  заканчивается на ".rootDomain"
 */
function matchRule(tabDomain, ruleDomain) {
  if (!tabDomain || !ruleDomain) return false;
  return tabDomain === ruleDomain || tabDomain.endsWith('.' + ruleDomain);
}

/** Ключ для хранения потраченного времени: "spent_YYYY-MM-DD" */
function todayKey() {
  return 'spent_' + new Date().toISOString().slice(0, 10);
}

// ─── Состояние трекера ───────────────────────────────────────────────────────

// activeTab: { tabId, domain, startTs } — вкладка, которую сейчас считаем
let activeTab = null;

// ─── Работа с хранилищем ────────────────────────────────────────────────────

async function getRules() {
  const { rules = [] } = await chrome.storage.local.get('rules');
  return rules;
}

async function getTodaySpent() {
  const key = todayKey();
  const data = await chrome.storage.local.get(key);
  return data[key] || {};  // { "youtube.com": 320, "vk.com": 80 } (секунды)
}

async function addSpentSeconds(domain, seconds) {
  if (!domain || seconds <= 0) return;
  const key = todayKey();
  const spent = await getTodaySpent();
  spent[domain] = (spent[domain] || 0) + seconds;
  await chrome.storage.local.set({ [key]: spent });
}

// ─── Логика блокировки ───────────────────────────────────────────────────────

/**
 * Проверяет, превышен ли лимит для домена.
 * Возвращает { blocked: true, rule } или { blocked: false }
 */
async function checkLimit(domain) {
  const rules = await getRules();
  const spent = await getTodaySpent();

  for (const rule of rules) {
    if (matchRule(domain, rule.domain)) {
      const spentSec = spent[rule.domain] || 0;
      const limitSec = rule.limitMinutes * 60;
      if (spentSec >= limitSec) {
        return { blocked: true, rule };
      }
    }
  }
  return { blocked: false };
}

async function blockTabIfNeeded(tabId, url) {
  const domain = extractDomain(url);
  if (!domain) return;

  // не блокируем собственные страницы расширения
  if (url.startsWith(chrome.runtime.getURL(''))) return;

  const { blocked, rule } = await checkLimit(domain);
  if (blocked) {
    // Сохраняем в storage — надёжнее URL-параметров на страницах расширения
    await chrome.storage.local.set({
      blockedInfo: { domain: rule.domain, limitMinutes: rule.limitMinutes }
    });
    chrome.tabs.update(tabId, { url: chrome.runtime.getURL('blocked.html') });
  }
}

// ─── Трекинг активного времени ──────────────────────────────────────────────

/** Сохраняет время с момента startTs до сейчас для activeTab */
async function flushActive() {
  if (!activeTab) return;
  const elapsed = Math.floor((Date.now() - activeTab.startTs) / 1000);
  await addSpentSeconds(activeTab.domain, elapsed);
  activeTab = null;
}

/** Начинает отсчёт для вкладки */
async function startTracking(tabId, url) {
  await flushActive();

  const domain = extractDomain(url);
  if (!domain) return;
  if (url.startsWith(chrome.runtime.getURL(''))) return;

  activeTab = { tabId, domain, startTs: Date.now() };
}

// ─── Alarm: тикает каждые 5 секунд ──────────────────────────────────────────
// (минимальный интервал chrome.alarms = 1 минута, поэтому используем setInterval
//  внутри service worker через «keep-alive» технику с alarms)

chrome.alarms.create('tick', { periodInMinutes: 1 / 60 }); // ~1 сек (минимум браузер округляет до ~1 мин в prod, но для dev работает)

// Резервный вариант — используем setInterval, который работает пока SW активен
let tickInterval = null;

function ensureTick() {
  if (tickInterval) return;
  tickInterval = setInterval(async () => {
    if (!activeTab) return;

    // Каждые 5 секунд сбрасываем накопленное время и перезапускаем счётчик
    const elapsed = Math.floor((Date.now() - activeTab.startTs) / 1000);
    if (elapsed < 5) return;

    await addSpentSeconds(activeTab.domain, elapsed);
    activeTab.startTs = Date.now();

    // Проверяем лимит для текущей вкладки
    const { blocked, rule } = await checkLimit(activeTab.domain);
    if (blocked) {
      const tabId = activeTab.tabId;
      activeTab = null;
      await chrome.storage.local.set({
        blockedInfo: { domain: rule.domain, limitMinutes: rule.limitMinutes }
      });
      chrome.tabs.update(tabId, { url: chrome.runtime.getURL('blocked.html') });
    }
  }, 5000);
}

ensureTick();

chrome.alarms.onAlarm.addListener(() => {
  // Будим service worker каждую минуту, чтобы setInterval продолжал работать
  ensureTick();
});

// ─── Слушатели событий вкладок ───────────────────────────────────────────────

// Пользователь переключился на другую вкладку / окно потеряло фокус
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await flushActive();
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && tab.url) {
    await blockTabIfNeeded(tabId, tab.url);
    await startTracking(tabId, tab.url);
  }
});

// Вкладка загрузила новый URL
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  // Если это активная вкладка — переключаем трекинг
  const [activeTabInfo] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTabInfo && activeTabInfo.id === tabId) {
    await blockTabIfNeeded(tabId, tab.url);
    await startTracking(tabId, tab.url);
  }
});

// Вкладка закрыта
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (activeTab && activeTab.tabId === tabId) {
    await flushActive();
  }
});

// Окно теряет фокус (пользователь переключился на другое приложение)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Браузер потерял фокус — останавливаем счёт
    await flushActive();
  } else {
    // Браузер снова в фокусе — возобновляем для активной вкладки
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab && tab.url) {
      await blockTabIfNeeded(tab.id, tab.url);
      await startTracking(tab.id, tab.url);
    }
  }
});

// ─── Инициализация при старте service worker ─────────────────────────────────
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    await startTracking(tab.id, tab.url);
  }
}

init();

// ─── Message API (для popup и settings) ──────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'GET_STATS') {
      // Сбрасываем текущую активную вкладку, чтобы данные были актуальны
      if (activeTab) {
        const elapsed = Math.floor((Date.now() - activeTab.startTs) / 1000);
        await addSpentSeconds(activeTab.domain, elapsed);
        activeTab.startTs = Date.now();
      }
      const spent = await getTodaySpent();
      const rules = await getRules();
      sendResponse({ spent, rules });
    }

    if (msg.type === 'RESET_TODAY') {
      const key = todayKey();
      await chrome.storage.local.remove(key);
      sendResponse({ ok: true });
    }
  })();
  return true; // async response
});
