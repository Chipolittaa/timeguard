document.addEventListener('DOMContentLoaded', function() {

  // Читаем данные из storage (background.js сохраняет туда перед редиректом)
  chrome.storage.local.get('blockedInfo', function(data) {
    const info   = data.blockedInfo || {};
    const domain = info.domain || '';
    const limit  = info.limitMinutes || 0;

    document.getElementById('domain-badge').textContent = domain || 'неизвестный сайт';
    document.getElementById('limit-val').textContent    = limit ? limit + ' мин/день' : '—';
  });

  document.getElementById('btn-settings').addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage
      ? chrome.runtime.openOptionsPage()
      : window.open(chrome.runtime.getURL('settings.html'));
  });

  // Обратный отсчёт до полуночи
  function updateCountdown() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = Math.floor((midnight - now) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    document.getElementById('countdown').textContent =
      'До сброса: ' + String(h).padStart(2,'0') + ':' +
      String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
});
