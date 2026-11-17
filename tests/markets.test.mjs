import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
import { activeSchedule, validateMarket, renderMarkets, londonClock } from '../market-data.js';
const seed = JSON.parse(await readFile('data/markets.json', 'utf8'));
test('all existing markets import, including every December date', () => {
  assert.equal(seed.length, 10); seed.forEach(validateMarket);
  assert.equal(seed.find(m => m.name === 'KERB Fleet Place').schedule.length, 7);
  assert.equal(seed.find(m => m.name === 'KERB New Acres').schedule.length, 5);
});
test('dated rows expire at closing in London, including summer time; recurring rows and deadlines work', () => {
  const m = { ...seed[0], schedule: [{ date: '2027-07-01', start: '11:30', end: '14:30' }, { day: 'Sunday', start: '10:00', end: '16:00' }] };
  assert.equal(londonClock(new Date('2027-07-01T13:30:00Z')), '2027-07-01T14:30');
  assert.equal(activeSchedule(m, new Date('2027-07-01T13:29:00Z')).length, 2);
  assert.equal(activeSchedule(m, new Date('2027-07-01T13:30:00Z')).length, 1);
  assert.equal(activeSchedule({ ...m, published: false }).length, 0);
  assert.equal(activeSchedule({ ...m, expires_at: '2027-07-01T13:30:00Z' }, new Date('2027-07-01T13:30:00Z')).length, 0);
});
test('market content renders as plain text, dates match filters, invalid colours and times are rejected', () => {
  const { document } = parseHTML('<div class="market-list"></div>');
  renderMarkets(document, [{ ...seed[0], name: '<img src=x onerror=alert(1)>', schedule: [{ date: '2026-12-09', start: '11:30', end: '14:30' }] }], new Date('2026-11-17T00:00:00Z'));
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('.market-card').dataset.marketDays, 'Wednesday');
  assert.match(document.querySelector('a').href, /^https:\/\/www.google.com\/maps/);
  assert.throws(() => validateMarket({ ...seed[0], color: 'url(evil)' }));
  assert.throws(() => validateMarket({ ...seed[0], schedule: [{ date: '2026-02-30', start: '11:00', end: '12:00' }] }));
  assert.throws(() => validateMarket({ ...seed[0], schedule: [{ day: 'Sunday', start: '16:00', end: '10:00' }] }));
});
