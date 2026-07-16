// settings.js

const inpDomain = document.getElementById('inp-domain');
const inpLimit  = document.getElementById('inp-limit');
const btnAdd    = document.getElementById('btn-add');
const errorMsg  = document.getElementById('error-msg');
const rulesList = document.getElementById('rules-list');
const statsGrid = document.getElementById('stats-grid');
const btnReset  = document.getElementById('btn-reset');

// ── Утилиты ──────────────────────────────────────────────────────────────────

function fmtTime(seconds) {
  if (seconds < 60) return seconds + ' с';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return m + ' мин ' + (s > 0 ? s + ' с' : '');
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return h + ' ч ' + (rm > 0 ? rm + ' мин' : '');
}

function progressColor(pct) {
  if (pct >= 100) return '#e63946';
  if (pct >= 75)  return '#ffd166';
  return '#06d6a0';
}

function cleanDomain(raw) {
  try {
    // Если ввели URL — вытащим домен
    if (raw.includes('://')) {
      return new URL(raw).hostname.replace(/^www\./, '');
    }
    // Убираем www. и слэши
    return raw.replace(/^www\./, '').split('/')[0].trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

// ── Загрузка данных ───────────────────────────────────────────────────────────

async function loadData() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, resolve);
  });
}

async function getRules() {
  const { rules = [] } = await chrome.storage.local.get('rules');
  return rules;
}

async function saveRules(rules) {
  await chrome.storage.local.set({ rules });
}

// ── Рендер ────────────────────────────────────────────────────────────────────

async function render() {
  const { spent = {}, rules = [] } = await loadData();

  // --- Список правил ---
  rulesList.innerHTML = '';

  if (rules.length === 0) {
    rulesList.innerHTML = `
      <div class="empty-state">
        <div class="icon">🛡️</div>
        Нет активных ограничений.<br>Добавьте первый сайт выше.
      </div>`;
  } else {
    rules.forEach((rule, idx) => {
      const spentSec  = spent[rule.domain] || 0;
      const limitSec  = rule.limitMinutes * 60;
      const pct       = Math.min(100, Math.round((spentSec / limitSec) * 100));
      const color     = progressColor(pct);

      const item = document.createElement('div');
      item.className = 'rule-item';
      item.innerHTML = `
        <div class="rule-domain">
          ${rule.domain}
          <small>весь сайт и поддомены</small>
        </div>
        <div class="rule-limit">${rule.limitMinutes} мин/день</div>
        <div class="rule-progress">
          <div class="progress-label">
            <span>${fmtTime(spentSec)}</span>
            <span>${pct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>
        <button class="btn-delete" data-idx="${idx}" title="Удалить правило">✕</button>
      `;
      rulesList.appendChild(item);
    });

    // Удаление правила
    rulesList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        const currentRules = await getRules();
        currentRules.splice(idx, 1);
        await saveRules(currentRules);
        render();
      });
    });
  }

  // --- Статистика ---
  statsGrid.innerHTML = '';

  const allDomains = new Set([
    ...Object.keys(spent),
    ...rules.map(r => r.domain)
  ]);

  if (allDomains.size === 0) {
    statsGrid.innerHTML = '<p style="color:var(--muted);font-size:13px">Статистика появится после посещения сайтов.</p>';
    return;
  }

  allDomains.forEach(domain => {
    const spentSec = spent[domain] || 0;
    if (spentSec === 0) return;

    const rule = rules.find(r => r.domain === domain);
    const isOver = rule && spentSec >= rule.limitMinutes * 60;

    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <div class="stat-domain">${domain}</div>
      <div class="stat-time ${isOver ? 'over-limit' : ''}">${fmtTime(spentSec)}</div>
      ${isOver ? '<small style="color:var(--accent);font-size:11px;margin-top:4px;display:block">⛔ лимит исчерпан</small>' : ''}
    `;
    statsGrid.appendChild(card);
  });

  if (statsGrid.children.length === 0) {
    statsGrid.innerHTML = '<p style="color:var(--muted);font-size:13px">Статистика появится после посещения сайтов.</p>';
  }
}

// ── Добавление правила ────────────────────────────────────────────────────────

btnAdd.addEventListener('click', async () => {
  errorMsg.textContent = '';

  const rawDomain   = inpDomain.value.trim();
  const limitMinutes = parseInt(inpLimit.value);

  if (!rawDomain) {
    errorMsg.textContent = 'Введите домен сайта';
    return;
  }

  if (!limitMinutes || limitMinutes < 1) {
    errorMsg.textContent = 'Введите лимит (минимум 1 минута)';
    return;
  }

  const domain = cleanDomain(rawDomain);

  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    errorMsg.textContent = 'Некорректный домен. Пример: youtube.com';
    return;
  }

  const rules = await getRules();

  if (rules.find(r => r.domain === domain)) {
    errorMsg.textContent = 'Такой домен уже добавлен';
    return;
  }

  rules.push({ domain, limitMinutes });
  await saveRules(rules);

  inpDomain.value = '';
  inpLimit.value  = '';
  render();
});

// Enter в полях
[inpDomain, inpLimit].forEach(el =>
  el.addEventListener('keydown', e => e.key === 'Enter' && btnAdd.click())
);

// ── Сброс статистики ──────────────────────────────────────────────────────────

btnReset.addEventListener('click', async () => {
  if (!confirm('Сбросить всю статистику за сегодня?')) return;
  await new Promise(r => chrome.runtime.sendMessage({ type: 'RESET_TODAY' }, r));
  render();
});

// ── Автообновление каждые 5 секунд ───────────────────────────────────────────
render();
setInterval(render, 5000);
