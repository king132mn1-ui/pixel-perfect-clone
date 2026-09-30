# SentinelSec AI — build plan

A security operations platform with an AI assistant, subscription credits, crypto payment approval, and an admin control panel.

## Important first note

Your brief includes an OpenAI key pasted in plain text. I will **not** put it in the app — anyone visiting the site could read it. Please treat that key as compromised and revoke it. The AI features will run on Lovable's built-in AI instead, so no key is needed.

Admin credentials will also not be hardcoded. Real accounts with an admin role will be used instead.

## What gets built

**Accounts & plans**
- Email sign-up / sign-in
- Plans: Starter $20 (100 credits/mo), Professional $50 (500), Enterprise $100 (unlimited)
- Header shows current plan, remaining credits, live usage

**AI Security Assistant**
- Streaming chat for defensive security work: explaining OWASP Top 10 issues, CVEs, hardening advice, reviewing config
- Each message spends one credit; admins never spend credits
- Scope is defensive/authorized-assessment guidance only — no attack tooling

**Security workspace**
- Red team engagement tracker: engagements, scoped targets, findings with severity, status
- Blue team hardening: incident-response checklists and posture checks you can tick off
- Report generator: one-click export of an engagement to a formatted audit report (print/PDF)
- Vulnerability knowledge base: searchable entries with severity and remediation

**Crypto payments (USDT TRC20)**
- Payment modal with the Bitget address, copy button, QR code, network warning
- User submits the TXID; the payment sits as pending until an admin approves it
- Approval applies the plan and credits

**Admin panel (/admin)**
- Role-gated, not password-gated
- Unlimited AI, no credit consumption
- Maintenance kill-switch: public site shows a maintenance screen when off
- Users: view, edit credits, change plan
- Payments: approve or reject pending USDT submissions
- Support inbox: read and reply to messages

**Support**
- Contact tab plus floating widget; threads land in the admin inbox

**Look & themes**
- Dark cyberpunk base (#090d16 background, #111827 panels, electric cyan / neon blue accents)
- Theme switcher: Dark, Light, OLED black, Cyberpunk

## Technical notes

- Next.js is not available here; this is TanStack Start + React + Tailwind + shadcn, which covers the same ground.
- Lovable Cloud provides the database, auth, and server logic. Tables: profiles, user_roles, subscriptions, credit_ledger, payments, engagements, findings, checklists, kb_entries, support_threads, support_messages, app_settings.
- Roles live in a separate `user_roles` table checked server-side, so credits and admin access cannot be faked from the browser.
- Credit spend and all AI calls happen server-side.
- The first registered admin is promoted by me after signup; tell me which email to use.

## Build order

1. Enable Cloud, database schema, auth, roles
2. Design system + theme engine + app shell
3. AI assistant with credit gating
4. Workspace: engagements, findings, checklists, knowledge base, report export
5. Plans, payment modal, TXID flow
6. Admin panel: users, payments, kill-switch, inbox
7. Support widget and contact tab
