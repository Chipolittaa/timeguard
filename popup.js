// popup.js

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage
    ? chrome.runtime.openOptionsPage()
    : chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
});

function fmtTime(seconds) {
  if (seconds < 60) return seconds + 'с';
  const m = Math.floor(seconds / 60);
  if (m < 60) return m + ' мин';
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return h + 'ч ' + (rm > 0 ? rm + 'м' : '');
}

function progressColor(pct) {
  if (pct >= 100) return '#e63946';
  if (pct >= 75)  return '#ffd166';
  return '#06d6a0';
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch { return null; }
}

function matchRule(tabDomain, ruleDomain) {
  if (!tabDomain || !ruleDomain) return false;
  return tabDomain === ruleDomain || tabDomain.endsWith('.' + ruleDomain);
}

async function render() {
  const body = document.getElementById('popup-body');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentDomain = tab ? extractDomain(tab.url) : null;

  const { spent = {}, rules = [] } = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, resolve);
  });

  if (rules.length === 0) {
    body.innerHTML = `
      <div class="empty-popup">
        Нет активных ограничений.<br>
        Настрой слежение за сайтами.
      </div>
      <button class="btn-open-settings" id="btn-open">Открыть настройки</button>
    `;
    document.getElementById('btn-open').addEventListener('click', () => {
      chrome.runtime.openOptionsPage
        ? chrome.runtime.openOptionsPage()
        : chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    });
    return;
  }

  // Найти правило для текущего сайта
  const currentRule = currentDomain
    ? rules.find(r => matchRule(currentDomain, r.domain))
    : null;

  let html = '';

  // Блок текущего сайта
  if (currentRule) {
    const spentSec = spent[currentRule.domain] || 0;
    const limitSec = currentRule.limitMinutes * 60;
    const pct      = Math.min(100, Math.round((spentSec / limitSec) * 100));
    const color    = progressColor(pct);

    html += `
      <div class="current-site">
        <div class="site-label">Текущий сайт</div>
        <div class="site-name">${currentRule.domain}</div>
        <div class="site-time" style="color:${color}">${fmtTime(spentSec)}</div>
        <div class="site-bar">
          <div class="site-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="site-limit-label">лимит: ${currentRule.limitMinutes} мин/день · ${pct}%</div>
      </div>
    `;
  } else if (currentDomain) {
    html += `
      <div class="current-site">
        <div class="site-label">Текущий сайт</div>
        <div class="site-name">${currentDomain}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px;font-family:'Space Mono',monospace">без ограничений</div>
      </div>
    `;
  }

  // Список всех правил
  html += `<div class="list-section"><div class="list-label">Все ограничения</div>`;

  rules.forEach(rule => {
    const spentSec = spent[rule.domain] || 0;
    const limitSec = rule.limitMinutes * 60;
    const pct      = Math.min(100, Math.round((spentSec / limitSec) * 100));
    const color    = progressColor(pct);

    html += `
      <div class="rule-row">
        <div class="rule-dot" style="background:${color}"></div>
        <div class="rule-name">${rule.domain}</div>
        <div class="rule-pct" style="color:${color}">${pct}%</div>
      </div>
    `;
  });

  html += `</div>`;

  body.innerHTML = html;
}

render();
