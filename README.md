# B-Time

A clock with no time zones and no clock changes. Time is set by where you stand: mean solar time is UTC plus longitude / 15 hours, with an optional "true" mode that follows the real sun via the equation of time.

Plain HTML/CSS/JS, no build step, nothing leaves the browser.

## Run

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Test

```sh
node --test test/solar.test.js
```

## Publish on GitHub Pages

Settings → Pages → Deploy from a branch → `main` / root. All paths are relative, so it works under `https://<user>.github.io/<repo>/`.

Share a location with a URL hash, e.g. `#lat=39.77&lon=-86.16&n=Indianapolis&m=apparent`.

## Accuracy

Equation of time ~30 s, sunrise/sunset ~2 min. Fine for a clock, not for navigation.
