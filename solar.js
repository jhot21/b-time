/* Solar-time math. Classic script (no modules) so the page also works from file://.
 * Accuracy: equation of time within ~30 s, sunrise/sunset within a couple of minutes.
 * That is plenty for a clock, and nowhere near good enough for navigation. */
(function (root) {
  'use strict';

  var RAD = Math.PI / 180;
  var DAY_MS = 86400000;
  var MS_PER_DEGREE = 240000; // the earth turns 1 degree every 4 minutes

  // Fractional day of year; Jan 1 00:00 UTC = 1.0
  function dayOfYear(ms) {
    var d = new Date(ms);
    return (ms - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY_MS;
  }

  // Apparent minus mean solar time, in minutes (Spencer-style approximation).
  function equationOfTime(N) {
    var B = (2 * Math.PI / 365) * (N - 81);
    return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  }

  // Solar declination in degrees.
  function declination(N) {
    var g = (2 * Math.PI / 365) * (N - 1);
    var d = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) -
            0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
            0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    return d / RAD;
  }

  // Sun altitude in degrees for an observer at latitude `lat`.
  function altitude(lat, dec, apparentHours) {
    var H = 15 * (apparentHours - 12) * RAD;
    var s = Math.sin(lat * RAD) * Math.sin(dec * RAD) +
            Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(H);
    return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
  }

  // Half the day length as an hour angle in degrees, or a polar flag.
  function sunriseHourAngle(lat, dec) {
    var c = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(dec * RAD)) /
            (Math.cos(lat * RAD) * Math.cos(dec * RAD));
    if (c >= 1) return { polar: 'night' };
    if (c <= -1) return { polar: 'day' };
    return { angle: Math.acos(c) / RAD };
  }

  // Everything derived from an instant + a place. Only `lon` affects the clock.
  function solarState(utcMs, lat, lon) {
    var meanMs = utcMs + lon * MS_PER_DEGREE;
    var N = dayOfYear(meanMs);
    var eot = equationOfTime(N);
    var dec = declination(N);
    var apparentMs = meanMs + eot * 60000;
    var apparentHours = (((apparentMs % DAY_MS) + DAY_MS) % DAY_MS) / 3600000;
    return {
      meanMs: meanMs,
      apparentMs: apparentMs,
      N: N,
      eot: eot,
      dec: dec,
      altitude: altitude(lat, dec, apparentHours),
      rise: sunriseHourAngle(lat, dec)
    };
  }

  var api = {
    DAY_MS: DAY_MS,
    MS_PER_DEGREE: MS_PER_DEGREE,
    dayOfYear: dayOfYear,
    equationOfTime: equationOfTime,
    declination: declination,
    altitude: altitude,
    sunriseHourAngle: sunriseHourAngle,
    solarState: solarState
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Solar = api;
})(typeof window !== 'undefined' ? window : globalThis);
