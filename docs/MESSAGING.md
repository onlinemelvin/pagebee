# Messaging — SMS, Chat & the Notification Fan-out

How PageBee talks to owners and customers across channels. This covers the **SMS** build (live
now, one-way), where **chat** fits, and the roadmap to WhatsApp + a mobile app. Companion to
[ARCHITECTURE.md](ARCHITECTURE.md) §notifications and the
[notification module](../src/lib/modules/notification/).

## The core split: notification delivery vs. conversation handling

Two layers, kept deliberately separate so each evolves on its own:

| Layer | What | Where it lives today |
| --- | --- | --- |
| **1. Notification delivery** (PageBee → owner) | "Tap the owner on the shoulder": a new lead/booking happened. | In-app bell ✓ · email ✓ · **one-way SMS with a deep link** ✓ · mobile push (future) |
| **2. Conversation handling** (owner ↔ customer) | The actual back-and-forth reply. | Web app (Inquiries inbox; website chat widget). SMS/WhatsApp two-way is **future**. |

The launch model is intentionally lean: **send a one-way text with a link; the owner replies in the
web app** (and later the mobile app). No inbound message routing, no per-client numbers — that
keeps us out of two-way 10DLC complexity until there's demand.

### Inquiry vs. chat (data model)

Already modeled in [schema.prisma](../prisma/schema.prisma) — keep them distinct:

- **`Lead`** (`LeadType`) — a discrete inquiry with a status pipeline (NEW→…→WON). The **Inquiries**
  inbox. A CRM object.
- **`Conversation`** + `Message[]` (`ConversationChannel`: WEBSITE_CHAT / EMAIL / SMS) — an ongoing
  thread, possibly AI-handled (`AiConversation`). A chat. Links to a Lead via `Conversation.leadId`
  when a chat produces a qualified lead.

`MessageSenderType` (CUSTOMER/OWNER/EMPLOYEE/**AI**/SYSTEM) + `Message.isDraft`/`approvedById` give
the **AI-suggestion vs. autonomous** modes for the top-tier AI chat for free.

## SMS provider — Twilio, isolated to one file

Provider lives in [src/lib/sms/twilio.ts](../src/lib/sms/twilio.ts) (fetch-based, no SDK). To swap
providers, reimplement `sendProviderSms` + `validateTwilioSignature` there — nothing else changes.
**Unconfigured → console stub**, so dev/CI run without an account (same pattern as Resend email).

Sender config (set ONE sender): prefer **`TWILIO_MESSAGING_SERVICE_SID`** (manages the sender pool
and, with Advanced Opt-Out on, handles STOP/START/HELP at Twilio's edge) over `TWILIO_FROM_NUMBER`.
See `.env.example` for all vars.

### Send path

`sendSms()` in [messaging/service.ts](../src/lib/modules/messaging/service.ts) is the only send entry
point. Every send:

1. requires the **`smsAlerts`** plan flag (403 otherwise),
2. normalizes the number to **E.164** ([optout.ts](../src/lib/modules/messaging/optout.ts)),
3. **checks the STOP suppression list** — a suppressed number is logged and skipped (never sent),
4. meters against the monthly **`sms`** allowance,
5. appends the **`Reply STOP to opt out.`** footer,
6. records the attempt in **`SmsLog`** (status, Twilio sid, error, `consentVerified`).

Owner alerts go through [`notifyOwnerSms()`](../src/lib/modules/messaging/owner-alerts.ts) — fail-soft
(an SMS hiccup never breaks the triggering action) and gated on the owner's opt-in. Wired into
`lead.created` and `booking.created` in [events/subscribers.ts](../src/lib/events/subscribers.ts).

## Owner opt-in (not opt-out)

Unlike email (on by default), **SMS is strictly opt-in**. Prefs live in
`ClientSetting.smsSettings.notifications` ([sms-prefs.ts](../src/lib/modules/messaging/sms-prefs.ts)):
`enabled` (default **false**), `phone`, and per-group toggles (`inquiries`, `appointments`). Owners
manage it at **/client/settings** (gated by the `smsAlerts` plan feature; off-plan shows an upgrade).

## STOP / START / HELP compliance (TCPA)

Recipients can text **STOP** to opt out, **START** to opt back in, **HELP** for info.

- Inbound webhook: **`POST /api/v1/public/sms/inbound`**
  ([route](../src/app/api/v1/public/sms/inbound/route.ts)). Point the Messaging Service's inbound
  webhook here.
- It **verifies the `X-Twilio-Signature`** (HMAC-SHA1 over URL + sorted params) so opt-in/out events
  can't be forged.
- **STOP** → `SmsOptOut` row (suppression) + flips the matching owner's `enabled` off. **START** →
  removes the row. **HELP** → a one-line info reply.
- We keep **our own** `SmsOptOut` list in addition to Twilio's edge handling, so the send path's
  suppression check is authoritative and auditable.

> **The non-obvious gotcha:** even one-way A2P SMS to US numbers needs **10DLC registration** (Brand
> + Campaign via The Campaign Registry) or **toll-free verification** before carriers reliably
> deliver link-bearing texts — same flavor of step as email DKIM/DMARC. Budget a few days.

## AI Website Chat (HIVE — `aiAssistant`)

A floating chat widget on generated sites, answered first-line by an AI that escalates to the owner.

**Widget** — `src/lib/site/chat.ts` (`withChatFeed`, wired into `serve.ts`): a self-contained
floating "Chat now" button + panel, mirroring the lead-form injection. It self-gates on
`GET /api/v1/public/chat/config` (shows only when `aiAssistant` is on-plan AND the owner enabled it).
Turns go to `POST /api/v1/public/chat/message`; owner/AI replies arrive via `GET /chat/poll`. Preview
runs as a non-persisting demo. Tenant + thread isolation: the **site token** authorizes the tenant,
a per-conversation **`publicToken`** scopes the widget to its own thread.

**Orchestration** — `src/lib/modules/chat/`:
- `chatTurn` (`orchestrator.ts`) — Haiku via **tool-use** returns a structured `{ reply, intent
  (answer|book|escalate), escalationReason }`. Answers ONLY from approved facts (`facts.ts`, shared
  with `sendAiReply`). Gated by `aiAssistant` + metered against `aiReplies`.
- **Business-hours aware** (`booking/hours.ts`: `isOpenNow`/`nextResponseEta`): on escalation, during
  hours it invites the visitor to call; after hours it gives an ETA of **next opening + 1 hour**.
- **Escalation** (`service.ts`): flips the `Conversation` to `escalated`, records an `AiEscalation`,
  and notifies the owner once — **bell + email + SMS** (`chat.escalated`), deep-linking
  `/client/chats/[id]`.
- **Timeout → lead** (`sweepChatEscalations`, run by the worker every ~60s): if the owner doesn't
  jump in within the configurable timeout (default 5 min), the AI hands off — captures the visitor's
  email/phone and creates a **Lead** (reusing the `lead.created` fan-out) so it lands in Inquiries.

**Owner inbox** — a dedicated **Chats** nav item (`/client/chats`, governed by the `inquiries` team
area). List + per-thread window with **manual reply** and **AI auto-compose** (`draftReply`). Config
(on/off, greeting, timeout) lives in `ClientSetting.aiSettings.chat` (`config.ts`), edited on the
Chats page.

**State machine:** `ai` → `escalated` → `human` / `awaiting_contact` → `closed`.

## Roadmap (nothing here boxes out later work)

1. **Now:** one-way owner SMS alerts (above).
2. **Mobile app:** push notifications become a 4th delivery channel in the same fan-out — no rework.
3. **Two-way SMS/WhatsApp:** per-client numbers + inbound routing into `Conversation`/`Message` via
   Twilio Conversations API. WhatsApp is just another `ConversationChannel` + Twilio sender.
