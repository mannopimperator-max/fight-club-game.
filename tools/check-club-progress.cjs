const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const club = require('../assets/club-tasks.js');

function player(overrides = {}) {
  return club.normalise({ coins: 173, total: 4567, hits: 0, wins: 0, power: 3, auto: 0, lastDaily: '', ...overrides });
}
function date(day) { return new Date(2026, 10, day, 12, 0, 0); }

const legacy = player({ hits: 123, bodyType: 'wide', ownedEquipment: ['top_v7_blue'], equippedEquipment: { top: 'top_v7_blue' } });
assert.equal(legacy.popularity, 0);
assert.equal(legacy.coins, 173);
assert.equal(legacy.total, 4567);
assert.equal(legacy.power, 3);
assert.equal(legacy.bodyType, 'wide');
assert.deepEqual(legacy.equippedEquipment, { top: 'top_v7_blue' });

const fresh = player();
assert.equal(club.claimAchievement(fresh, 'hundred-hits'), false);
assert.equal(club.claimAchievement(fresh, 'first-boss'), false);
assert.equal(club.claimAchievement(fresh, 'channel'), false, 'Opening a channel must not award a subscription reward');
fresh.hits = 99;
assert.equal(club.claimAchievement(fresh, 'hundred-hits'), false);
fresh.hits = 100;
assert.equal(club.claimAchievement(fresh, 'hundred-hits'), true);
assert.equal(fresh.popularity, 1);
assert.equal(club.claimAchievement(fresh, 'hundred-hits'), false);
fresh.wins = 1;
assert.equal(club.claimAchievement(fresh, 'first-boss'), true);
assert.equal(fresh.popularity, 2);
assert.equal(fresh.coins, 173, 'Popularity must remain separate from regular coins');
assert.equal(fresh.power, 3);
const reloaded = player(JSON.parse(JSON.stringify(fresh)));
assert.equal(club.claimAchievement(reloaded, 'hundred-hits'), false);
assert.equal(club.claimAchievement(reloaded, 'first-boss'), false);
assert.equal(reloaded.popularity, 2);

const daily = player();
const initialCoins = daily.coins;
for (let day = 1; day <= 14; day++) {
  const result = club.claimDaily(daily, date(day));
  assert.equal(result.ok, true);
  assert.equal(result.popularity, day % 7 === 0 ? 2 : 0);
  const snapshot = JSON.stringify(daily);
  assert.equal(club.claimDaily(daily, date(day)).ok, false);
  assert.equal(JSON.stringify(daily), snapshot, 'Daily reward must be idempotent');
}
assert.equal(daily.coins, initialCoins + 14 * 250);
assert.equal(daily.total, 4567 + 14 * 250);
assert.equal(daily.popularity, 4);
assert.equal(daily.dailyStreak, 14);
assert.deepEqual(club.dailyStatus(daily, date(14)), { claimed: true, streak: 14, done: 7, current: 7 });
assert.deepEqual(club.dailyStatus(daily, date(15)), { claimed: false, streak: 14, done: 0, current: 1 });
assert.equal(club.dailyStatus(daily, date(16)).streak, 0);
assert.equal(club.claimDaily(daily, date(16)).ok, true);
assert.equal(daily.dailyStreak, 1, 'Skipping a day resets the streak');
assert.equal(daily.popularity, 4, 'Skipping a day keeps previously earned popularity');
assert.deepEqual(club.dates(new Date(2027, 0, 1, 12)), { today: '2027-01-01', yesterday: '2026-12-31' });

const oldDaily = player({ lastDaily: '2026-11-21' });
assert.equal(club.claimDaily(oldDaily, date(21)).ok, false, 'An old save that already claimed today gets no second reward');
assert.equal(oldDaily.coins, 173);
assert.equal(club.claimDaily(oldDaily, date(22)).ok, true);

const wallet = player({ popularity: 19 });
assert.equal(club.selectCosmetic(wallet, 'club'), false);
assert.equal(wallet.popularity, 19);
wallet.popularity = 55;
assert.equal(club.selectCosmetic(wallet, 'club'), true);
assert.equal(wallet.popularity, 35);
assert.equal(wallet.activeClubCosmetic, 'club');
assert.deepEqual(wallet.ownedClubCosmetics, ['club']);
assert.equal(club.selectCosmetic(wallet, 'star'), true);
assert.equal(wallet.popularity, 0);
assert.equal(club.selectCosmetic(wallet, ''), true);
assert.equal(club.selectCosmetic(wallet, 'club'), true);
assert.equal(wallet.popularity, 0, 'Owned cosmetics are never charged again');
assert.equal(club.selectCosmetic(wallet, 'legend'), false);
assert.equal(club.selectCosmetic(wallet, '<script>'), false);
assert.equal(wallet.activeClubCosmetic, 'club');
assert.equal(wallet.coins, 173);
assert.equal(wallet.power, 3, 'Cosmetics must not modify combat strength');
assert.equal(player(JSON.parse(JSON.stringify(wallet))).activeClubCosmetic, 'club');

const malformed = player({ popularity: -10, dailyStreak: NaN, claimedClubAchievements: null, ownedClubCosmetics: ['club', 'club', 'unknown'], activeClubCosmetic: 'legend' });
assert.equal(malformed.popularity, 0);
assert.equal(malformed.dailyStreak, 0);
assert.deepEqual(malformed.claimedClubAchievements, []);
assert.deepEqual(malformed.ownedClubCosmetics, ['club']);
assert.equal(malformed.activeClubCosmetic, '');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
assert.ok(html.includes('assets/club-tasks.js?v=9'));
assert.ok(html.includes('assets/club-tasks.css?v=9'));
assert.ok(html.includes('id="screen-tasks"'));
assert.ok(html.includes('data-popularity-balance'));
assert.ok(html.includes("$('dailybtn').onclick=()=>club.claimDaily()"));
assert.equal(club.CHANNEL_URL, 'https://t.me/icebloodkz');

console.log('PASS: legacy progress, achievement thresholds, repeat-claim prevention, 14-day rewards, missed-day reset, old daily claims, separate wallets, cosmetic spending/equipping/reload, invalid state, inline JavaScript syntax.');
