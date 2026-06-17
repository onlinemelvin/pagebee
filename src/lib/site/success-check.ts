// Shared success/confirmation UI used by the platform-owned live components (lead form + booking
// modal). A green animated checkmark (drawn via stroke-dashoffset, with a pop) plus a title + body
// whose TEXT inherits the site's own color/font so it matches the surrounding theme (only the check
// stays green). Self-contained CSS (survives Tailwind precompile); respects prefers-reduced-motion.

// CSS rules (NO <style> wrapper) — concatenated into each component's own <style> block.
export const SUCCESS_CHECK_CSS =
  ".pb-ok{display:flex;flex-direction:column;align-items:center;gap:10px;padding:22px 8px;text-align:center}" +
  ".pb-ok-svg{width:66px;height:66px;animation:pb-ok-pop .3s ease .1s both}" +
  ".pb-ok-circle{stroke:#16a34a;stroke-width:3;fill:none;stroke-dasharray:151;stroke-dashoffset:151;animation:pb-ok-draw .5s cubic-bezier(.65,0,.45,1) forwards}" +
  ".pb-ok-check{stroke:#16a34a;stroke-width:4;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:40;stroke-dashoffset:40;animation:pb-ok-draw .35s cubic-bezier(.65,0,.45,1) .45s forwards}" +
  // text inherits the site/dialog theme color + font so it matches the rest of the page
  ".pb-ok-title{margin:0;font-weight:700;font-size:1.15rem;color:inherit}" +
  ".pb-ok-text{margin:2px 0 0;font-size:.92rem;line-height:1.5;color:inherit;opacity:.72;max-width:36ch}" +
  ".pb-ok-btn{margin-top:12px;padding:11px 30px;border:0;border-radius:9999px;background:var(--pb-bk-accent,var(--pb-lf-accent,#f59e0b));color:#fff;font:inherit;font-weight:700;cursor:pointer;transition:filter .2s ease}" +
  ".pb-ok-btn:hover{filter:brightness(.94)}" +
  ".pb-ok-link{margin-top:6px;background:none;border:0;padding:0;color:inherit;opacity:.6;font:inherit;font-size:.85rem;text-decoration:underline;cursor:pointer}" +
  ".pb-ok-link:hover{opacity:.95}" +
  "@keyframes pb-ok-draw{to{stroke-dashoffset:0}}" +
  "@keyframes pb-ok-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}" +
  "@media (prefers-reduced-motion:reduce){.pb-ok-svg,.pb-ok-circle,.pb-ok-check{animation:none!important}.pb-ok-circle,.pb-ok-check{stroke-dashoffset:0}}";

// JS source (a `pbOkNode(title, body)` factory) embedded into each component's runtime IIFE. Returns a
// DOM node: animated check + title + body (text set via textContent — never innerHTML). Callers append
// their own action button/link (e.g. "Okay", "Book another").
export const SUCCESS_CHECK_JS =
  "function pbOkNode(title,body){var w=document.createElement('div');w.className='pb-ok';" +
  "w.innerHTML='<svg class=\"pb-ok-svg\" viewBox=\"0 0 52 52\" aria-hidden=\"true\"><circle class=\"pb-ok-circle\" cx=\"26\" cy=\"26\" r=\"24\"/><path class=\"pb-ok-check\" d=\"M14 27l8 8 16-16\"/></svg>';" +
  "var h=document.createElement('p');h.className='pb-ok-title';h.textContent=title;w.appendChild(h);" +
  "if(body){var t=document.createElement('p');t.className='pb-ok-text';t.textContent=body;w.appendChild(t);}" +
  "return w;}";
