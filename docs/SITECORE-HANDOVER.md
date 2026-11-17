# Sitecore handover: components, scripts and rich text

How the site's markup, CSS and JS map onto Sitecore: what is a coded template, what authors build in the rich text
(RTE) field, and what the RTE must be configured to keep.

## 1. What goes where

| Part | Sitecore | Notes |
|---|---|---|
| `<head>` assets | Layout | `assets/css/style.min.css`, `assets/js/script.min.js` (in `<head>`, **no** `defer`) |
| Header (`header.top`, sound toggle `#soundTgl`, `#soundState`) | Coded rendering | Dynamic. The menu overlay is built by the JS from the header |
| Footer (`.foot`) | Coded rendering | Dynamic |
| Page wrapper `<div class="pm-page pm-page--{type}">` | Page template | Required: the page styles are scoped to it (see 5) |
| Home page (`index.html`) | **Coded page template** | Bespoke dive experience; its own engine (`HEAD.index` / `PAGE.index`). Make its copy editable through fields, not RTE |
| Everything else between header and footer | **Rich text field** | Components below; they start from their markup alone |

Script tag per page type:

```html
<!-- every page except home -->
<script src="/assets/js/script.min.js" data-page="history"></script>
<!-- home only -->
<script src="/assets/js/script.min.js" data-page="index"></script>
<script src="/assets/js/vendor/gsap-3.12.5.min.js" defer></script>
```

`data-page` is optional on content pages. Today it only selects the page's sound mix (and the history header rule,
see 6). A page without it gets every component working, with no sound mix.

## 2. Components (all self-initialising)

No extra JS, no ids required: the shared engine finds each component by class / attribute on load. Scenes without
an id get one automatically (`scene0`, `scene1`, ...).

Attribute values never need quotes inside them (spaces and `;` only), because the RTE may rewrite quotes.

| Component | Markup hook | Options |
|---|---|---|
| Scroll scene (pinned stage) | `section.scene > .stage` | `data-enter` (0 to 1, when it covers the previous), `data-dwell`, `data-theme="light"` (navy header over it) |
| Scene choreography | `data-tween` on any element inside a `.scene` | `prop from to at duration ease; ...` in scene progress 0 to 1. Example: `data-tween="scale 1.07 1 0 1 power1.out; xPercent -1 0 0 1 power1.out"`. Duration `0` sets a value. CSS variables work (`--r 0vmax 9vmax .04 .1 power2.out`) |
| Scroll-linked copy | `data-cue="from to [fade]"` | Fades in and out by scene progress. `data-scene` to follow another scene |
| Keyframed layer | `data-kf` (desktop), `data-kf-m` (phone), `data-rm-at` | JSON-like keyframes; also accepted unquoted: `{0:{y:8,opacity:0},.4:{y:0,opacity:1}}` |
| Reveal on scroll | `data-reveal` | `data-reveal-delay` |
| Scrubbed clip | `video.scrub` inside a scene, `picture.poster` beside it | `data-src`, `data-src-m` (phone), `data-m-only`, `data-load="scroll"`, `data-m="still"`, `data-scrub="from to"` (part of the scene the clip plays over) |
| Inline loop | `figure.loop > video` (+ `.loop__ctl` button) | Plays on screen, pause control. `data-src-m`, `data-poster-m` for phone files |
| Image fallbacks | `img[data-alt="a.jpg\|b.jpg"]`, `source[data-next]`, `img[data-still]` | Missing files fall back quietly |
| Motion-only artwork | `img[data-src-fx]`, `source[data-srcset-fx]` | Swapped in when motion is on (e.g. a clip's first frame); the plain `src` is the reduced-motion image |
| Era opener | `.era > .era__plane` | Slow drift + light band (`--sp`) |
| Route map | `.map` with SVG `.map__mk` mask strokes | `data-draw="from to"` per route |
| Year odometer | `.yr > .yr__row > .yr__n` | `data-to`, `data-from`, `data-comma`, `data-roll="from to"` (inside a scene) |
| Peek scene | `.scene[data-peek]` | Scene between reading sections, shown only while on screen |
| Chapter rail | `nav.rail` with `a[href="#section-id"]` | Shows, marks the current chapter, smooth-scrolls (`data-ch` also accepted) |
| Request form (design only) | `form.form[novalidate]` | `data-msg-required`, `data-msg-invalid` (numbers), `data-msg-min` + `data-min="tomorrow"` (dates); errors in the field's `.field__err` (via `aria-describedby`); `.form__status` |
| Sound toggle | `[data-sound-toggle]`, `[data-sound-label]` | Optional extra toggles in content |

The video flags (`muted`, `playsinline`) are set by the script, so it does not matter if the RTE drops valueless
attributes from `<video>`.

## 3. Rich text field configuration (required)

Out of the box Sitecore's RTE strips or rewrites markup these components rely on. Configure the RTE profile
(classic Telerik RadEditor) or the CKEditor 5 HTML support settings (XM Cloud / Pages) to keep:

- Elements: `section`, `figure`, `figcaption`, `picture`, `source`, `video`, `svg` (+ `path`, `mask`, `defs`, `g`),
  `nav`, `blockquote`, `button`, and empty `div` / `span` (decorative layers such as `.scrim`, `.dusk`)
- Attributes: `class`, `id`, `style`, `data-*`, `aria-*`, `role`, `hidden`, `srcset`, `media`, `poster`,
  `preload`, `loading`, `decoding`, `width`, `height`, `viewBox`, SVG presentation attributes
- RadEditor: disable the `ConvertToXhtml` content filter (it rewrites attribute quotes and drops HTML5 markup);
  keep `RemoveScripts` on (there is no inline script in any component)
- Forms: Sitecore normally strips `form`/`input`. The visit request form is design-only; build the real one with
  **Sitecore Forms** and give it the same classes (`.form`, `.field`, `.field__err`, `.form__status`) so it is styled

Test each component by pasting its markup into the RTE, saving, and comparing the saved HTML with the original.

## 4. Asset paths

Content markup references `assets/images/...`, `assets/videos/...` from the site root. In Sitecore these become
Media Library URLs; anything referenced from CSS (`style.css`, relative to `assets/css/`) must stay at the same
relative place, or be changed in `style.css`.

## 5. CSS scope (known limitation)

Each page type's styles are scoped to its wrapper (`.pm-page--about`, ...). Components therefore look right on
their own page type. Eleven class names (`.note`, `.end__row`, `.map`, ...) are styled differently per page, so a
component taken from one page type onto another may need its styles moved to a shared, uniquely named class first.

## 6. Still page-level (next step)

- **Sound mixes**: each page's mix is a function keyed to section ids (`PAGE.<name>` in `script.js`). It runs when
  the page tag names the page and those ids exist; otherwise the page is silent (no errors). Making sound
  declarative per component is the next step.
- **History header rule**: history sets `theme-light` / `hdr-solid` with its own rule; it belongs with the header
  rendering.

## 7. Editing and rebuilding

Edit `assets/css/style.css` and `assets/js/script.js`, then:

```bash
npx esbuild@0.24.0 assets/css/style.css --minify --outfile=assets/css/style.min.css
npx esbuild@0.24.0 assets/js/script.js --minify --outfile=assets/js/script.min.js
```
