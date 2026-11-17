# Sitecore handover: components, scripts and rich text

How the site's markup, CSS and JS map onto Sitecore: what is a coded template, what authors build in the rich text
(RTE) field, and what the RTE must be configured to keep.

## 1. What goes where

| Part | Sitecore | Notes |
|---|---|---|
| `<head>` assets | Layout | `assets/css/style.min.css`, `assets/js/script.min.js` (in `<head>`, **no** `defer`) |
| Header (`header.top`, sound toggle `#soundTgl`, `#soundState`) | Coded rendering | Dynamic. The menu overlay is built by the JS from the header |
| Footer (`.foot`) | Coded rendering | Dynamic |
| Page wrapper `<div class="pm-page pm-page--{type}">` | Page template | Sets the page theme (see 5). Components work without it |
| Home page (`index.html`) | **Coded page template** | Bespoke dive experience; its own engine (`HEAD.index` / `PAGE.index`). Make its copy editable through fields, not RTE |
| Everything else between header and footer | **Rich text field** | Components below; they start from their markup alone |

Script tag per page type:

```html
<!-- every page except home -->
<script src="/assets/js/script.min.js"></script>
<!-- home only -->
<script src="/assets/js/script.min.js" data-page="index"></script>
<script src="/assets/js/vendor/gsap-3.12.5.min.js" defer></script>
```

Only the home page needs `data-page`. On content pages it does nothing (the current pages still carry it; harmless):
everything, sound included, comes from the components' markup.

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
| Sound | `data-sound` on any element | See below |
| Light section | `[data-light]` on a reading section | Header lock-up turns navy while it passes under the header |

The video flags (`muted`, `playsinline`) are set by the script, so it does not matter if the RTE drops valueless
attributes from `<video>`.

### Sound (`data-sound`)

The page's sound mix is declared on the elements it follows. Nothing plays until the visitor turns sound on.

```
data-sound="stem gain [measure] [options]; stem gain ..."
```

- `stem`: a file in `assets/audio` (without `.m4a`); its bus and loop length are in `SOUND_KIT` in `script.js`.
  `gain` in dB.
- `measure`: `scene` (progress through the element's scene, default on a `.scene`), `view` (share of the screen
  the element covers, default elsewhere), `seen` (share of the element on screen), `page` (screens scrolled),
  `band a b` (1 while the element crosses that band of the screen), `always` (1).
- Without fades the level is the measure itself (0 to 1). Options: `in a b` (fade in), `out c d` (fade out),
  `base b` (floor), `x k` (scale), `duck stem k` (lower while another stem plays), `tc t` (smoothing),
  `shot at` (one-shot when the measure passes `at`), `cue on off fade` (start / stop a one-shot),
  `filter hz` (muffle everything while this level is above .5).
- The same stem on several elements: the loudest wins.

Examples from the site:

```html
<section class="scene" data-sound="music-drone-bed -14 always; music-oud-sparse -8 in .15 .6">            <!-- collection -->
<section class="scene" data-sound="amb-underwater -3 in -.05 .06 out .92 1.02 filter 900">               <!-- history -->
<section class="flow" data-sound="music-oud-sparse -7 view in .2 .6 duck music-deck-rhythm 1">            <!-- history -->
<div class="flow flow--tray" data-sound="sfx-pearls-pour 0 band .3 .55 shot .5">                          <!-- collection -->
```

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

## 5. CSS: components and page themes

- **Component styles work on any page.** A rule that names a class used by one component (`.era__plane`,
  `.yr__n`, `.loupe__ring`, `.k1-box`, ...) applies wherever that component is placed, with or without the page
  wrapper.
- **Page themes need the wrapper.** 87 rules restyle shared names per page type and stay scoped to
  `.pm-page--{type}`. They cover how these look on that page type: `.note`, `.eyebrow` and `.prose` in cream
  sections, `.end__row` / `.end__doors` (the closing doors), `.map` / `.map__svg` / `.map__lbl` (merchants and visit
  maps differ), `.split__media`, `.gallery`, `.facts`, `.verse`, `.cap1`, `.door`, `.pill--solid`, `.form__note`,
  plus page-level settings on `html` / `body`. Choose the page type in the template to get that theme.
- A component moved to another page type keeps its own look; only those shared names follow the new page's theme
  (checked: coinage content under the about theme keeps 425 of 431 elements identical).
- The home page's styles (`.pm-page--index`) stay scoped: it is a template, not rich text.

## 6. Header behaviour (in the shared script)

The header reacts to the content under it; nothing is page-specific:

- `theme-light` (navy lock-up): over a scene with `data-theme="light"`, a `.flow--cream` section, or any
  `[data-light]` section.
- `head-backed` + `--head-tint` (blurred backing behind the header): over any reading section (`.flow`).
- `hdr-solid`: over any reading section or the footer (used by the history theme's solid bar).

## 7. Editing and rebuilding

Edit `assets/css/style.css` and `assets/js/script.js`, then:

```bash
npx esbuild@0.24.0 assets/css/style.css --minify --outfile=assets/css/style.min.css
npx esbuild@0.24.0 assets/js/script.js --minify --outfile=assets/js/script.min.js
```
