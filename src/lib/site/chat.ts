// ── AI chat widget: a platform-owned live component ───────────────────────────
// Unlike the lead form / booking (whose markup the AI generates), the chat widget is fully
// platform-owned: a floating round "Chat now" button (with an online green dot) + a panel, injected
// at serve time and shown only when the chat feed reports it's enabled (aiAssistant on-plan + owner
// on). The runtime talks to the public chat API: /config (show?), /message (turn), /poll (owner
// replies). Self-contained `pb-chat-*` CSS so it survives the page's precompiled Tailwind. Mirrors
// withLeadFormFeed (CSS into <head>, runtime before </body>).

export const CHAT_CSS =
  `<style>` +
  `.pb-chat-fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:60px;height:60px;border:0;border-radius:9999px;background:var(--pb-chat-accent,#f59e0b);color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.22);display:none;align-items:center;justify-content:center;transition:transform .15s ease,filter .15s ease;font:inherit}` +
  `.pb-chat-fab:hover{filter:brightness(.95);transform:translateY(-1px)}` +
  `.pb-chat-fab svg{width:26px;height:26px}` +
  `.pb-chat-dot{position:absolute;top:6px;right:6px;width:13px;height:13px;border-radius:9999px;background:#22c55e;border:2px solid #fff}` +
  `.pb-chat-panel{position:fixed;right:20px;bottom:92px;z-index:2147483000;width:min(380px,calc(100vw - 40px));height:min(560px,calc(100vh - 120px));background:#fff;color:#1c1917;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;font-family:inherit}` +
  `.pb-chat-open .pb-chat-panel{display:flex}` +
  `.pb-chat-hd{background:var(--pb-chat-accent,#f59e0b);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}` +
  `.pb-chat-hd b{font-size:15px;font-weight:700}.pb-chat-hd span{font-size:12px;opacity:.85;display:block}` +
  `.pb-chat-x{margin-left:auto;background:transparent;border:0;color:#fff;cursor:pointer;font-size:20px;line-height:1;opacity:.9;padding:4px}` +
  `.pb-chat-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#faf9f7}` +
  `.pb-chat-msg{max-width:82%;padding:9px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}` +
  `.pb-chat-msg.cust{align-self:flex-end;background:var(--pb-chat-accent,#f59e0b);color:#fff;border-bottom-right-radius:4px}` +
  `.pb-chat-msg.ai,.pb-chat-msg.owner{align-self:flex-start;background:#fff;border:1px solid #ececea;border-bottom-left-radius:4px}` +
  `.pb-chat-msg.sys{align-self:center;background:transparent;color:#78716c;font-size:12.5px;text-align:center;max-width:95%}` +
  `.pb-chat-typing{align-self:flex-start;display:flex;gap:4px;padding:11px 14px;background:#fff;border:1px solid #ececea;border-radius:14px}` +
  `.pb-chat-typing i{width:6px;height:6px;border-radius:9999px;background:#a8a29e;animation:pbchatb 1s infinite}` +
  `.pb-chat-typing i:nth-child(2){animation-delay:.15s}.pb-chat-typing i:nth-child(3){animation-delay:.3s}` +
  `@keyframes pbchatb{0%,60%,100%{opacity:.3}30%{opacity:1}}` +
  `.pb-chat-foot{border-top:1px solid #ececea;padding:10px;display:flex;gap:8px;background:#fff}` +
  `.pb-chat-foot input{flex:1;border:1px solid #d6d3d1;border-radius:9999px;padding:10px 14px;font:inherit;font-size:14px;outline:none}` +
  `.pb-chat-foot input:focus{border-color:var(--pb-chat-accent,#f59e0b)}` +
  `.pb-chat-send{border:0;border-radius:9999px;background:var(--pb-chat-accent,#f59e0b);color:#fff;width:40px;height:40px;cursor:pointer;font-size:16px;flex:0 0 auto}` +
  `.pb-chat-send:disabled{opacity:.5;cursor:default}` +
  `.pb-chat-cta{align-self:flex-start;border:1px solid var(--pb-chat-accent,#f59e0b);color:var(--pb-chat-accent,#f59e0b);background:#fff;border-radius:9999px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}` +
  `.pb-chat-form{align-self:stretch;display:grid;gap:7px;background:#fff;border:1px solid #ececea;border-radius:14px;padding:12px}` +
  `.pb-chat-form input{border:1px solid #d6d3d1;border-radius:8px;padding:9px 11px;font:inherit;font-size:13px;outline:none}` +
  `.pb-chat-form button{border:0;border-radius:8px;background:var(--pb-chat-accent,#f59e0b);color:#fff;padding:9px;font:inherit;font-weight:600;cursor:pointer}` +
  `</style>`;

const CHAT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

export function chatFeedScript(token: string, preview?: boolean): string {
  return (
    "<script>(function(){try{" +
    "var TOKEN=" + JSON.stringify(token) + ";" +
    "var PV=" + JSON.stringify(preview ? "?preview=1" : "") + ";" +
    "var DEMO=" + JSON.stringify(!!preview) + ";" +
    "var SK='pb_chat_'+TOKEN;" +
    "function hdrs(){return {'Content-Type':'application/json','Authorization':'Bearer '+TOKEN};}" +
    "function sess(){try{return JSON.parse(sessionStorage.getItem(SK)||'{}');}catch(e){return {};}}" +
    "function save(s){try{sessionStorage.setItem(SK,JSON.stringify(s));}catch(e){}}" +
    // Decide whether to render at all.
    "fetch('/api/v1/public/chat/config'+PV,{headers:{'Authorization':'Bearer '+TOKEN}}).then(function(r){return r.json();}).then(function(cfg){" +
    "if(!cfg||cfg.enabled!==true)return;mount(cfg.greeting||'Hi! How can we help?');}).catch(function(){});" +
    "function mount(greeting){" +
    "var root=document.createElement('div');root.className='pb-chat';" +
    "root.innerHTML='<button class=\"pb-chat-fab\" aria-label=\"Open chat\">'+" + JSON.stringify(CHAT_ICON) + "+'<span class=\"pb-chat-dot\"></span></button>'+" +
    "'<div class=\"pb-chat-panel\" role=\"dialog\" aria-label=\"Chat\"><div class=\"pb-chat-hd\"><div><b class=\"pb-chat-title\">Chat with us</b><span>We typically reply in a few minutes</span></div><button class=\"pb-chat-x\" aria-label=\"Close\">\\u00d7</button></div><div class=\"pb-chat-body\"></div><div class=\"pb-chat-foot\"><input type=\"text\" placeholder=\"Type a message\\u2026\" aria-label=\"Message\"/><button class=\"pb-chat-send\" aria-label=\"Send\">\\u27a4</button></div></div>';" +
    "document.body.appendChild(root);" +
    "var fab=root.querySelector('.pb-chat-fab');fab.style.display='flex';" +
    "var panel=root.querySelector('.pb-chat-panel');var body=root.querySelector('.pb-chat-body');var input=root.querySelector('.pb-chat-foot input');var send=root.querySelector('.pb-chat-send');" +
    "var seen={};var poller=null;var greeted=false;" +
    // try to label the header with the page's site title
    "try{var t=(document.querySelector('meta[property=\"og:site_name\"]')||{}).content||document.title;if(t)root.querySelector('.pb-chat-title').textContent=t.split('|')[0].split('\\u2013')[0].trim().slice(0,28);}catch(e){}" +
    "function scroll(){body.scrollTop=body.scrollHeight;}" +
    "function bubble(role,text){var d=document.createElement('div');d.className='pb-chat-msg '+(role==='customer'?'cust':role==='system'?'sys':role==='owner'?'owner':'ai');d.textContent=text;body.appendChild(d);scroll();return d;}" +
    "function addMsgs(list){(list||[]).forEach(function(m){if(m.id&&seen[m.id])return;if(m.id)seen[m.id]=1;bubble(m.role,m.body);});}" +
    "var typingEl=null;function typing(on){if(on){if(typingEl)return;typingEl=document.createElement('div');typingEl.className='pb-chat-typing';typingEl.innerHTML='<i></i><i></i><i></i>';body.appendChild(typingEl);scroll();}else if(typingEl){typingEl.remove();typingEl=null;}}" +
    // booking CTA → open the site's booking modal if present
    "function bookBtn(){var b=document.createElement('button');b.className='pb-chat-cta';b.textContent='\\ud83d\\udcc5 Book an appointment';b.onclick=function(){var t=document.querySelector('[data-pb-book-open]');if(t){t.click();}else{var c=document.querySelector('#contact,[data-pb-contact]');if(c&&c.scrollIntoView)c.scrollIntoView({behavior:'smooth'});}};body.appendChild(b);scroll();}" +
    // contact mini-form (after timeout handoff)
    "function contactForm(){var f=document.createElement('form');f.className='pb-chat-form';f.innerHTML='<input name=\"name\" placeholder=\"Your name\"/><input name=\"email\" type=\"email\" placeholder=\"Email\"/><input name=\"phone\" type=\"tel\" placeholder=\"Phone\"/><button type=\"submit\">Send my details</button>';f.onsubmit=function(e){e.preventDefault();var fd=new FormData(f);var c={name:(fd.get('name')||'').toString(),email:(fd.get('email')||'').toString(),phone:(fd.get('phone')||'').toString()};if(!c.email&&!c.phone){return;}f.remove();turn(null,c);};body.appendChild(f);scroll();}" +
    "function handle(res){if(!res)return;if(res.conversationId&&res.conversationId!=='demo'){var s=sess();s.conversationId=res.conversationId;s.publicToken=res.publicToken;save(s);}" +
    "addMsgs(res.messages);if(res.messages&&res.messages.length){var last=res.messages[res.messages.length-1];if(last.at){var s2=sess();s2.lastAt=last.at;save(s2);}}" +
    "if(res.cta==='book')bookBtn();if(res.status==='awaiting_contact')contactForm();if(res.status==='escalated'){var s3=sess();s3.escalated=1;save(s3);startPoll();}}" +
    // one turn: send message and/or contact
    "function turn(text,contact){var s=sess();var pay={conversationId:s.conversationId,publicToken:s.publicToken};if(text)pay.message=text;if(contact)pay.contact=contact;typing(true);send.disabled=true;" +
    "fetch('/api/v1/public/chat/message',{method:'POST',headers:hdrs(),body:JSON.stringify(pay)}).then(function(r){return r.json();}).then(function(res){typing(false);send.disabled=false;handle(res);}).catch(function(){typing(false);send.disabled=false;bubble('system','Something went wrong. Please try again.');});}" +
    "function submit(){var v=(input.value||'').trim();if(!v)return;input.value='';bubble('customer',v);turn(v,null);}" +
    "send.onclick=submit;input.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();submit();}});" +
    // poll for owner/AI replies (skip in preview/demo — nothing persisted)
    "function pollOnce(){if(DEMO)return;var s=sess();if(!s.conversationId)return;fetch('/api/v1/public/chat/poll?conversationId='+encodeURIComponent(s.conversationId)+'&publicToken='+encodeURIComponent(s.publicToken)+'&after='+encodeURIComponent(s.lastAt||''),{headers:{'Authorization':'Bearer '+TOKEN}}).then(function(r){return r.json();}).then(function(d){if(!d||!d.messages)return;var fresh=d.messages.filter(function(m){return !seen[m.id];});if(fresh.length){addMsgs(fresh);var s2=sess();s2.lastAt=fresh[fresh.length-1].at;save(s2);}if(d.status==='awaiting_contact'&&!body.querySelector('.pb-chat-form'))contactForm();}).catch(function(){});}" +
    "function startPoll(){if(poller||DEMO)return;poller=setInterval(pollOnce,4000);}" +
    "function stopPoll(){if(poller){clearInterval(poller);poller=null;}}" +
    "function open(){root.classList.add('pb-chat-open');fab.style.display='none';input.focus();" +
    "if(!greeted){greeted=true;var s=sess();if(s.conversationId&&!DEMO){var s0=Object.assign({},s);s0.lastAt='';save(s0);pollOnce();}else{bubble('ai',greeting);}}startPoll();}" +
    "function close(){root.classList.remove('pb-chat-open');fab.style.display='flex';stopPoll();}" +
    "fab.onclick=open;root.querySelector('.pb-chat-x').onclick=close;" +
    "}" +
    "}catch(e){}})();</script>"
  );
}

/** Inject the chat CSS (<head>) + runtime (before </body>) into a served tenant document. */
export function withChatFeed(doc: string, token: string, preview?: boolean): string {
  let out = doc.includes("</head>") ? doc.replace("</head>", `${CHAT_CSS}</head>`) : `${CHAT_CSS}${doc}`;
  const script = chatFeedScript(token, preview);
  out = out.includes("</body>") ? out.replace("</body>", `${script}</body>`) : out + script;
  return out;
}
