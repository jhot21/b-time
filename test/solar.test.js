const test = require('node:test');
const assert = require('node:assert');
const S = require('../solar.js');

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ±${tol}, got ${a}`);

test('mean solar time is UTC shifted 4 minutes per degree of longitude', () => {
  const utc = Date.UTC(2026, 10, 1, 12, 0, 0);
  assert.strictEqual(S.solarState(utc, 0, 0).meanMs, utc);
  assert.strictEqual(S.solarState(utc, 0, 15).meanMs, utc + 3600000);
  assert.strictEqual(S.solarState(utc, 0, -86.16).meanMs, utc - 86.16 * 240000);
});

test('equation of time matches known almanac values', () => {
  // early Nov: sundial ~16.4 min fast; mid Feb: ~14.2 min slow
  near(S.equationOfTime(S.dayOfYear(Date.UTC(2026, 10, 3))), 16.4, 0.7, 'Nov 3');
  near(S.equationOfTime(S.dayOfYear(Date.UTC(2026, 1, 11))), -14.2, 0.7, 'Feb 11');
  // near zero around Apr 15 and Dec 25
  near(S.equationOfTime(S.dayOfYear(Date.UTC(2026, 3, 15))), 0, 0.7, 'Apr 15');
  near(S.equationOfTime(S.dayOfYear(Date.UTC(2026, 11, 25))), 0, 0.7, 'Dec 25');
});

test('declination hits the solstices and equinox', () => {
  near(S.declination(S.dayOfYear(Date.UTC(2026, 5, 21))), 23.44, 0.5, 'June solstice');
  near(S.declination(S.dayOfYear(Date.UTC(2026, 11, 21))), -23.44, 0.5, 'Dec solstice');
  near(S.declination(S.dayOfYear(Date.UTC(2026, 2, 20))), 0, 0.8, 'March equinox');
});

test('sun is highest at apparent noon, at 90 - lat + dec', () => {
  near(S.altitude(40, 0, 12), 50, 0.01);
  assert.ok(S.altitude(40, 0, 12) > S.altitude(40, 0, 11));
  assert.ok(S.altitude(40, 0, 12) > S.altitude(40, 0, 13));
});

test('day length: equinox is ~12h, polar regions flag', () => {
  near(S.sunriseHourAngle(40, 0).angle / 15 * 2, 12.1, 0.2, 'equinox day length');
  assert.strictEqual(S.sunriseHourAngle(80, -20).polar, 'night');
  assert.strictEqual(S.sunriseHourAngle(80, 20).polar, 'day');
});
