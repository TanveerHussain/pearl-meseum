# Emirates NBD Pearl Museum — One Breath

Static site, no build step. Pages: `index`, `history`, `collection`, `coinage`, `merchants`, `about`, `visit`.

- `kit/` — shared CSS/JS (site, menu, GSAP vendored in `kit/vendor/`)
- `assets/` — images, videos, audio stems (`assets/audio/*.m4a`)

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
- No CDN dependencies: Plus Jakarta Sans is self-hosted (`kit/fonts/`), GSAP is `kit/vendor/gsap-3.12.5.min.js`.

## CSS

One stylesheet, no `<style>` blocks in the pages: edit `kit/style.css`, pages load `kit/style.min.css`.

- Shared sections first (fonts, placement, site, menu), then one section per page.
- Each page's content sits in `<div class="pm-page pm-page--NAME">` (`display:contents`, so it draws no box).
- Page rules are scoped on the element they style, with no added specificity:
  - inside the page: `.note:where(.pm-page--about *)`
  - on `<html>`/`<body>` (incl. the html state classes `js`, `fx`, `rm`, …): `.fx:where(:has(.pm-page--index))`
- Asset urls in `style.css` are relative to `kit/` (`url(../assets/...)`). Don't pass relative urls through CSS
  variables from the HTML: they resolve against the stylesheet, not the page.
- Scripts that add elements styled by page rules append them to `.pm-page`, not `body`.

After editing `style.css`, rebuild:

```bash
npx esbuild@0.24.0 kit/style.css --minify --outfile=kit/style.min.css
```
- `og:image` / `canonical` are relative. Make them absolute once the production domain is known, so social previews work.
