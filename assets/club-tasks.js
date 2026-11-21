(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FightClubTasks = api;
})(globalThis, function () {
  'use strict';

  const CHANNEL_URL = 'https://t.me/icebloodkz';
  const DAILY_COINS = 250;
  const WEEKLY_POPULARITY = 2;
  const achievements = [
    { id: 'hundred-hits', title: 'Первые 100 ударов', detail: 'Выполни 100 тренировочных ударов по бойцу.', field: 'hits', goal: 100, reward: 1, icon: '🥊' },
    { id: 'first-boss', title: 'Первая победа над боссом', detail: 'Победи одного босса на арене.', field: 'wins', goal: 1, reward: 1, icon: '🏆' }
  ];
  const cosmetics = [
    { id: 'club', name: 'Свой', price: 20, icon: '🤝', detail: 'Клубный значок рядом с именем.' },
    { id: 'star', name: 'Звезда клуба', price: 35, icon: '🌟', detail: 'Особый значок для профиля.' },
    { id: 'legend', name: 'Легенда клуба', price: 50, icon: '👑', detail: 'Корона и титул рядом с именем.' }
  ];
  const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

  function normalise(state) {
    state.popularity = integer(state.popularity);
    state.dailyStreak = integer(state.dailyStreak);
    state.claimedClubAchievements = Array.isArray(state.claimedClubAchievements)
      ? [...new Set(state.claimedClubAchievements.filter(id => achievements.some(item => item.id === id)))] : [];
    state.ownedClubCosmetics = Array.isArray(state.ownedClubCosmetics)
      ? [...new Set(state.ownedClubCosmetics.filter(id => cosmetics.some(item => item.id === id)))] : [];
    if (!state.ownedClubCosmetics.includes(state.activeClubCosmetic)) state.activeClubCosmetic = '';
    state.channelTaskOpened = state.channelTaskOpened === true;
    return state;
  }

  // Keep the same device-calendar day as the existing daily reward.
  function dates(now = new Date()) {
    const day = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { today: day(now), yesterday: day(yesterday) };
  }

  function dailyStatus(state, now = new Date()) {
    const { today, yesterday } = dates(now);
    const claimed = state.lastDaily === today;
    const streak = claimed ? Math.max(1, state.dailyStreak) : state.lastDaily === yesterday ? state.dailyStreak : 0;
    const done = claimed ? ((streak - 1) % 7) + 1 : streak % 7;
    return { claimed, streak, done, current: claimed ? done : done + 1 };
  }

  function claimDaily(state, now = new Date()) {
    const { today, yesterday } = dates(now);
    if (state.lastDaily === today) return { ok: false, reason: 'claimed' };
    state.dailyStreak = (state.lastDaily === yesterday ? state.dailyStreak : 0) + 1;
    state.lastDaily = today;
    state.coins += DAILY_COINS;
    state.total += DAILY_COINS;
    const popularity = state.dailyStreak % 7 === 0 ? WEEKLY_POPULARITY : 0;
    state.popularity += popularity;
    return { ok: true, coins: DAILY_COINS, popularity };
  }

  function claimAchievement(state, id) {
    const item = achievements.find(value => value.id === id);
    if (!item || state.claimedClubAchievements.includes(id) || integer(state[item.field]) < item.goal) return false;
    state.claimedClubAchievements.push(id);
    state.popularity += item.reward;
    return true;
  }

  function selectCosmetic(state, id) {
    if (id === '') { state.activeClubCosmetic = ''; return true; }
    const item = cosmetics.find(value => value.id === id);
    if (!item) return false;
    if (!state.ownedClubCosmetics.includes(id)) {
      if (state.popularity < item.price) return false;
      state.popularity -= item.price;
      state.ownedClubCosmetics.push(id);
    }
    state.activeClubCosmetic = id;
    return true;
  }

  function mount({ state, save, notify, haptic, navigate, telegram, format, refresh }) {
    normalise(state);
    const $ = id => document.getElementById(id);
    const fmt = format || (value => value.toLocaleString('ru-RU'));
    let filter = 'all';
    let lastCards = '';
    let lastCosmetics = '';
    const live = message => { $('club-task-status').textContent = message; notify(message); };
    const redraw = () => { if (refresh) refresh(); else render(); };

    function render() {
      document.querySelectorAll('[data-popularity-balance]').forEach(element => { element.textContent = fmt(state.popularity); });
      const cosmetic = cosmetics.find(item => item.id === state.activeClubCosmetic);
      document.querySelectorAll('[data-active-club-cosmetic]').forEach(element => {
        element.hidden = !cosmetic;
        element.textContent = cosmetic ? cosmetic.icon + ' ' + cosmetic.name : '';
      });
      const daily = dailyStatus(state);
      $('dailybtn').disabled = daily.claimed;
      $('dailybtn').textContent = daily.claimed ? 'Награда уже получена ✓' : 'Забрать ' + DAILY_COINS + ' 🪙';
      $('club-streak-label').textContent = 'Серия: ' + fmt(daily.streak) + ' дн.';
      $('club-streak-days').replaceChildren(...Array.from({ length: 7 }, (_, index) => {
        const day = index + 1;
        const element = document.createElement('div');
        element.className = 'club-day' + (day <= daily.done ? ' done' : '') + (day === daily.current ? ' current' : '');
        element.setAttribute('role', 'listitem');
        element.setAttribute('aria-label', 'День ' + day + (day <= daily.done ? ', получено' : day === daily.current ? ', текущий' : ''));
        const number = document.createElement('b'); number.textContent = day;
        const label = document.createElement('span'); label.textContent = day === 7 ? '+2 📣' : 'день';
        element.append(number, label); return element;
      }));
      const cards = [];
      if (filter === 'all' || filter === 'channel') cards.push(
        `<article class="club-card featured" data-club-task="channel"><div class="club-feature">Задание клуба</div><div class="club-card-head"><span class="club-task-icon" aria-hidden="true">📢</span><div><h3>Подписаться на канал</h3><p>@icebloodkz</p></div><div class="club-rewards"><span>🪙 10</span><span class="club-popularity">📣 3</span></div></div><p class="club-description">Новости спорта и нашего клуба. Награда — после подтверждения подписки.</p><div class="club-card-actions"><a class="secondary club-channel-link" href="${CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Перейти в канал</a><button class="secondary" type="button" disabled>Проверка недоступна</button></div><p class="club-footnote">${state.channelTaskOpened ? 'Канал открыт. Подписка ещё не подтверждена.' : 'Проверка подписки пока недоступна.'} Награда станет доступна после подключения проверки.</p></article>`
      );
      if (filter === 'all' || filter === 'daily') cards.push(
        `<article class="club-card" data-club-task="daily"><div class="club-card-head"><span class="club-task-icon" aria-hidden="true">🎁</span><div><h3>Зайти в игру сегодня</h3><p>Один раз за календарный день</p></div><div class="club-rewards"><span>🪙 ${DAILY_COINS}</span></div></div><div class="club-card-actions"><span>${daily.claimed ? 'Сегодня уже получено' : 'Награда доступна'}</span><button class="buy" type="button" data-club-action="daily" ${daily.claimed ? 'disabled' : ''}>${daily.claimed ? 'Получено ✓' : 'Забрать'}</button></div></article>`,
        `<article class="club-card" data-club-task="weekly"><div class="club-card-head"><span class="club-task-icon" aria-hidden="true">🗓️</span><div><h3>Семь дней подряд</h3><p>Забирай награду за вход каждый день</p></div><div class="club-rewards club-popularity"><span>📣 ${WEEKLY_POPULARITY}</span></div></div><p class="club-description">${daily.done} из 7 дней в текущей серии. Популярность начисляется автоматически с наградой седьмого дня.</p></article>`
      );
      if (filter === 'all' || filter === 'achievements') for (const item of achievements) {
        const progress = Math.min(item.goal, Math.max(0, integer(state[item.field])));
        const claimed = state.claimedClubAchievements.includes(item.id);
        const ready = progress >= item.goal;
        cards.push(`<article class="club-card" data-club-task="${item.id}"><div class="club-card-head"><span class="club-task-icon" aria-hidden="true">${item.icon}</span><div><h3>${item.title}</h3><p>${item.detail}</p></div><div class="club-rewards club-popularity"><span>📣 ${item.reward}</span></div></div><div class="club-task-progress" role="progressbar" aria-label="${item.title}" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="${item.goal}"><span style="width:${100 * progress / item.goal}%"></span></div><div class="club-card-actions"><span>${fmt(progress)} из ${fmt(item.goal)}</span><button class="${ready && !claimed ? 'buy' : 'secondary'}" type="button" data-club-achievement="${item.id}" ${claimed || !ready ? 'disabled' : ''}>${claimed ? 'Получено ✓' : ready ? 'Забрать' : 'В процессе'}</button></div></article>`);
      }
      const html = cards.join('');
      if (html !== lastCards) { $('club-task-list').innerHTML = html; lastCards = html; }
      $('club-task-filters').querySelectorAll('button').forEach(button => {
        const active = button.dataset.clubFilter === filter;
        button.classList.toggle('selected', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const shop = cosmetics.map(item => {
        const owned = state.ownedClubCosmetics.includes(item.id);
        const active = state.activeClubCosmetic === item.id;
        return `<article class="club-cosmetic" data-club-cosmetic-card="${item.id}"><div><h3>${item.icon} ${item.name}</h3><p>${item.detail}</p></div><button type="button" class="${owned ? 'secondary' : 'buy'}" data-club-cosmetic="${item.id}" ${active || (!owned && state.popularity < item.price) ? 'disabled' : ''}>${active ? 'Надето ✓' : owned ? 'Надеть' : '📣 ' + item.price}</button></article>`;
      }).join('');
      if (shop !== lastCosmetics) { $('club-cosmetics').innerHTML = shop; lastCosmetics = shop; }
      $('club-remove-cosmetic').disabled = !state.activeClubCosmetic;
    }

    function claimDailyFromUI() {
      const result = claimDaily(state);
      if (!result.ok) return;
      save(); haptic(); redraw();
      live('🎁 +' + result.coins + ' монет' + (result.popularity ? ' и +' + result.popularity + ' популярности!' : '!'));
    }

    $('screen-tasks').addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button && !button.disabled) {
        if (button.dataset.clubFilter) { filter = button.dataset.clubFilter; render(); }
        if (button.dataset.clubAction === 'daily') claimDailyFromUI();
        if (button.dataset.clubAchievement && claimAchievement(state, button.dataset.clubAchievement)) {
          save(); haptic(); redraw(); live('📣 +1 популярность!');
        }
        if (button.hasAttribute('data-club-cosmetic') && selectCosmetic(state, button.dataset.clubCosmetic)) {
          save(); haptic(); redraw(); live('Значок профиля обновлён');
        }
      }
      const channel = event.target.closest('.club-channel-link');
      if (channel) {
        // Opening a link is never treated as proof of Telegram membership.
        if (telegram?.openTelegramLink) {
          try { telegram.openTelegramLink(CHANNEL_URL); event.preventDefault(); } catch (_) { /* Keep the normal link. */ }
        }
        state.channelTaskOpened = true; save();
        // Let a normal browser finish opening the anchor before replacing its card.
        setTimeout(render, 0);
      }
    });
    document.querySelectorAll('[data-open-screen]').forEach(button => {
      button.addEventListener('click', () => navigate(button.dataset.openScreen));
    });
    return { render, claimDaily: claimDailyFromUI };
  }

  return { CHANNEL_URL, DAILY_COINS, WEEKLY_POPULARITY, achievements, cosmetics, normalise, dates, dailyStatus, claimDaily, claimAchievement, selectCosmetic, mount };
});
