import { SITE_TOKEN_PLACEHOLDER, SITE_URL_PLACEHOLDER } from "@/lib/ai/site-constants";
import type { ServeSite } from "@/lib/modules/website";
import type { LeadFormMeta } from "@/lib/site/lead-goals";
import { withLeadFormFeed } from "@/lib/site/lead-form";
import { withBookingFeed, type BookingMeta } from "@/lib/site/booking";
import { extractAccentColor } from "@/lib/site/accent";

// Generated tenant sites are served as the REAL HTML document (not an iframe) so
// search engines get full content. Previews are served too, but in PREVIEW MODE:
// a banner + noindex, until the customer approves & launches.

const PAGE_CACHE = "public, s-maxage=60, stale-while-revalidate=86400";

function htmlResponse(body: string, status = 200, cache = PAGE_CACHE): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache },
  });
}

function originFromRequest(req: Request): string {
  const host = req.headers.get("host") ?? "";
  const proto = host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

function notFoundDoc(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex"/><title>Coming soon</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafaf9;color:#1c1917}</style></head><body><div style="text-align:center"><h1 style="font-size:1.5rem;font-weight:600">Coming soon</h1><p style="opacity:.6">This site isn't published yet.</p></div></body></html>`;
}

// Injected into <head>: noindex + room for the banner + the pulse animation.
const PREVIEW_HEAD = `<meta name="robots" content="noindex"/><style>body{padding-bottom:80px!important}@keyframes pbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.75)}}</style>`;

// Safety net for preview sites: public form submissions are accepted but NOT delivered
// (the API returns { demo:true }). A form's own JS may still flash a "thanks, we'll be in
// touch" message — which is misleading in preview. This intercepts any public-API response
// and, when it's a demo, surfaces an unmistakable notice that nothing was sent or saved.
// Covers sites generated before form-level demo handling existed. Preview-only.
const PREVIEW_LEAD_GUARD = `<script>(function(){if(window.__pbDemoGuard)return;window.__pbDemoGuard=1;var of=window.fetch;if(typeof of!=='function')return;window.fetch=function(input){var url=typeof input==='string'?input:(input&&input.url)||'';var p=of.apply(this,arguments);if(/\\/api\\/v1\\/public\\//.test(url)){p.then(function(r){try{r.clone().json().then(function(d){if(d&&d.demo)notice();}).catch(function(){});}catch(e){}});}return p;};function notice(){var t=document.getElementById('pb-demo-notice');if(!t){t=document.createElement('div');t.id='pb-demo-notice';t.setAttribute('role','status');t.style.cssText='position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:2147483647;max-width:92vw;background:#1c1917;color:#fbbf24;font:600 14px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 10px 34px rgba(0,0,0,.4);border:1px solid #b45309;text-align:center';document.body.appendChild(t);}t.textContent='\\uD83D\\uDC1D Preview mode — this is a demo. Your message was not sent or saved.';t.style.display='block';}})();</script>`;

// A loud, unmistakable "this is a preview" bar pinned to the bottom.
const PREVIEW_BANNER = `<div role="status" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:linear-gradient(90deg,#f59e0b 0%,#fbbf24 100%);color:#1c1917;font:700 15px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;padding:14px 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px 14px;text-align:center;box-shadow:0 -6px 28px rgba(245,158,11,.5);border-top:3px solid #b45309"><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:50%;background:#dc2626;box-shadow:0 0 0 4px rgba(220,38,38,.25);animation:pbPulse 1.3s ease-in-out infinite"></span><strong style="background:#1c1917;color:#fbbf24;padding:3px 9px;border-radius:6px;font-size:12px;letter-spacing:.06em">🐝 FREE PREVIEW</strong></span><span>This site isn't live yet — approve it in your PageBee dashboard to launch.</span></div>`;

// Speed up first paint: warm the connections to Google Fonts and the Motion ESM CDN before
// the parser reaches them. (Tailwind is precompiled into the document at generation time, so
// there is normally no Tailwind CDN connection to warm.) Injected at the top of <head> so the
// preconnects fire first.
const PERF_HEAD =
  `<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin/>` +
  `<link rel="preconnect" href="https://fonts.googleapis.com"/>` +
  `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>`;

// Reveal controller — the PLATFORM owns load/scroll reveal so it never depends on the Motion
// CDN import resolving. The contract: generated sites mark elements with [data-reveal] but must
// NOT hide them in their own CSS/JS. This script (a sync <script> at end of <body>, so it runs
// before first paint — no flash):
//   • ABOVE the fold → a brief STAGGERED LOAD-IN entrance (fade + slide up) so the first screen
//     (hero, first cards) feels alive on load instead of snapping in;
//   • BELOW the fold → hidden, then fades in on scroll via IntersectionObserver;
//   • hard-reveals anything still hidden after a timeout, reveals all on reduced-motion or any
//     error — never leaves content stuck invisible.
const REVEAL_CONTROLLER = `<script>(function(){try{var els=[].slice.call(document.querySelectorAll('[data-reveal]'));if(!els.length)return;var show=function(el){el.style.setProperty('opacity','1','important');el.style.setProperty('transform','none','important');};var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduce||!('IntersectionObserver'in window)){els.forEach(show);return;}var vh=window.innerHeight||document.documentElement.clientHeight;var hidden=[],intro=[],ii=0;els.forEach(function(el){var r=el.getBoundingClientRect();var off=(r.width||r.height)&&r.top>vh*0.92;el.style.opacity='0';el.style.transform='translateY('+(off?22:14)+'px)';if(off){el.style.transition='opacity .6s ease, transform .6s ease';hidden.push(el);}else{intro.push(el);var d=Math.min(ii++,10)*55;(function(el,d){requestAnimationFrame(function(){requestAnimationFrame(function(){el.style.transition='opacity .55s ease '+d+'ms, transform .55s ease '+d+'ms';show(el);});});})(el,d);}});var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){show(e.target);io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px',threshold:0.05});hidden.forEach(function(el){io.observe(el);});setTimeout(function(){hidden.forEach(function(el){if(getComputedStyle(el).opacity==='0')show(el);});},1200);setTimeout(function(){intro.forEach(function(el){if(getComputedStyle(el).opacity!=='1')show(el);});},1600);}catch(e){[].forEach.call(document.querySelectorAll('[data-reveal]'),function(el){el.style.setProperty('opacity','1','important');});}})();</script>`;

// Gallery guard — hard backstop for the "no Gallery unless chosen" rule. Generated sites whose
// owner did NOT pick a Gallery page carry data-pb-nogallery on <body>; this removes any orphan
// photo-grid (a container holding 2+ images with little/no text) that the model adds anyway —
// the strip/grid/wall of photos the model doesn't label "gallery". Skips the services feed,
// header/footer/nav, and any block with a form, and only strips near-text-free image clusters.
const GALLERY_GUARD = `<script>(function(){try{if(!document.body||!document.body.hasAttribute('data-pb-nogallery'))return;var seen=[];[].slice.call(document.querySelectorAll('img')).forEach(function(img){var el=img,c=null;for(var i=0;i<5&&el&&el.parentElement;i++){el=el.parentElement;if(el.querySelectorAll('img').length>=2){c=el;break;}}if(!c||seen.indexOf(c)>=0)return;seen.push(c);if(c.closest('[data-pb-services]')||c.closest('[data-pb-gallery]')||c.closest('header')||c.closest('footer')||c.closest('nav')||c.querySelector('form'))return;if(c.querySelectorAll('img').length>=2&&(c.textContent||'').trim().length<40){c.remove();}});}catch(e){}})();</script>`;

// ── Live photo gallery ────────────────────────────────────────────────────────
// The gallery is hydrated from the owner's Media library on every page load, like services. A
// generated site may carry a [data-pb-gallery] section (with an empty [data-pb-gallery-grid] and a
// data-pb-gallery-mode of "preview" inline | "full" dedicated page); if it has none and the feature
// is on with images, this script CREATES one (so existing sites light up without a rebuild). The
// feed returns images only while the gallery feature is enabled — disable it (or remove all photos)
// and the section is hidden. "preview" shows the latest 5 with a "+N more" overlay on the last tile;
// "full" shows every photo. Any tile opens a lightbox over the full set.
const GALLERY_STYLES =
  `<style>` +
  `.pb-gallery-section{padding:48px 20px}` +
  `.pb-gallery-wrap{max-width:1100px;margin:0 auto}` +
  `.pb-gallery-title{font-size:clamp(1.4rem,3vw,2rem);font-weight:700;margin:0 0 18px}` +
  `[data-pb-gallery-grid]{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}` +
  `.pb-gallery-tile{position:relative;padding:0;border:0;background:#e7e5e4;border-radius:12px;overflow:hidden;cursor:pointer;aspect-ratio:1/1}` +
  `.pb-gallery-tile img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s ease}` +
  `.pb-gallery-tile:hover img{transform:scale(1.06)}` +
  `.pb-gallery-more{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(28,25,23,.62);color:#fff;font:600 1.05rem/1 ui-sans-serif,system-ui,sans-serif}` +
  `.pb-lb{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.92)}` +
  `.pb-lb.open{display:flex}` +
  `.pb-lb-img{max-width:90vw;max-height:86vh;object-fit:contain;border-radius:6px;box-shadow:0 10px 50px rgba(0,0,0,.5)}` +
  `.pb-lb-x{position:absolute;top:16px;right:20px;background:none;border:0;color:#fff;font-size:34px;line-height:1;cursor:pointer;opacity:.85}` +
  `.pb-lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);border:0;color:#fff;font-size:28px;width:48px;height:48px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center}` +
  `.pb-lb-prev{left:16px}.pb-lb-next{right:16px}` +
  `.pb-lb-x:hover,.pb-lb-nav:hover{opacity:1;background:rgba(255,255,255,.22)}` +
  `@media(max-width:640px){[data-pb-gallery-grid]{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}}` +
  `</style>`;

function galleryFeedScript(token: string): string {
  return (
    "<script>(function(){try{" +
    "var TOKEN=" + JSON.stringify(token) + ",PREVIEW=5;" +
    "function build(sec,imgs){var grid=sec.querySelector('[data-pb-gallery-grid]')||sec;" +
    "var mode=sec.getAttribute('data-pb-gallery-mode')||'preview';grid.innerHTML='';" +
    "var limit=mode==='full'?imgs.length:Math.min(imgs.length,PREVIEW);" +
    "for(var i=0;i<limit;i++){var im=imgs[i];var t=document.createElement('button');t.type='button';t.className='pb-gallery-tile';t.setAttribute('data-pb-gi',String(i));" +
    "var g=document.createElement('img');g.src=im.url;g.alt=im.alt||'';g.loading='lazy';g.decoding='async';t.appendChild(g);" +
    "if(mode!=='full'&&i===limit-1&&imgs.length>limit){var ov=document.createElement('span');ov.className='pb-gallery-more';ov.textContent='+'+(imgs.length-limit)+' more';t.appendChild(ov);}" +
    "grid.appendChild(t);}sec.style.removeProperty('display');}" +
    "function mount(){var sec=document.createElement('section');sec.setAttribute('data-pb-gallery','');sec.setAttribute('data-pb-gallery-mode','preview');sec.className='pb-gallery-section';" +
    "sec.innerHTML='<div class=\"pb-gallery-wrap\"><h2 class=\"pb-gallery-title\">Gallery</h2><div data-pb-gallery-grid></div></div>';" +
    // Keep the footer last. Find the footer (even a non-semantic <div class=\"…footer…\">); if it lives
    // inside a [data-page] wrapper (single-page sites wrap everything — incl. the footer — in one), insert
    // right before it. Only a GLOBAL footer (outside the pages) means a multi-page site → drop the gallery
    // into the home page instead. Fall back to <main>/body when there's no footer at all.
    "var f=document.querySelector('footer,[role=contentinfo]');" +
    "if(!f){var k=document.body.children;for(var i=k.length-1;i>=0;i--){var el=k[i],t=el.tagName;if(t==='SCRIPT'||t==='STYLE'||t==='LINK'||t==='NOSCRIPT'||t==='TEMPLATE')continue;var c=((el.className||'')+'').toLowerCase();if(t==='FOOTER'||el.getAttribute('role')==='contentinfo'||c.indexOf('footer')>=0)f=el;break;}}" +
    "var pages=document.querySelectorAll('[data-page]');" +
    "if(f&&f.parentNode){var op=f.closest?f.closest('[data-page]'):null;if(!op&&pages.length){pages[0].appendChild(sec);}else{f.parentNode.insertBefore(sec,f);}}" +
    "else if(pages.length){pages[0].appendChild(sec);}else{var m=document.querySelector('main');(m||document.body).appendChild(sec);}return sec;}" +
    "function lightbox(imgs){var lb=document.createElement('div');lb.className='pb-lb';lb.setAttribute('aria-hidden','true');" +
    "lb.innerHTML='<button class=\"pb-lb-x\" aria-label=\"Close\">\\u00D7</button><button class=\"pb-lb-nav pb-lb-prev\" aria-label=\"Previous\">\\u2039</button><img class=\"pb-lb-img\" alt=\"\"/><button class=\"pb-lb-nav pb-lb-next\" aria-label=\"Next\">\\u203A</button>';" +
    "document.body.appendChild(lb);var idx=0,imgEl=lb.querySelector('.pb-lb-img');" +
    "function render(){var im=imgs[idx];if(im){imgEl.src=im.url;imgEl.alt=im.alt||'';}}" +
    "function open(i){idx=(i+imgs.length)%imgs.length;render();lb.classList.add('open');lb.setAttribute('aria-hidden','false');document.documentElement.style.overflow='hidden';}" +
    "function close(){lb.classList.remove('open');lb.setAttribute('aria-hidden','true');document.documentElement.style.removeProperty('overflow');}" +
    "function go(d){idx=(idx+d+imgs.length)%imgs.length;render();}" +
    "lb.querySelector('.pb-lb-x').addEventListener('click',close);" +
    "lb.querySelector('.pb-lb-prev').addEventListener('click',function(e){e.stopPropagation();go(-1);});" +
    "lb.querySelector('.pb-lb-next').addEventListener('click',function(e){e.stopPropagation();go(1);});" +
    "lb.addEventListener('click',function(e){if(e.target===lb||e.target===imgEl)close();});" +
    "document.addEventListener('keydown',function(e){if(!lb.classList.contains('open'))return;if(e.key==='Escape')close();else if(e.key==='ArrowLeft')go(-1);else if(e.key==='ArrowRight')go(1);});" +
    "document.addEventListener('click',function(e){var t=e.target.closest?e.target.closest('[data-pb-gi]'):null;if(!t)return;e.preventDefault();open(parseInt(t.getAttribute('data-pb-gi'),10)||0);});}" +
    "fetch('/api/v1/public/gallery',{headers:{'Authorization':'Bearer '+TOKEN}}).then(function(r){return r.json();}).then(function(d){" +
    "var imgs=(d&&d.images)||[];var mounts=[].slice.call(document.querySelectorAll('[data-pb-gallery]'));" +
    "if(!mounts.length){if(!imgs.length)return;mounts=[mount()];}" +
    "if(!imgs.length){mounts.forEach(function(s){s.style.display='none';});return;}" +
    "mounts.forEach(function(s){build(s,imgs);});lightbox(imgs);" +
    "}).catch(function(){});" +
    "}catch(e){}})();</script>"
  );
}

function withGalleryFeed(doc: string, token: string): string {
  let out = doc.includes("</head>") ? doc.replace("</head>", `${GALLERY_STYLES}</head>`) : `${GALLERY_STYLES}${doc}`;
  const script = galleryFeedScript(token);
  out = out.includes("</body>") ? out.replace("</body>", `${script}</body>`) : out + script;
  return out;
}

// ── Live services feed ────────────────────────────────────────────────────────
// The services section is the one part of a generated site that must stay in sync with the
// owner's catalog WITHOUT a rebuild. Generated sites render their current services as cards in
// a [data-pb-services] container (first paint + SEO + no-JS fallback); this hydrator, injected
// at serve time, fetches the owner's on-website services and rebuilds the cards from the FIRST
// card as a template, so add/remove/edit surfaces on every page load. Fails silent: on any
// error or an empty list it leaves the server-rendered cards untouched.
function servicesFeedScript(token: string): string {
  return (
    "<script>(function(){try{" +
    "var boxes=[].slice.call(document.querySelectorAll('[data-pb-services]'));if(!boxes.length)return;" +
    "var clear=function(el){el.style.removeProperty('opacity');el.style.removeProperty('transform');" +
    "[].forEach.call(el.querySelectorAll('[data-reveal]'),function(n){n.style.removeProperty('opacity');n.style.removeProperty('transform');});};" +
    "fetch('/api/v1/public/services',{headers:{'Authorization':'Bearer " + token + "'}})" +
    ".then(function(r){return r.json();}).then(function(d){" +
    "var items=(d&&d.services)||[];if(!items.length)return;" +
    // Editorial fields (price, duration/hours) are controlled by the OWNER's explicit Services-tab
    // toggles (returned by the feed as showPrice/showDuration), which override any per-site default.
    // Off → no card shows that field; on → cards that have the value show it (a service without a
    // price still shows nothing). Core fields (icon/name/desc) are always rendered.
    "var showPrices=!!(d&&d.showPrice),showDuration=!!(d&&d.showDuration);" +
    "boxes.forEach(function(box){var tpl=box.querySelector('[data-pb-service-card]');if(!tpl)return;" +
    "tpl=tpl.cloneNode(true);" +
    "var frag=document.createDocumentFragment();" +
    "var field=function(el,ok,val){if(!el)return;if(ok&&val){el.textContent=val;el.style.removeProperty('display');}else{el.style.display='none';}};" +
    "items.forEach(function(s){var c=tpl.cloneNode(true);clear(c);" +
    "var q=function(a){return c.querySelector('['+a+']');};" +
    "var ic=q('data-pb-icon');if(ic&&s.iconSvg)ic.innerHTML=s.iconSvg;" +
    "var nm=q('data-pb-name');if(nm)nm.textContent=s.title||'';" +
    "var de=q('data-pb-desc');if(de)de.textContent=s.description||'';" +
    // Some generated cards have a price slot but no duration slot. When "show time" is on and the
    // duration slot is missing, synthesize one from the price slot (same styling/placement) so the
    // toggle works on existing sites too.
    "var pr=q('data-pb-price'),du=q('data-pb-duration');" +
    "if(showDuration&&!du&&pr&&pr.parentNode){du=pr.cloneNode(false);du.removeAttribute('data-pb-price');du.setAttribute('data-pb-duration','');pr.parentNode.insertBefore(du,pr);}" +
    "field(du,showDuration,s.durationLabel);" +
    "field(pr,showPrices,s.priceLabel);" +
    // When BOTH time and price show on a card, wrap just those two in their own flex row so they sit
    // at opposite ends (time left, price right) — without restyling the card itself (the price slot
    // is sometimes a direct child of the card root). When only one shows, leave the layout as-is.
    "if(showDuration&&s.durationLabel&&showPrices&&s.priceLabel&&du&&pr&&du.parentNode){var w=document.createElement('div');w.style.cssText='display:flex;flex-direction:row;flex-wrap:nowrap;width:100%;align-items:center;justify-content:space-between;gap:12px';du.parentNode.insertBefore(w,du);w.appendChild(du);w.appendChild(pr);}" +
    "frag.appendChild(c);});" +
    "box.innerHTML='';box.appendChild(frag);});" +
    "}).catch(function(){});" +
    "}catch(e){}})();</script>"
  );
}

function withServicesFeed(doc: string, token: string): string {
  const script = servicesFeedScript(token);
  return doc.includes("</body>") ? doc.replace("</body>", `${script}</body>`) : doc + script;
}

// Tint the PLATFORM-owned components (lead form + booking trigger/modal) with the site's REAL
// accent color, so their buttons, focus rings, and selected chips match the generated page instead
// of the amber default. The components style off var(--pb-lf-accent) / var(--pb-bk-accent); we set
// those :root vars from the color the site actually uses (extracted from its HTML). No-op when no
// brand color is found (keeps the amber fallback). `sourceHtml` is the original generated document
// (the lead/booking sections are stripped out of it, but the hero/CTA colors remain to read from).
function withThemeAccent(doc: string, sourceHtml: string): string {
  const accent = extractAccentColor(sourceHtml);
  if (!accent) return doc;
  const style = `<style>:root{--pb-lf-accent:${accent};--pb-bk-accent:${accent}}</style>`;
  return doc.includes("</head>") ? doc.replace("</head>", `${style}</head>`) : `${style}${doc}`;
}

function withMotionFailsafe(doc: string): string {
  let out = doc.includes("<head>")
    ? doc.replace("<head>", `<head>${PERF_HEAD}`)
    : doc.includes("</head>")
      ? doc.replace("</head>", `${PERF_HEAD}</head>`)
      : `${PERF_HEAD}${doc}`;
  // Gallery guard runs BEFORE the reveal controller (strip orphan photo-grids before revealing them).
  out = out.includes("</body>")
    ? out.replace("</body>", `${GALLERY_GUARD}${REVEAL_CONTROLLER}</body>`)
    : out + GALLERY_GUARD + REVEAL_CONTROLLER;
  return out;
}

// ── Client-side router for multi-page generated sites ─────────────────────────
// Generated sites split their content into <div data-page="/path" data-title="…">
// wrappers plus a real <nav> of /path links. PageBee injects this router at serve
// time so navigation is deterministic (not hand-written per site): it shows the
// [data-page] matching the URL, animates the transition, highlights the active nav
// link, closes the mobile menu, and wires deep links + browser back/forward.
//
// Failsafe-first: a pure-CSS rule keeps ONLY the first page visible without JS, so
// if the script never runs the home page still renders (never a blank site). The
// router uses explicit inline display values to override that rule at runtime.
const ROUTER_HEAD = `<style>[data-page]~[data-page]{display:none}@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}</style>`;

/** Path-based (published, served at host root) or hash-based (preview, served at /preview). */
function clientRouterScript(mode: "path" | "hash"): string {
  return (
    "<script>(function(){" +
    "var MODE=" + JSON.stringify(mode) + ";" +
    "var pages=[].slice.call(document.querySelectorAll('[data-page]'));" +
    // SINGLE-PAGE sites (no [data-page]): no routing — just light up the in-page
    // anchor nav with a scroll-spy and close the mobile menu on tap. Smooth scroll
    // comes from CSS above. The router only takes over when real pages exist.
    "if(!pages.length){spy();return;}" +
    "function spy(){var links=[].slice.call(document.querySelectorAll('nav a[href^=\"#\"]'));if(!links.length)return;" +
    "document.addEventListener('click',function(e){var a=e.target.closest?e.target.closest('nav a[href^=\"#\"]'):null;if(!a)return;[].forEach.call(document.querySelectorAll('[data-menu]'),function(m){m.setAttribute('hidden','');});[].forEach.call(document.querySelectorAll('[aria-controls][aria-expanded]'),function(b){b.setAttribute('aria-expanded','false');});});" +
    "if(!('IntersectionObserver'in window))return;var map={};links.forEach(function(a){var id=(a.getAttribute('href')||'').slice(1);var s=id&&document.getElementById(id);if(s)map[s.id]=a;});" +
    "var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.classList.remove('is-active');a.removeAttribute('aria-current');});var a=map[e.target.id];if(a){a.classList.add('is-active');a.setAttribute('aria-current','true');}}});},{rootMargin:'-45% 0px -50% 0px'});" +
    "Object.keys(map).forEach(function(id){io.observe(document.getElementById(id));});}" +
    "var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;" +
    "function esc(id){return window.CSS&&CSS.escape?CSS.escape(id):id;}" +
    "function findById(scope,id){try{return scope.querySelector('#'+esc(id));}catch(e){return null;}}" +
    "function ownerPageOf(id){for(var i=0;i<pages.length;i++){if(findById(pages[i],id))return pages[i];}return null;}" +
    "function norm(p){p=(p||'/').split('#')[0].split('?')[0].replace(/\\/+$/,'');return p===''?'/':p;}" +
    "function key(){return MODE==='hash'?(norm((location.hash||'').replace(/^#/,''))||'/'):norm(location.pathname);}" +
    "function pageFor(path){path=norm(path);for(var i=0;i<pages.length;i++){if(norm(pages[i].getAttribute('data-page'))===path)return pages[i];}return null;}" +
    // SAFETY NET — shared chrome (header/footer/nav) must live OUTSIDE the [data-page]
    // wrappers so it persists across pages. A generated site that mistakenly nested the
    // header inside one page (e.g. the home page) would lose its nav on every other page,
    // because we hide all non-active pages. Hoist a trapped header/footer out to be a
    // sibling of the pages (dedupe if several pages each carry one). Only acts when at
    // least one page LACKS its own — i.e. the actual broken case — so sites that already
    // place chrome correctly, or intentionally vary it per page, are left untouched.
    "function hoist(sel,after){var nodes=[].slice.call(document.querySelectorAll(sel)).filter(function(n){return n.closest('[data-page]');});if(!nodes.length)return;var anyWithout=pages.some(function(p){return !p.querySelector(sel);});if(!anyWithout)return;var keep=nodes[0],parent=pages[0].parentNode;if(!parent)return;if(after){parent.insertBefore(keep,pages[pages.length-1].nextSibling);}else{parent.insertBefore(keep,pages[0]);}for(var i=1;i<nodes.length;i++){if(nodes[i].parentNode)nodes[i].parentNode.removeChild(nodes[i]);}}" +
    "hoist('header,[role=banner]',false);hoist('footer,[role=contentinfo]',true);" +
    "function revealIn(scope){[].forEach.call(scope.querySelectorAll('[data-reveal]'),function(el){if(!reduce)el.style.transition='opacity .5s ease, transform .5s ease';el.style.setProperty('opacity','1','important');el.style.setProperty('transform','none','important');});}" +
    "function setActive(path){[].forEach.call(document.querySelectorAll('nav a[href^=\"/\"]'),function(a){var on=norm(a.getAttribute('href'))===path;if(on){a.classList.add('is-active');a.setAttribute('aria-current','page');}else{a.classList.remove('is-active');a.removeAttribute('aria-current');}});}" +
    "function closeMenus(){[].forEach.call(document.querySelectorAll('[data-menu]'),function(m){m.setAttribute('hidden','');});[].forEach.call(document.querySelectorAll('[aria-controls][aria-expanded]'),function(b){b.setAttribute('aria-expanded','false');});}" +
    "function scrollToId(scope,id){var el=findById(scope,id);if(el&&el.scrollIntoView){requestAnimationFrame(function(){el.scrollIntoView(reduce?{block:'start'}:{behavior:'smooth',block:'start'});});}}" +
    "var current=null,pendingAnchor='';" +
    "function show(path,initial,anchor){var next=pageFor(path)||pageFor('/')||pages[0];if(!next)return;" +
    "for(var i=0;i<pages.length;i++){if(pages[i]!==next){pages[i].style.display='none';}}" +
    "next.removeAttribute('hidden');next.style.display='block';" +
    "var t=next.getAttribute('data-title');if(t)document.title=t;" +
    "setActive(norm(path));closeMenus();" +
    "if(current&&current!==next&&!anchor)window.scrollTo(0,0);" +
    "if(!initial){if(!reduce){next.style.opacity='0';next.style.transform='translateY(14px)';requestAnimationFrame(function(){next.style.transition='opacity .45s ease, transform .45s ease';next.style.opacity='1';next.style.transform='none';});}revealIn(next);}" +
    "if(anchor)scrollToId(next,anchor);" +
    "current=next;try{document.dispatchEvent(new CustomEvent('pagebee:navigate',{detail:{path:norm(path)}}));}catch(e){}}" +
    "function go(path,anchor){path=norm(path);if(!pageFor(path))return;if(MODE==='hash'){pendingAnchor=anchor||'';if(norm((location.hash||'').replace(/^#/,''))!==path){location.hash='#'+path;}else{pendingAnchor='';show(path,false,anchor);}}else{if(norm(location.pathname)!==path)history.pushState({p:path},'',path);show(path,false,anchor);}}" +
    "document.addEventListener('click',function(e){var a=e.target.closest?e.target.closest('a[href]'):null;if(!a)return;" +
    "if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;" +
    "if(a.target==='_blank'||a.hasAttribute('download'))return;" +
    "var href=a.getAttribute('href')||'';" +
    // In-page #anchor links: if the target id isn't on the CURRENT page but lives on
    // another [data-page] (e.g. a 'Get a Quote' CTA href="#contact" while the contact
    // form is on /contact), navigate to that page and scroll to it. Same-page anchors
    // fall through to the browser's native scroll.
    "if(href.charAt(0)==='#'){if(href.length<2)return;var aid=href.slice(1);if(current&&findById(current,aid))return;var owner=ownerPageOf(aid);if(owner){e.preventDefault();go(norm(owner.getAttribute('data-page')),aid);}return;}" +
    "if(href.charAt(0)!=='/')return;" +
    "var hi=href.indexOf('#');var anchor=hi>=0?href.slice(hi+1):'';var path=norm(href);if(!pageFor(path))return;e.preventDefault();go(path,anchor);});" +
    "if(MODE==='hash'){addEventListener('hashchange',function(){var a=pendingAnchor;pendingAnchor='';show(key(),false,a);});}else{addEventListener('popstate',function(){show(key(),false);});}" +
    "show(key(),true);" +
    "})();</script>"
  );
}

function withClientRouter(doc: string, mode: "path" | "hash"): string {
  let out = doc.includes("</head>") ? doc.replace("</head>", `${ROUTER_HEAD}</head>`) : `${ROUTER_HEAD}${doc}`;
  const script = clientRouterScript(mode);
  out = out.includes("</body>") ? out.replace("</body>", `${script}</body>`) : out + script;
  return out;
}

/** Inject noindex + a prominent preview banner into a generated document. */
function applyPreviewMode(doc: string): string {
  let out = doc;
  out = out.includes("</head>") ? out.replace("</head>", `${PREVIEW_HEAD}</head>`) : `${PREVIEW_HEAD}${out}`;
  const tail = `${PREVIEW_LEAD_GUARD}${PREVIEW_BANNER}`;
  out = out.includes("</body>") ? out.replace("</body>", `${tail}</body>`) : out + tail;
  return out;
}

// ── Annotate (review) frame ──────────────────────────────────────────────────
// A generated version rendered for Figma-style review: noindex, no preview banner,
// hash routing, plus a postMessage bridge so the React parent can place/position
// pin comments. The bridge only talks to its parent window (same origin).
const ANNOTATE_HEAD =
  `<meta name="robots" content="noindex"/>` +
  `<style>body.pb-picking,body.pb-picking *{cursor:crosshair!important}` +
  `.pb-hl{outline:2px solid #f59e0b!important;outline-offset:2px!important;border-radius:2px}</style>`;

function annotateBridge(): string {
  return (
    "<script>(function(){" +
    "if(window.parent===window)return;" + // only meaningful inside an iframe
    "var PICKING=false,RC=false,HL=null,WANT=[],tR;" +
    "function send(m){try{window.parent.postMessage(m,location.origin);}catch(e){}}" +
    "function cssPath(el){if(el.id)return'#'+(window.CSS&&CSS.escape?CSS.escape(el.id):el.id);var parts=[];" +
    "while(el&&el.nodeType===1&&el!==document.body&&parts.length<8){var tag=el.tagName.toLowerCase();var p=el.parentNode;" +
    "if(p){var sibs=[].filter.call(p.children,function(c){return c.tagName===el.tagName;});if(sibs.length>1)tag+=':nth-of-type('+(sibs.indexOf(el)+1)+')';}" +
    "parts.unshift(tag);el=p;}return parts.join(' > ');}" +
    "function pagePath(){var ps=document.querySelectorAll('[data-page]');for(var i=0;i<ps.length;i++){if(getComputedStyle(ps[i]).display!=='none')return ps[i].getAttribute('data-page')||'/';}return'/';}" +
    "function rectFor(sel){try{var el=document.querySelector(sel);if(!el)return null;var r=el.getBoundingClientRect();return{x:r.left,y:r.top,w:r.width,h:r.height};}catch(e){return null;}}" +
    "function pushRects(){var pp=pagePath(),out={};WANT.forEach(function(p){if(p.pagePath!==pp)return;var r=rectFor(p.selector);if(r)out[p.id]=r;});send({type:'pb:rects',rects:out,pagePath:pp});}" +
    "function schedule(){clearTimeout(tR);tR=setTimeout(pushRects,60);}" +
    "addEventListener('scroll',schedule,true);addEventListener('resize',schedule);" +
    "document.addEventListener('pagebee:navigate',function(e){send({type:'pb:navigate',pagePath:(e.detail&&e.detail.path)||pagePath()});schedule();});" +
    "function emitPick(el,cx,cy){if(!el||el.nodeType!==1)el=document.body;var r=el.getBoundingClientRect();" +
    "var fx=r.width?(cx-r.left)/r.width:0.5,fy=r.height?(cy-r.top)/r.height:0.5;" +
    "send({type:'pb:pick',anchor:{pagePath:pagePath(),selector:cssPath(el),anchorText:(el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80),x:Math.max(0,Math.min(1,fx)),y:Math.max(0,Math.min(1,fy))},rect:{x:r.left,y:r.top,w:r.width,h:r.height}});}" +
    // Left-click only counts while "Add comment" pick mode is armed.
    "document.addEventListener('click',function(e){if(!PICKING)return;e.preventDefault();e.stopPropagation();emitPick(e.target,e.clientX,e.clientY);PICKING=false;document.body.classList.remove('pb-picking');send({type:'pb:pick-mode',on:false});},true);" +
    // Right-click is a one-step shortcut whenever commenting is allowed (suppresses the native menu).
    "document.addEventListener('contextmenu',function(e){if(!RC)return;e.preventDefault();e.stopPropagation();emitPick(e.target,e.clientX,e.clientY);},true);" +
    "addEventListener('message',function(e){if(e.source!==window.parent)return;var m=e.data||{};" +
    "if(m.type==='pb:want'){WANT=m.pins||[];pushRects();}" +
    "else if(m.type==='pb:rc'){RC=!!m.on;}" +
    "else if(m.type==='pb:pick-mode'){PICKING=!!m.on;document.body.classList.toggle('pb-picking',PICKING);}" +
    "else if(m.type==='pb:goto'){if(m.pagePath){location.hash='#'+m.pagePath;schedule();}}" +
    "else if(m.type==='pb:highlight'){if(HL){HL.classList.remove('pb-hl');HL=null;}if(m.selector){try{HL=document.querySelector(m.selector);if(HL){HL.classList.add('pb-hl');HL.scrollIntoView({block:'center',behavior:'smooth'});}}catch(x){}}}" +
    "});" +
    "setTimeout(function(){send({type:'pb:ready',pagePath:pagePath()});},60);" +
    "})();</script>"
  );
}

/** Render a version's HTML for in-app review (admin queue or client markup). Same origin only. */
export function serveReviewFrame(
  html: string,
  siteToken: string,
  req: Request,
  leadForm?: LeadFormMeta,
  booking?: BookingMeta | null,
): Response {
  const origin = originFromRequest(req);
  let doc = html.replaceAll(SITE_TOKEN_PLACEHOLDER, siteToken).replaceAll(SITE_URL_PLACEHOLDER, origin);
  doc = withMotionFailsafe(doc);
  doc = withServicesFeed(doc, siteToken);
  doc = withGalleryFeed(doc, siteToken);
  doc = withLeadFormFeed(doc, siteToken, leadForm);
  doc = withBookingFeed(doc, siteToken, booking);
  doc = withThemeAccent(doc, html); // tint platform components to the site's accent
  doc = withClientRouter(doc, "hash"); // served at a single URL → hash routing
  doc = doc.includes("</head>") ? doc.replace("</head>", `${ANNOTATE_HEAD}</head>`) : `${ANNOTATE_HEAD}${doc}`;
  const bridge = annotateBridge();
  doc = doc.includes("</body>") ? doc.replace("</body>", `${bridge}</body>`) : doc + bridge;
  return htmlResponse(doc, 200, "private, no-store");
}

/** Serve a renderable tenant site (published or preview), robots/sitemap, or a 404 doc. */
export function serveTenant(site: ServeSite | null, req: Request, path?: string[]): Response {
  const origin = originFromRequest(req);
  const seg = (path ?? []).join("/");

  if (!site) {
    return htmlResponse(notFoundDoc(), 404, "public, max-age=0, must-revalidate");
  }

  if (seg === "robots.txt") {
    const body =
      site.kind === "preview"
        ? "User-agent: *\nDisallow: /\n"
        : `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": PAGE_CACHE },
    });
  }
  if (seg === "sitemap.xml") {
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>`;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": PAGE_CACHE },
    });
  }

  let doc = site.html.replaceAll(SITE_TOKEN_PLACEHOLDER, site.siteToken).replaceAll(SITE_URL_PLACEHOLDER, origin);
  doc = withMotionFailsafe(doc);
  doc = withServicesFeed(doc, site.siteToken);
  doc = withGalleryFeed(doc, site.siteToken);
  const isPreview = site.kind === "preview";
  doc = withLeadFormFeed(doc, site.siteToken, site.leadForm, isPreview);
  doc = withBookingFeed(doc, site.siteToken, site.booking, isPreview);
  doc = withThemeAccent(doc, site.html); // tint platform components to the site's accent
  // Published sites live at the host root → real sub-page paths. Previews are served
  // at the single /preview URL → hash routing, which survives refresh without 404s.
  doc = withClientRouter(doc, site.kind === "preview" ? "hash" : "path");
  if (site.kind === "preview") {
    doc = applyPreviewMode(doc);
    return htmlResponse(doc, 200, "private, no-store"); // previews change as the client revises
  }
  return htmlResponse(doc);
}
