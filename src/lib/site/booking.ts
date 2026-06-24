// ── Booking: a platform-owned live component (the appointment modal) ──────────────────────────
// Mirrors the lead form (src/lib/site/lead-form.ts): the AI builds a small booking TRIGGER section
// (a heading, a line of copy, and a "Book…" button) so it matches the site's design, then PageBee
// strips it out of the page HTML into WebsiteVersion.bookingHtml and injects it back into a
// [data-pb-booking-slot] at serve time — but ONLY when the plan allows booking AND the owner has it
// enabled. The MODAL itself (calendar + name/details + submission) is 100% platform-owned: the AI
// never builds it. Clicking any [data-pb-book-open] button opens the modal, which pulls the owner's
// live availability, lets the visitor pick a slot, and posts to /api/v1/public/bookings (which
// creates the appointment on the owner's calendar and links/creates the customer).

import { SUCCESS_CHECK_CSS, SUCCESS_CHECK_JS } from "./success-check";

export const BOOKING_START = "<!--pb:booking:start-->";
export const BOOKING_END = "<!--pb:booking:end-->";
export const BOOKING_SLOT = `<div data-pb-booking-slot></div>`;

// The serve-time booking state, inlined for flicker-free first paint (mirrors the lead form's meta).
export interface BookingMeta {
  enabled: boolean;
  html: string | null; // the stored trigger section (null → nothing to show / older site)
}

/**
 * Split a generated document into the page (with the booking trigger replaced by a slot) and the
 * extracted trigger HTML. Returns `bookingHtml: null` when there's no marked booking block (plans
 * without booking, or surgical edits that already carry a slot) — callers carry the previous
 * version's booking section forward in that case.
 */
export function splitBookingSection(html: string): { pageHtml: string; bookingHtml: string | null } {
  const start = html.indexOf(BOOKING_START);
  const end = html.indexOf(BOOKING_END);
  if (start === -1 || end === -1 || end < start) return { pageHtml: html, bookingHtml: null };
  const inner = html.slice(start + BOOKING_START.length, end).trim();
  const pageHtml = html.slice(0, start) + BOOKING_SLOT + html.slice(end + BOOKING_END.length);
  return { pageHtml, bookingHtml: inner || null };
}

/** Platform default trigger section — for sites with no stored bespoke one (older sites / fallbacks). */
export function defaultBookingHtml(opts?: { heading?: string; blurb?: string; cta?: string }): string {
  const heading = opts?.heading ?? "Book an appointment";
  const blurb = opts?.blurb ?? "Pick a time that works for you — it only takes a minute.";
  const cta = opts?.cta ?? "Book an appointment";
  return (
    `<section class="pb-bk-section" data-pb-booking-host>` +
    `<div class="pb-bk-wrap">` +
    `<h2 class="pb-bk-title">${heading}</h2>` +
    `<p class="pb-bk-sub">${blurb}</p>` +
    `<button type="button" class="pb-bk-cta" data-pb-book-open>${cta}</button>` +
    `</div>` +
    `</section>`
  );
}

// Self-contained CSS (no Tailwind dependency) — styles the trigger section AND the platform modal,
// so both look right on every site (incl. AI sites that precompiled Tailwind away). Inherits the
// site's font; the accent is the --pb-bk-accent variable (amber default) so a site can tint it.
export const BOOKING_CSS =
  `<style>` +
  // The slot ships EMPTY (trigger stripped out, injected at serve only when enabled). Collapse an
  // empty slot and any wrapper that holds only it, so a disabled feature leaves no void.
  `[data-pb-booking-slot]:empty{display:none!important}` +
  `:where(section,div,aside,article,li):has(> [data-pb-booking-slot]:empty:only-child){display:none!important}` +
  `.pb-bk-section{padding:48px 20px;text-align:center}` +
  `.pb-bk-wrap{max-width:560px;margin:0 auto}` +
  `.pb-bk-title{font-size:clamp(1.4rem,3vw,2rem);font-weight:700;margin:0 0 6px}` +
  `.pb-bk-sub{margin:0 0 20px;opacity:.7;font-size:.95rem}` +
  `.pb-bk-cta{display:inline-block;padding:13px 26px;border:0;border-radius:9999px;background:var(--pb-bk-accent,#f59e0b);color:#fff;font:inherit;font-weight:700;cursor:pointer;transition:filter .2s ease}` +
  `.pb-bk-cta:hover{filter:brightness(.94)}` +
  // Modal
  `.pb-bk-modal{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px}` +
  `.pb-bk-modal[hidden]{display:none}` +
  `.pb-bk-overlay{position:absolute;inset:0;background:rgba(15,12,9,.55);backdrop-filter:blur(2px)}` +
  `.pb-bk-dialog{position:relative;width:100%;max-width:460px;max-height:90vh;overflow:auto;background:#fff;color:#1c1917;border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,.3);padding:24px;font:inherit}` +
  `.pb-bk-x{position:absolute;top:12px;right:12px;width:32px;height:32px;border:0;border-radius:9999px;background:rgba(0,0,0,.05);color:inherit;font-size:20px;line-height:1;cursor:pointer}` +
  `.pb-bk-x:hover{background:rgba(0,0,0,.1)}` +
  `.pb-bk-h{font-size:1.3rem;font-weight:700;margin:0 4px 2px 0}` +
  `.pb-bk-hsub{margin:0 0 16px;opacity:.65;font-size:.9rem}` +
  `.pb-bk-field{display:grid;gap:6px;font-size:.82rem;font-weight:600;margin-top:12px}` +
  `.pb-bk-field input,.pb-bk-field textarea,.pb-bk-field select{font:inherit;font-weight:400;padding:11px 13px;border:1px solid rgba(120,113,108,.4);border-radius:12px;background:#fff;color:inherit;width:100%;box-sizing:border-box}` +
  `.pb-bk-field input:focus,.pb-bk-field textarea:focus,.pb-bk-field select:focus{outline:none;border-color:var(--pb-bk-accent,#f59e0b);box-shadow:0 0 0 3px color-mix(in srgb,var(--pb-bk-accent,#f59e0b) 25%,transparent)}` +
  `.pb-bk-label{font-size:.82rem;font-weight:600;margin:14px 0 6px}` +
  `.pb-bk-chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}` +
  `.pb-bk-chip{flex:0 0 auto;padding:9px 14px;border:1px solid rgba(120,113,108,.35);border-radius:12px;background:#fff;color:inherit;font:inherit;font-size:.85rem;cursor:pointer;white-space:nowrap;transition:all .15s ease}` +
  `.pb-bk-chip:hover{border-color:var(--pb-bk-accent,#f59e0b)}` +
  `.pb-bk-chip[aria-pressed=true]{background:var(--pb-bk-accent,#f59e0b);border-color:var(--pb-bk-accent,#f59e0b);color:#fff;font-weight:600}` +
  `.pb-bk-times{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}` +
  `.pb-bk-times .pb-bk-chip{flex:0 0 auto}` +
  `.pb-bk-submit{margin-top:18px;width:100%;padding:13px 22px;border:0;border-radius:12px;background:var(--pb-bk-accent,#f59e0b);color:#fff;font:inherit;font-weight:700;cursor:pointer;transition:filter .2s ease,opacity .2s ease}` +
  `.pb-bk-submit:hover{filter:brightness(.94)}` +
  `.pb-bk-submit:disabled{opacity:.6;cursor:default}` +
  `.pb-bk-status{margin:12px 0 0;text-align:center;font-size:.9rem;min-height:1.1em;opacity:.85}` +
  `.pb-bk-status[data-tone=err]{color:#dc2626}` +
  `.pb-bk-status[data-tone=ok]{color:#16a34a}` +
  `.pb-bk-empty{margin-top:14px;opacity:.7;font-size:.9rem;text-align:center}` +
  SUCCESS_CHECK_CSS +
  `</style>`;

/**
 * Runtime: inject the stored trigger into the slot, wire every [data-pb-book-open] to open a
 * platform-owned modal that loads the owner's live availability and posts a booking. Mirrors the
 * lead-form feed: inlined INIT state for flicker-free first paint, then a no-store reconcile fetch so
 * a dashboard toggle reflects on the next load of a cached page.
 */
export function bookingFeedScript(token: string, meta?: BookingMeta | null, preview?: boolean): string {
  return (
    "<script>(function(){try{" +
    "var TOKEN=" + JSON.stringify(token) + ";" +
    "var BINIT=" + JSON.stringify(meta ?? null) + ";" +
    // In preview, ask the status feed for the PREVIEWED tier's state; empty on the live site.
    "var PVQS=" + JSON.stringify(preview ? "?preview=1" : "") + ";" +
    SUCCESS_CHECK_JS +
    // ── helpers ──
    // Inject the trigger section into the page slot (or build one before the footer for older sites).
    "function pbInject(html){if(!html)return;var slots=[].slice.call(document.querySelectorAll('[data-pb-booking-slot]'));if(slots.length){slots.forEach(function(s){if(!s.firstChild)s.innerHTML=html;});return;}if(document.querySelector('[data-pb-booking-host]'))return;var wrap=document.createElement('div');wrap.innerHTML=html;var node=wrap.firstChild;if(!node)return;" +
    // No AI-placed slot (existing sites): make it PROMINENT — drop it right under the hero (the first
    // top-level section), else right after the header, else fall back to before the footer.
    "var hero=document.querySelector('main>section,[data-page]>section,body>section,section');if(hero&&hero.parentNode){hero.parentNode.insertBefore(node,hero.nextSibling);return;}var hd=document.querySelector('header,[role=banner]');if(hd&&hd.parentNode){hd.parentNode.insertBefore(node,hd.nextSibling);return;}var f=document.querySelector('footer,[role=contentinfo]');if(f&&f.parentNode){f.parentNode.insertBefore(node,f);return;}(document.querySelector('main')||document.body).appendChild(node);}" +
    // Remove the trigger (and collapse the void it leaves) + hide any stray book buttons, when off.
    "function pbDisable(){[].slice.call(document.querySelectorAll('[data-pb-booking-slot]')).forEach(function(s){var n=s,i,p;for(i=0;i<4;i++){p=n.parentElement;if(p)p.removeChild(n);if(!p||p===document.body||p.hasAttribute('data-page')||/^(MAIN|HEADER|FOOTER|NAV|BODY)$/.test(p.tagName))break;if(p.children.length||(p.textContent||'').replace(/\\s+/g,'').length)break;n=p;}});[].forEach.call(document.querySelectorAll('[data-pb-booking-host]'),function(h){if(!h.closest('[data-pb-booking-slot]'))h.remove();});[].forEach.call(document.querySelectorAll('[data-pb-book-open]'),function(b){b.style.display='none';});}" +
    // Modal singleton + a prefetch cache so the modal opens with no wait.
    "var MODAL=null,SLOTS=[],SVCS=[],SERVICE='',PICK='',SLOTCACHE={},WARMED=false,WARMING=false;" +
    "function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}" +
    "function buildModal(){if(MODAL)return MODAL;var m=el('div','pb-bk-modal');m.setAttribute('data-pb-bk-modal','');m.hidden=true;" +
    "var ov=el('div','pb-bk-overlay');ov.addEventListener('click',closeModal);m.appendChild(ov);" +
    "var d=el('div','pb-bk-dialog');d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','Book an appointment');" +
    "var x=el('button','pb-bk-x','\\u00d7');x.setAttribute('aria-label','Close');x.addEventListener('click',closeModal);d.appendChild(x);" +
    "d.appendChild(el('h3','pb-bk-h','Book an appointment'));d.appendChild(el('p','pb-bk-hsub','Choose a time and tell us how to reach you.'));" +
    // service select (shown only when >1 service)
    "var sl=el('label','pb-bk-field');sl.setAttribute('data-pb-bk-svc-wrap','');sl.style.display='none';sl.appendChild(el('span',null,'Service'));var sel=el('select');sel.setAttribute('data-pb-bk-service','');sel.addEventListener('change',function(){SERVICE=sel.value;PICK='';loadSlots();});sl.appendChild(sel);d.appendChild(sl);" +
    "d.appendChild(el('div','pb-bk-label','Pick a day'));d.appendChild((function(){var e=el('div','pb-bk-chips');e.setAttribute('data-pb-bk-days','');return e;})());" +
    "d.appendChild((function(){var e=el('div','pb-bk-times');e.setAttribute('data-pb-bk-times','');return e;})());" +
    "var fn=el('label','pb-bk-field');fn.appendChild(el('span',null,'Your name'));var ni=el('input');ni.setAttribute('data-pb-bk-name','');ni.required=true;ni.autocomplete='name';fn.appendChild(ni);d.appendChild(fn);" +
    "var fe=el('label','pb-bk-field');fe.appendChild(el('span',null,'Email'));var ei=el('input');ei.type='email';ei.setAttribute('data-pb-bk-email','');ei.autocomplete='email';fe.appendChild(ei);d.appendChild(fe);" +
    "var fp=el('label','pb-bk-field');fp.appendChild(el('span',null,'Phone'));var pi=el('input');pi.type='tel';pi.setAttribute('data-pb-bk-phone','');pi.autocomplete='tel';fp.appendChild(pi);d.appendChild(fp);" +
    "var ft=el('label','pb-bk-field');ft.appendChild(el('span',null,'Notes (optional)'));var ti=el('textarea');ti.rows=3;ti.setAttribute('data-pb-bk-notes','');ft.appendChild(ti);d.appendChild(ft);" +
    "var sb=el('button','pb-bk-submit','Request appointment');sb.setAttribute('data-pb-bk-submit','');sb.addEventListener('click',submit);d.appendChild(sb);" +
    "d.appendChild((function(){var e=el('p','pb-bk-status');e.setAttribute('data-pb-bk-status','');e.setAttribute('role','status');e.setAttribute('aria-live','polite');return e;})());" +
    "m.appendChild(d);document.body.appendChild(m);MODAL=m;return m;}" +
    "function q(s){return MODAL?MODAL.querySelector(s):null;}" +
    "function setStatus(msg,tone){var st=q('[data-pb-bk-status]');if(!st)return;st.textContent=msg||'';if(tone)st.setAttribute('data-tone',tone);else st.removeAttribute('data-tone');}" +
    "function openModal(){buildModal();MODAL.hidden=false;document.documentElement.style.overflow='hidden';loadServices();}" +
    "function closeModal(){if(MODAL){MODAL.hidden=true;}document.documentElement.style.overflow='';}" +
    // Replace the dialog with a centered animated success check (keeps a close button).
    // Success: replace the dialog with a themed confirmation + a spelled-out 'Okay' button, and mark the
    // page's booking section as requested so the trigger button isn't shown again.
    "function showOk(){var d=MODAL&&MODAL.querySelector('.pb-bk-dialog');if(d){d.innerHTML='';var x=el('button','pb-bk-x','\\u00d7');x.setAttribute('aria-label','Close');x.addEventListener('click',closeModal);d.appendChild(x);var node=pbOkNode('Request received',\"Thanks! We've got your appointment request and we'll be in touch shortly to confirm.\");var ok=el('button','pb-ok-btn','Okay');ok.addEventListener('click',closeModal);node.appendChild(ok);d.appendChild(node);}pbMarkRequested(true);}" +
    // Replace the page's booking trigger section(s) with a confirmation panel (so the button isn't shown
    // again), hide any other book buttons, and remember it for the session. A subtle link re-opens the modal.
    "function pbMarkRequested(persist){if(persist){try{sessionStorage.setItem('pb_book_'+TOKEN,'1');}catch(_){}}[].slice.call(document.querySelectorAll('.pb-bk-section,[data-pb-booking-host]')).forEach(function(s){s.innerHTML='';var node=pbOkNode('Appointment requested',\"Thanks! We've got your request and we'll be in touch shortly to confirm.\");var again=el('button','pb-ok-link','Book another appointment');again.addEventListener('click',openModal);node.appendChild(again);s.appendChild(node);});[].forEach.call(document.querySelectorAll('[data-pb-book-open]'),function(b){if(!b.closest('.pb-ok'))b.style.display='none';});}" +
    "document.addEventListener('keydown',function(e){if(e.key==='Escape'&&MODAL&&!MODAL.hidden)closeModal();});" +
    // Fetch the catalog ONCE (cached in SVCS). Picks a default service.
    "function fetchServices(cb){if(SVCS.length){cb&&cb();return;}fetch('/api/v1/public/services',{headers:{'Authorization':'Bearer '+TOKEN}}).then(function(r){return r.json();}).then(function(d){SVCS=(d&&d.services)||[];if(!SERVICE)SERVICE=(SVCS[0]&&SVCS[0].title)||'Appointment';cb&&cb();}).catch(function(){if(!SERVICE)SERVICE='Appointment';cb&&cb();});}" +
    // Fetch availability for a service; cache it by service name.
    "function fetchSlots(service,cb){fetch('/api/v1/public/booking/availability?service='+encodeURIComponent(service),{headers:{'Authorization':'Bearer '+TOKEN}}).then(function(r){return r.json();}).then(function(d){SLOTCACHE[service]=(d&&d.slots)||[];cb&&cb(SLOTCACHE[service]);}).catch(function(){cb&&cb(null);});}" +
    // Warm the cache in the BACKGROUND (on booking intent + after page idle) so the modal has no wait.
    // Services can each have DIFFERENT availability (per-service durations), so prefetch slots for ALL of
    // them — switching the service in the modal is then instant too.
    "function warm(){if(WARMED||WARMING)return;WARMING=true;fetchServices(function(){var list=SVCS.length?SVCS.map(function(s){return s.title;}):[SERVICE||'Appointment'];var i=0;function next(){if(i>=list.length){WARMED=true;WARMING=false;return;}var t=list[i++];if(SLOTCACHE[t]){next();return;}fetchSlots(t,function(){next();});}next();});}" +
    "function scheduleWarm(){if(WARMED||WARMING)return;if(window.requestIdleCallback){requestIdleCallback(function(){warm();},{timeout:3000});}else{setTimeout(warm,1500);}}" +
    // Populate the service <select> from the cached catalog (modal must exist).
    "function applyServices(){var wrap=q('[data-pb-bk-svc-wrap]'),sel=q('[data-pb-bk-service]');if(SVCS.length>1&&sel){sel.innerHTML='';SVCS.forEach(function(s){var o=document.createElement('option');o.value=s.title;o.textContent=s.title;sel.appendChild(o);});sel.value=SERVICE;if(wrap)wrap.style.display='';}}" +
    "function loadServices(){if(SVCS.length){applyServices();loadSlots();return;}setStatus('Loading\\u2026');fetchServices(function(){applyServices();loadSlots();});}" +
    // Render cached slots INSTANTLY when available, then quietly refresh in the background (the server
    // re-checks the slot on submit, so a briefly-stale cache is safe). Group by day → day + time chips.
    "function loadSlots(){var days=q('[data-pb-bk-days]'),times=q('[data-pb-bk-times]');PICK='';var cached=SLOTCACHE[SERVICE];if(cached){SLOTS=cached;renderFromSlots();}else{if(days)days.innerHTML='';if(times)times.innerHTML='';setStatus('Loading times\\u2026');}fetchSlots(SERVICE,function(slots){if(slots===null){if(!cached)setStatus('Could not load times. Please try again.','err');return;}SLOTS=slots;if(!PICK)renderFromSlots();});}" +
    "function renderFromSlots(){var days=q('[data-pb-bk-days]'),times=q('[data-pb-bk-times]');setStatus('');var old=q('.pb-bk-empty');if(old&&old.remove)old.remove();if(times)times.innerHTML='';if(!SLOTS.length){if(days)days.innerHTML='';var e=el('p','pb-bk-empty','No times available right now \\u2014 please check back soon.');if(days&&days.parentNode)days.parentNode.insertBefore(e,times);return;}renderDays();}" +
    // Split each label at its last comma → day part + time part (server already formats in the biz tz).
    "function dayOf(s){var L=s.label||'';var i=L.lastIndexOf(',');return i>0?L.slice(0,i).trim():(s.startAt||'').slice(0,10);}" +
    "function timeOf(s){var L=s.label||'';var i=L.lastIndexOf(',');return i>0?L.slice(i+1).trim():L;}" +
    "function renderDays(){var days=q('[data-pb-bk-days]');if(!days)return;days.innerHTML='';var seen={},order=[];SLOTS.forEach(function(s){var dd=dayOf(s);if(!seen[dd]){seen[dd]=1;order.push(dd);}});order.forEach(function(dd,idx){var b=el('button','pb-bk-chip',dd);b.type='button';b.setAttribute('aria-pressed',idx===0?'true':'false');b.addEventListener('click',function(){[].forEach.call(days.children,function(c){c.setAttribute('aria-pressed','false');});b.setAttribute('aria-pressed','true');renderTimes(dd);});days.appendChild(b);});renderTimes(order[0]);}" +
    "function renderTimes(dd){var times=q('[data-pb-bk-times]');if(!times)return;times.innerHTML='';SLOTS.filter(function(s){return dayOf(s)===dd;}).forEach(function(s){var b=el('button','pb-bk-chip',timeOf(s));b.type='button';b.setAttribute('aria-pressed',s.startAt===PICK?'true':'false');b.addEventListener('click',function(){PICK=s.startAt;[].forEach.call(times.children,function(c){c.setAttribute('aria-pressed','false');});b.setAttribute('aria-pressed','true');setStatus('');});times.appendChild(b);});}" +
    "function submit(){var name=(q('[data-pb-bk-name]')||{}).value;name=(name||'').trim();var email=((q('[data-pb-bk-email]')||{}).value||'').trim();var phone=((q('[data-pb-bk-phone]')||{}).value||'').trim();var notes=((q('[data-pb-bk-notes]')||{}).value||'').trim();" +
    "if(!PICK){setStatus('Please pick a time.','err');return;}if(!name){setStatus('Please add your name.','err');return;}if(!email&&!phone){setStatus('Add an email or phone so we can confirm.','err');return;}" +
    "var sb=q('[data-pb-bk-submit]');if(sb)sb.disabled=true;setStatus('Requesting\\u2026');" +
    "fetch('/api/v1/public/bookings',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},body:JSON.stringify({serviceName:SERVICE||'Appointment',startAt:PICK,name:name,email:email||undefined,phone:phone||undefined,notes:notes||undefined})})" +
    ".then(function(r){return r.json().catch(function(){return{};}).then(function(d){return{ok:r.ok,d:d};});})" +
    ".then(function(x){if(sb)sb.disabled=false;if(x.d&&x.d.demo){setStatus(\"Preview mode \\u2014 booking isn't live yet, so nothing was sent.\");return;}if(!x.ok){setStatus(x.d&&x.d.error==='slot_unavailable'?'That time was just taken \\u2014 pick another.':'Something went wrong. Please try again.','err');return;}showOk();PICK='';})" +
    ".catch(function(){if(sb)sb.disabled=false;setStatus('Something went wrong. Please try again.','err');});}" +
    // Delegate clicks so book buttons injected later still work.
    "document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-pb-book-open]'):null;if(!b)return;e.preventDefault();openModal();});" +
    // Booking INTENT (hover/focus/touch a book button) warms the cache so the click opens instantly.
    "['mouseover','focusin','touchstart'].forEach(function(ev){document.addEventListener(ev,function(e){var b=e.target&&e.target.closest?e.target.closest('[data-pb-book-open]'):null;if(b)warm();},true);});" +
    // Already requested an appointment this session → show the confirmation instead of the trigger.
    "function pbBooked(){try{return !!sessionStorage.getItem('pb_book_'+TOKEN);}catch(_){return false;}}" +
    // First paint from inlined state, then reconcile against the live status (cached pages).
    "if(BINIT){if(BINIT.enabled&&BINIT.html){pbInject(BINIT.html);if(pbBooked())pbMarkRequested(false);}else if(BINIT.enabled===false){pbDisable();}}" +
    "fetch('/api/v1/public/booking'+PVQS,{headers:{'Authorization':'Bearer '+TOKEN}}).then(function(r){return r.json();}).then(function(d){if(!d)return;if(d.enabled===true){pbInject(d.html);if(pbBooked()){pbMarkRequested(false);}else{[].forEach.call(document.querySelectorAll('[data-pb-book-open]'),function(b){b.style.display='';});scheduleWarm();}}else{pbDisable();}}).catch(function(){});" +
    "}catch(e){}})();</script>"
  );
}

/** Inject the booking CSS (into <head>) + the runtime (before </body>) into a served document. */
export function withBookingFeed(doc: string, token: string, meta?: BookingMeta | null, preview?: boolean): string {
  let out = doc.includes("</head>") ? doc.replace("</head>", `${BOOKING_CSS}</head>`) : `${BOOKING_CSS}${doc}`;
  const script = bookingFeedScript(token, meta, preview);
  out = out.includes("</body>") ? out.replace("</body>", `${script}</body>`) : out + script;
  return out;
}
