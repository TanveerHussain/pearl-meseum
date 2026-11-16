# Emirates NBD Pearl Museum — One Breath

Static site, no build step. Pages: `index`, `history`, `collection`, `coinage`, `merchants`, `about`, `visit`.

```
assets/
  css/      style.css (source), style.min.css (what the pages load)
  js/       script.js (source), script.min.js (what the pages load), vendor/gsap-3.12.5.min.js
  fonts/    Plus Jakarta Sans (woff2)
  images/   photos, posters, masks, logos, og/ share images (per-page subfolders)
  videos/   mp4 loops and scenes (per-page subfolders)
  audio/    sound stems (*.m4a)
```

## Run locally

```bash
npx serve .
```

Open over `http://localhost` (sound uses Web Audio; videos need range requests, which `serve` supports).
Opening the files with `file://` breaks the audio `fetch`.

## Deploy

Any static host works: upload the folder as is (no build step). Serve `assets/` with long cache headers if the host allows it.

## Notes

- Mirrored from the password-protected preview; pages here are the decrypted originals, no lock screen.
- No CDN dependencies: fonts, GSAP and all media are local.
- `og:image` / `canonical` are relative. Make them absolute once the production domain is known, so social previews work.

## Paths

- Pages reference files from the site root: `assets/images/...`, `assets/videos/...`, `assets/js/...`.
- `style.css` lives in `assets/css/`, so its urls step up one level: `url(../images/...)`, `url(../fonts/...)`.
- `script.js` loads `vendor/gsap-3.12.5.min.js` relative to its own location and the menu logo from `../images/`:
  keep it and `vendor/` together in `assets/js/`.
- Sound stems load from `assets/audio/<name>.m4a` (names listed in each page's `STEMS`).

## CSS

One stylesheet, no `<style>` blocks in the pages: edit `assets/css/style.css`, pages load `assets/css/style.min.css`.

- Shared sections first (fonts, placement, site, menu), then one section per page.
- Each page's content sits in `<div class="pm-page pm-page--NAME">` (`display:contents`, so it draws no box).
- Page rules are scoped on the element they style, with no added specificity:
  - inside the page: `.note:where(.pm-page--about *)`
  - on `<html>`/`<body>` (incl. the html state classes `js`, `fx`, `rm`, …): `.fx:where(:has(.pm-page--index))`
- Don't pass relative urls through CSS variables from the HTML: they resolve against the stylesheet, not the page.
- Scripts that add elements styled by page rules append them to `.pm-page`, not `body`.

After editing `style.css`, rebuild:

```bash
npx esbuild@0.24.0 assets/css/style.css --minify --outfile=assets/css/style.min.css
```

## JS

One script, no inline `<script>` blocks: edit `assets/js/script.js`, pages load `assets/js/script.min.js`.
GSAP stays a separate vendor file (third-party, loaded without blocking).

- Each page has one tag in `<head>`, without `defer`, naming the page:
  `<script src="assets/js/script.min.js" data-page="about"></script>`
- Inside `script.js`, code runs at the same moments as the separate scripts it replaced:
  - `SITE` (the shared engine, was `site.js`) runs in `<head>` on every page except index; index runs `HEAD.index`.
  - `PAGE.<name>` (was the page's inline script at the end of `<body>`) runs once the document is parsed,
    before `SITE` boots. On index, `MENU` runs right after it (it was a deferred `menu.js`).
  - `MENU` (was `menu.js`) is started by `SITE` on the other pages.
- A new page: add `PAGE.<name> = function () { ... }` to `script.js` and give its tag `data-page="<name>"`.

After editing `script.js`, rebuild:

```bash
npx esbuild@0.24.0 assets/js/script.js --minify --outfile=assets/js/script.min.js
```
