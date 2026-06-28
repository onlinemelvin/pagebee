import { CTA_DISABLED_LABEL, type LeadFormMeta } from "./lead-goals";
import { SUCCESS_CHECK_CSS, SUCCESS_CHECK_JS } from "./success-check";

// ── Lead-capture form: a platform-owned live component ────────────────────────
// The lead form is built for EVERY generated site (regardless of plan) so it matches the design,
// then stripped out of the page HTML into WebsiteVersion.leadFormHtml (see the generator + website
// service). At serve time it's injected back into a [data-pb-leadform-slot] — but ONLY when the
// plan allows forms AND the owner has the feature enabled. The platform owns the styling (its own
// `pb-lf-*` CSS, so it survives the page's precompiled-Tailwind) and the submit wiring (a single
// delegated handler), exactly like the gallery/services live feeds. This module is the single
// source of truth for all three: the markers used to extract it, the default markup, the CSS, and
// the runtime script.
// Comment markers wrap the form block in generated HTML so it can be extracted reliably (no DOM
// parser needed — a plain substring between markers). The generator emits them; splitLeadForm()
// below pulls the block out and leaves a slot in its place.
export const LEADFORM_START = "<!--pb:leadform:start-->";
export const LEADFORM_END = "<!--pb:leadform:end-->";
export const LEADFORM_SLOT = `<div data-pb-leadform-slot></div>`;

/**
 * Split a generated document into the page (with the form replaced by a slot) and the extracted
 * form HTML. Returns `leadFormHtml: null` when the document has no marked form (older sites /
 * surgical edits that already carry a slot) — callers carry the previous version's form forward.
 */
export function splitLeadForm(html: string): { pageHtml: string; leadFormHtml: string | null } {
  const start = html.indexOf(LEADFORM_START);
  const end = html.indexOf(LEADFORM_END);
  if (start === -1 || end === -1 || end < start) return { pageHtml: html, leadFormHtml: null };
  const inner = html.slice(start + LEADFORM_START.length, end).trim();
  const pageHtml = html.slice(0, start) + LEADFORM_SLOT + html.slice(end + LEADFORM_END.length);
  return { pageHtml, leadFormHtml: inner || null };
}

/**
 * The platform's default form markup — used for sites that have no stored bespoke form yet (existing
 * sites, or any generation that didn't emit one). Uses the `pb-lf-*` classes styled by LEADFORM_CSS.
 * `heading`/`blurb`/`cta` are tailored from the owner's intake where available.
 */
export function defaultLeadFormHtml(opts?: { heading?: string; blurb?: string; cta?: string }): string {
  const heading = opts?.heading ?? "Get in touch";
  const blurb = opts?.blurb ?? "Tell us what you need and we'll be in touch shortly.";
  const cta = opts?.cta ?? "Send message";
  return (
    `<section class="pb-lf-section" data-pb-leadform-host>` +
    `<div class="pb-lf-wrap">` +
    `<h2 class="pb-lf-title">${heading}</h2>` +
    `<p class="pb-lf-sub">${blurb}</p>` +
    `<form data-pb-leadform data-pb-lead-type="CONTACT_FORM" class="pb-lf-form" novalidate>` +
    `<label class="pb-lf-field"><span>Your name</span><input name="name" required autocomplete="name"/></label>` +
    `<label class="pb-lf-field"><span>Email</span><input name="email" type="email" required autocomplete="email"/></label>` +
    `<label class="pb-lf-field"><span>Phone</span><input name="phone" type="tel" required autocomplete="tel"/></label>` +
    `<label class="pb-lf-field"><span>How can we help?</span><textarea name="message" rows="4"></textarea></label>` +
    // Honeypot: hidden from real users (off-screen, not focusable, not announced). Bots that fill every
    // field populate it; the server silently drops any submission where it's non-empty.
    `<div class="pb-lf-hp" aria-hidden="true"><label>Company<input name="company" tabindex="-1" autocomplete="off"/></label></div>` +
    `<button type="submit" class="pb-lf-btn">${cta}</button>` +
    `<p class="pb-lf-status" data-pb-lead-status role="status" aria-live="polite"></p>` +
    `</form>` +
    `</div>` +
    `</section>`
  );
}

// Self-contained CSS (no Tailwind dependency) so the injected form looks right on every site,
// including AI sites that precompiled Tailwind away. Inherits the site's font; the accent is the
// --pb-lf-accent variable (amber default) so a generated site can tint it by setting that var.
export const LEADFORM_CSS =
  `<style>` +
  // No residue when the form isn't rendered. The slot ships EMPTY in the page (the form is stripped
  // out and injected at serve time only when enabled). These rules guarantee that an empty slot —
  // and a wrapper/"card" whose only child is that empty slot — collapse to zero space, so the rest of
  // the section flows naturally with no void or empty box. Also prevents a pre-hydration flash: the
  // slot stays hidden until the form is actually injected into it.
  `[data-pb-leadform-slot]:empty{display:none!important}` +
  `:where(section,div,aside,article,li):has(> [data-pb-leadform-slot]:empty:only-child){display:none!important}` +
  `.pb-lf-section{padding:48px 20px}` +
  `.pb-lf-wrap{max-width:560px;margin:0 auto}` +
  `.pb-lf-title{font-size:clamp(1.4rem,3vw,2rem);font-weight:700;margin:0 0 6px}` +
  `.pb-lf-sub{margin:0 0 20px;opacity:.7;font-size:.95rem}` +
  `.pb-lf-form{display:grid;gap:14px}` +
  `.pb-lf-field{display:grid;gap:6px;font-size:.85rem;font-weight:600}` +
  `.pb-lf-field em{font-weight:400;opacity:.6;font-style:normal}` +
  `.pb-lf-field input,.pb-lf-field textarea{font:inherit;font-weight:400;padding:12px 14px;border:1px solid rgba(120,113,108,.4);border-radius:12px;background:#fff;color:inherit;width:100%;box-sizing:border-box}` +
  `.pb-lf-field input:focus,.pb-lf-field textarea:focus{outline:none;border-color:var(--pb-lf-accent,#f59e0b);box-shadow:0 0 0 3px color-mix(in srgb,var(--pb-lf-accent,#f59e0b) 25%,transparent)}` +
  `.pb-lf-btn{margin-top:4px;padding:13px 22px;border:0;border-radius:9999px;background:var(--pb-lf-accent,#f59e0b);color:#fff;font:inherit;font-weight:700;cursor:pointer;transition:filter .2s ease,opacity .2s ease}` +
  `.pb-lf-btn:hover{filter:brightness(.94)}` +
  `.pb-lf-btn:disabled{opacity:.6;cursor:default}` +
  `.pb-lf-status{margin:2px 0 0;text-align:center;font-size:.9rem;min-height:1.2em;opacity:.85}` +
  `.pb-lf-status[data-tone=err]{color:#dc2626}` +
  `.pb-lf-status[data-tone=ok]{color:#16a34a}` +
  // Honeypot: kept in the DOM (so bots find + fill it) but off-screen and inert for real users.
  `.pb-lf-hp{position:absolute!important;left:-9999px!important;top:auto;width:1px;height:1px;overflow:hidden}` +
  SUCCESS_CHECK_CSS +
  `</style>`;

/**
 * Runtime: fetch the live status, inject the stored form into the page's slot (or build a Contact
 * section if the site has none), and wire submission — all platform-owned. Mirrors the gallery feed:
 * the feed returns the form HTML only while the feature is enabled, so a disabled feature leaves no
 * form. The submit handler is delegated, so it works on whatever markup the feed injects.
 */
export function leadFormFeedScript(token: string, meta?: LeadFormMeta | null, preview?: boolean): string {
  return (
    "<script>(function(){try{" +
    "var TOKEN=" + JSON.stringify(token) + ";" +
    // When the script first ran — used as the submit-timing baseline (elapsed sent as _t on submit, so
    // the server can drop implausibly fast = automated submissions).
    "var LOADED=Date.now();" +
    // In preview, ask the status feed for the PREVIEWED tier's state (so a free higher-tier preview
    // shows the form); empty on the live site → paid-plan state.
    "var PVQS=" + JSON.stringify(preview ? "?preview=1" : "") + ";" +
    // Goal state computed at serve time (may be briefly stale on cached pages — the fetch below
    // reconciles). Lets the runtime label the page CTA on first paint, with no fetch flicker.
    "var INIT=" + JSON.stringify(meta ?? null) + ";" +
    SUCCESS_CHECK_JS +
    // Replace the form with a confirmation panel after submit (and on later loads in the same session,
    // so the form isn't shown again). Text inherits the site theme; the check stays green.
    "function pbLeadDone(f,persist){if(persist){try{sessionStorage.setItem('pb_lead_'+TOKEN,'1');}catch(_){}}f.innerHTML='';f.appendChild(pbOkNode('Request received',\"Thanks for reaching out \\u2014 we've got your details and we'll be in touch shortly.\"));}" +
    // One delegated submit handler for any injected form. Reads named fields, posts to the shared
    // lead API, and reflects demo/success/error in the form's [data-pb-lead-status] element.
    "document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.matches||!f.matches('form[data-pb-leadform]'))return;e.preventDefault();" +
    "var st=f.querySelector('[data-pb-lead-status]');var btn=f.querySelector('button[type=submit],button:not([type])');" +
    "function set(msg,tone){if(st){st.textContent=msg;if(tone)st.setAttribute('data-tone',tone);else st.removeAttribute('data-tone');}}" +
    "var fd=new FormData(f);var name=(fd.get('name')||'').toString().trim();var email=(fd.get('email')||'').toString().trim();var phone=(fd.get('phone')||'').toString().trim();" +
    "if(!name||!email||!phone){set('Please add your name, email and phone.','err');return;}" +
    "var type=f.getAttribute('data-pb-lead-type')||'CONTACT_FORM';" +
    // Bot signals sent to the server: the honeypot value (empty for real users) and ms-since-load.
    "var hp=(fd.get('company')||'').toString();var elapsed=Date.now()-LOADED;" +
    "if(btn)btn.disabled=true;set('Sending\\u2026');" +
    "fetch('/api/v1/public/leads',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}," +
    "body:JSON.stringify({type:type,name:name,email:email,phone:phone,message:(fd.get('message')||'')||undefined,source:'site',company:hp,_t:elapsed})})" +
    ".then(function(r){return r.json().catch(function(){return{};}).then(function(d){return{ok:r.ok,d:d};});})" +
    ".then(function(x){if(btn)btn.disabled=false;" +
    "if(x.d&&x.d.demo){set(\"Preview mode \\u2014 this form isn't live yet, so your message was not sent.\");return;}" +
    "if(!x.ok)throw 0;try{pbLeadDone(f,true);}catch(_){f.reset();set(\"Thanks \\u2014 we'll be in touch.\",'ok');}})" +
    ".catch(function(){if(btn)btn.disabled=false;set('Something went wrong. Please try again.','err');});" +
    "});" +
    // ── Platform helpers shared by the hydrate step ──
    // The fallback CTA label shown when lead capture is OFF (no form to point at).
    "var DLABEL=" + JSON.stringify(CTA_DISABLED_LABEL) + ";" +
    // Every primary call-to-action the generator tagged with data-pb-cta (hero/nav buttons that point
    // at the form). The platform relabels/retargets these at serve time.
    "function pbCtas(){return [].slice.call(document.querySelectorAll('[data-pb-cta]'));}" +
    // Legacy sites (generated before data-pb-cta existed) have no tagged CTAs. Best-effort detect the
    // form's primary CTA by its label so the 'off' fallback still works without a rebuild: match links/
    // buttons whose text is the goal CTA label or a lead-action word, skipping tel:/mailto: and nav-style
    // 'Contact' links. Only used when no tagged CTAs are present.
    "function pbLegacyCtas(label){var lab=(label||'').toLowerCase();var rx=/\\b(quote|estimate|consultation|consult|callback|call back|message|get started|request a|enquir|inquir)\\b/;var hits=[];[].slice.call(document.querySelectorAll('a,button')).forEach(function(el){var href=(el.getAttribute&&el.getAttribute('href'))||'';if(/^(tel:|mailto:)/i.test(href))return;if(el.closest&&el.closest('form[data-pb-leadform]'))return;" +
    // never touch booking-widget buttons/sections — they belong to the booking live component
    "if(el.hasAttribute('data-pb-book-open')||(el.closest&&el.closest('[data-pb-booking-host],.pb-bk-section,[data-pb-bk-modal],[data-pb-booking-slot]')))return;" +
    "var t=(el.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase();if(!t||t.length>40)return;if((lab&&t===lab)||rx.test(t))hits.push(el);});return hits;}" +
    // Replace a button's visible label without clobbering any icon it contains: rewrite its last
    // non-blank text node, or fall back to textContent.
    "function pbSetText(el,txt){if(!el||!txt)return;try{var tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null,false);var node,last=null;while((node=tw.nextNode())){if((node.nodeValue||'').replace(/\\s+/g,'').length)last=node;}if(last){last.nodeValue=txt;return;}}catch(e){}el.textContent=txt;}" +
    // Where a 'call us' CTA should point when the form is off: the contact section anchor, else a
    // click-to-call link already on the page.
    "function pbContactHref(){var c=document.querySelector('#contact,[data-pb-contact]');if(c&&c.id)return '#'+c.id;var tel=document.querySelector(\"a[href^='tel:']\");return tel?tel.getAttribute('href'):null;}" +
    // Collapse the void a removed form leaves behind. A contact section is often a 2-column grid/flex
    // row (details | form); once the form's column is gone the row keeps a reserved empty track, so we
    // flatten the nearest grid/flex ancestor to single-column flow (content fills the width), then
    // remove the slot and any wrapper — including an otherwise-empty <section> — it leaves empty.
    "function pbCollapse(s){var n=s,i,p,disp;for(i=0;i<3;i++){p=n.parentElement;if(!p)break;disp='';try{disp=getComputedStyle(p).display;}catch(e){}if(disp.indexOf('grid')>=0){p.style.setProperty('grid-template-columns','1fr','important');p.style.setProperty('display','block','important');}else if(disp.indexOf('flex')>=0){p.style.setProperty('display','block','important');}n=p;}n=s;for(i=0;i<4;i++){p=n.parentElement;if(p)p.removeChild(n);if(!p||p===document.body||p.hasAttribute('data-page')||/^(MAIN|HEADER|FOOTER|NAV|FORM|BODY)$/.test(p.tagName))break;if(p.children.length||(p.textContent||'').replace(/\\s+/g,'').length)break;n=p;}}" +
    // Label/retarget the page's primary CTAs for the current state: when OFF → 'Contact Us' pointing at
    // the contact section; when ON → the goal's CTA label. Tagged CTAs preferred, else legacy detection.
    "function pbCtaSync(enabled,ctaLabel){if(enabled===false){var ch=pbContactHref();var off=pbCtas();off=off.length?off:pbLegacyCtas(ctaLabel);off.forEach(function(el){pbSetText(el,DLABEL);if(el.tagName==='A'){if(ch)el.setAttribute('href',ch);}else if(ch){el.setAttribute('data-pb-cta-href',ch);}});}else if(ctaLabel){var on=pbCtas();on=on.length?on:pbLegacyCtas(ctaLabel);on.forEach(function(el){pbSetText(el,ctaLabel);});}}" +
    // Non-anchor CTAs (buttons) can't carry an href, so we store the call-fallback target and scroll on
    // click instead.
    "document.addEventListener('click',function(e){var el=e.target&&e.target.closest?e.target.closest('[data-pb-cta-href]'):null;if(!el)return;var h=el.getAttribute('data-pb-cta-href');if(!h)return;e.preventDefault();if(h.charAt(0)==='#'){var t=document.querySelector(h);if(t&&t.scrollIntoView)t.scrollIntoView({behavior:'smooth'});}else{location.href=h;}});" +
    // First paint: apply the inlined goal state to the page CTA right away so the top button never
    // flashes a stale label while the live state is fetched below.
    "if(INIT){try{pbCtaSync(INIT.enabled,INIT.ctaLabel);}catch(e){}}" +
    // Hydrate: ask whether the form is live and, if so, drop it into the slot (or build a section),
    // then sync the CTA label + lead type to the owner's currently-chosen goal.
    "fetch('/api/v1/public/lead-form'+PVQS,{headers:{'Authorization':'Bearer '+TOKEN}})" +
    ".then(function(r){return r.json();}).then(function(d){" +
    "var slots=[].slice.call(document.querySelectorAll('[data-pb-leadform-slot]'));" +
    "if(!d||d.enabled!==true||!d.html){" + // disabled (or nothing to show): collapse the form's void, drop any stray host, swap CTAs to a call fallback
    "slots.forEach(function(s){pbCollapse(s);});" +
    "[].forEach.call(document.querySelectorAll('[data-pb-leadform-host]'),function(h){if(!h.closest('[data-pb-leadform-slot]'))h.remove();});" +
    "pbCtaSync(false,d&&d.ctaLabel);" +
    "return;}" +
    "if(slots.length){slots.forEach(function(s){s.innerHTML=d.html;});}" +
    "else if(!document.querySelector('[data-pb-leadform-host]')){" +
    // No slot (e.g. an older site generated before this feature): build a Contact section so the form
    // still appears, mirroring the gallery's mount(). Keep the footer last: insert before the footer
    // when it's inside a [data-page] wrapper (single-page sites wrap everything incl. the footer); for a
    // global footer (multi-page) use the last page; fall back to <main>/body when there's no footer.
    "var wrap=document.createElement('div');wrap.innerHTML=d.html;var node=wrap.firstChild;if(node){" +
    "var f=document.querySelector('footer,[role=contentinfo]');" +
    "if(!f){var k=document.body.children;for(var i=k.length-1;i>=0;i--){var el=k[i],t=el.tagName;if(t==='SCRIPT'||t==='STYLE'||t==='LINK'||t==='NOSCRIPT'||t==='TEMPLATE')continue;var c=((el.className||'')+'').toLowerCase();if(t==='FOOTER'||el.getAttribute('role')==='contentinfo'||c.indexOf('footer')>=0)f=el;break;}}" +
    "var pages=document.querySelectorAll('[data-page]');" +
    "if(f&&f.parentNode){var op=f.closest?f.closest('[data-page]'):null;if(!op&&pages.length){(pages[pages.length-1]).appendChild(node);}else{f.parentNode.insertBefore(node,f);}}" +
    "else if(pages.length){(pages[pages.length-1]).appendChild(node);}else{var m=document.querySelector('main');(m||document.body).appendChild(node);}" +
    "}}" +
    // Sync to the owner's current goal: retype every injected form, and relabel the form's submit button
    // + the page's primary CTAs. No-ops on sites whose generator predates the data-pb-cta tag.
    "if(d.leadType){[].forEach.call(document.querySelectorAll('form[data-pb-leadform]'),function(f){f.setAttribute('data-pb-lead-type',d.leadType);});}" +
    "if(d.ctaLabel){" +
    // page CTAs (tagged or legacy)
    "pbCtaSync(true,d.ctaLabel);" +
    // the form's own submit button + its heading, so the whole form reflects the current goal (not the
    // word it was generated with, e.g. 'Quote')
    "[].forEach.call(document.querySelectorAll('form[data-pb-leadform] button[type=submit],form[data-pb-leadform] button:not([type])'),function(b){pbSetText(b,d.ctaLabel);});" +
    "[].forEach.call(document.querySelectorAll('.pb-lf-title'),function(t){pbSetText(t,d.ctaLabel);});" +
    "}" +
    // the form's sub-heading line, kept in sync with the goal too (replaces copy tailored to the old goal)
    "if(d.formBlurb){[].forEach.call(document.querySelectorAll('.pb-lf-sub'),function(t){pbSetText(t,d.formBlurb);});}" +
    // the free-text (message) field's label, likewise goal-driven
    "if(d.messagePrompt){[].forEach.call(document.querySelectorAll('form[data-pb-leadform] textarea[name=\"message\"]'),function(ta){var lab=ta.closest('label');var sp=lab?lab.querySelector('span'):null;if(sp)pbSetText(sp,d.messagePrompt);});}" +
    // phone is required: enforce it on injected forms (incl. legacy ones baked with an optional phone)
    "[].forEach.call(document.querySelectorAll('form[data-pb-leadform] input[name=\"phone\"]'),function(inp){inp.required=true;inp.setAttribute('type','tel');var lab=inp.closest('label');var sp=lab?lab.querySelector('span'):null;if(sp)sp.textContent='Phone';});" +
    // Ensure a honeypot exists on every injected form — legacy forms baked before this field existed.
    "[].forEach.call(document.querySelectorAll('form[data-pb-leadform]'),function(f){if(f.querySelector('input[name=\"company\"]'))return;var hp=document.createElement('input');hp.name='company';hp.tabIndex=-1;hp.setAttribute('autocomplete','off');hp.setAttribute('aria-hidden','true');hp.style.cssText='position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';f.appendChild(hp);});" +
    // Already submitted this session → show the confirmation instead of the form again.
    "try{if(sessionStorage.getItem('pb_lead_'+TOKEN)){[].forEach.call(document.querySelectorAll('form[data-pb-leadform]'),function(f){pbLeadDone(f,false);});}}catch(_){}" +
    "}).catch(function(){});" +
    "}catch(e){}})();</script>"
  );
}

/** Inject the form CSS (into <head>) + the runtime (before </body>) into a served document. `meta` is
 *  the goal state inlined for flicker-free first paint (computed by the serve pipeline). */
export function withLeadFormFeed(doc: string, token: string, meta?: LeadFormMeta | null, preview?: boolean): string {
  let out = doc.includes("</head>") ? doc.replace("</head>", `${LEADFORM_CSS}</head>`) : `${LEADFORM_CSS}${doc}`;
  const script = leadFormFeedScript(token, meta, preview);
  out = out.includes("</body>") ? out.replace("</body>", `${script}</body>`) : out + script;
  return out;
}
