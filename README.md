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

One stylesheet: edit `kit/style.css` (fonts, placement, site, menu, in that order), pages load `kit/style.min.css`.
Each page also keeps its own `<style>` block for page-specific rules. After editing `style.css`, rebuild:

```bash
npx esbuild@0.24.0 kit/style.css --minify --outfile=kit/style.min.css
```
- `og:image` / `canonical` are relative. Make them absolute once the production domain is known, so social previews work.
