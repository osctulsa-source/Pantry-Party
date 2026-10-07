# Privacy Policy

> **DRAFT — not legal advice.** This policy was drafted to accurately describe the
> app's real data practices as built, but it must be reviewed by qualified counsel
> before publication. Replace every `[BRACKETED]` placeholder with your final
> details. `[APP NAME]` is a placeholder pending brand/trademark lock (internal
> codename: Breadbox).

**Effective date:** `[EFFECTIVE DATE]`
**Last updated:** `[EFFECTIVE DATE]`

`[APP NAME]` ("**[APP NAME]**", "**we**", "**us**", "**our**") is operated by
`[COMPANY / LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`. This Privacy Policy
explains what we collect, why, who we share it with, and the choices you have.
If you don't agree with it, please don't use the App.

---

## The short version

- **We built this to help you waste less food — not to harvest your data.**
- **We do not sell or rent your personal information. Ever.**
- **We do not show third-party ads, and we do not share your data with
  advertisers or data brokers.**
- **Sync and reliability are core features, not something we hold hostage.**
- **You can delete your account and its data from inside the App at any time.**

The sections below are the complete, specific version.

---

## 1. Who this policy covers

This policy applies to the `[APP NAME]` mobile application on iOS and Android and
the backend services that support it. It does not cover third‑party services we
integrate with, each of which has its own privacy policy (see
[Section 5](#5-service-providers-subprocessors)).

## 2. Information we collect

We collect only what the App needs to function. We do **not** buy personal
information about you from third parties.

**a. Account information.** When you create an account we process your **email
address** and authentication credentials through our authentication provider
(Supabase Auth). Your password is handled and stored by that provider; we never
see it in plain text.

**b. Content you add ("your pantry data").** The information you put into the
App so it can do its job, including:
- pantry items (name, optional brand, quantity, unit, storage location,
  category, best‑before / expiry date, and "how full" level);
- shopping‑list items;
- households you create or join, the household name, membership, and the
  **display name** you choose;
- recipes you save ("favorites") and your cooking activity (items you mark
  cooked, used, tossed, or restocked, with timestamps);
- on‑device taste/recipe preferences derived from what you save and cook.

**c. Barcodes you scan.** When you use the barcode scanner, your device's camera
decodes the barcode **on your device**. We send only the resulting **barcode
number** to a product database (Open Food Facts) to look up the product name and
brand. Camera images and receipt photos you choose from your library are
**not** stored by us and are **not** transmitted off your device.

**d. Recipe search terms.** To suggest recipes, we send **ingredient names
derived from your pantry** (and an optional meal type) to our server, which
queries a recipe provider (Spoonacular). We do **not** attach your name, email,
or account identifier to those upstream recipe queries.

**e. Device permissions.**
- **Camera** — used only to scan barcodes, QR codes, and receipts, as described above.
- **Photos** — used only when you choose a receipt or grocery-order screenshot to read on your device. We do not upload the image.
- **Notifications** — used to schedule **local** reminders on your device
  (expiry reminders, cook‑mode timers), and, if you allow notifications, to
  deliver **household notifications** (for example, a member announcing a
  shopping run). For household notifications we store a push token for your
  device, linked to your account, and send the notification through Expo's push
  service. We never send advertising notifications. You can disable
  notifications in your OS settings at any time; deleting your account
  deactivates your push tokens.

**f. Diagnostics (optional).** If enabled, we use an error‑reporting tool
(Sentry) to capture crash and error information so we can fix bugs. It is
configured to **not** attach personally identifying information by default. If
diagnostics are disabled, no crash data is sent.

**g. Product analytics.** To understand which features are used and where people
get stuck, the App records usage events (for example, screens viewed, items
added, or a recipe opened) with PostHog and in our own database. These events
are linked to your account ID and a random per‑install ID, **not** your email or
name. They may include simple counts and categories (such as how many items were
added, or "fridge"), but never item names or other text you type. We use them only to
improve the App; we do not use them for advertising or share them with
advertisers.

We do **not** intentionally collect precise location, contacts, health data, or
advertising identifiers.

## 3. How we use your information

- To provide the App's core features: storing your pantry, syncing it across
  your devices and household members, tracking expiry, suggesting recipes, and
  building your shopping list.
- To keep your data available and consistent across devices (offline‑first sync).
- To send the on‑device reminders you enable.
- To operate, secure, debug, and improve the App.
- To respond to your support requests.

We do **not** use your pantry data, activity, or account information for
advertising or to build profiles for sale.

## 4. How your information is stored and shared

Your pantry data is stored in our managed database and synchronized to your
devices. Within a **household**, the members you invite can see the shared
household's items, lists, and activity — that's the point of a shared pantry —
and can see the **display name** attributed to actions. Don't put anything in a
shared household you don't want other members to see.

We share information with third parties only in these cases:
- **Service providers** who process data on our behalf under contract, listed in
  [Section 5](#5-service-providers-subprocessors).
- **Legal requirements** — if required by law, valid legal process, or to
  protect the rights, safety, or property of our users or us.
- **Business transfer** — if we're involved in a merger, acquisition, or asset
  sale, data may transfer as part of it, subject to this policy.

We do **not** sell your personal information, and we do **not** share it with
advertisers or data brokers.

## 5. Service providers (subprocessors)

The App relies on the following providers. Each processes only what's needed for
its function, and each has its own privacy policy.

| Provider | Purpose | What it processes |
|---|---|---|
| **Supabase** (database + authentication; hosted in the United States, AWS `us-west-2`) | Stores your account and pantry data; handles sign‑in | Email, authentication data, all pantry/household/shopping/favorites/activity data |
| **PowerSync (JourneyApps)** | Real‑time sync between your device and the database | Your household's pantry data, in transit and in sync checkpoints |
| **Railway** | Hosts our backend API (writes, recipe proxy, account deletion) | Your data in transit while requests are processed |
| **Spoonacular** | Recipe search | Ingredient names + meal type derived from your pantry (no account identity) |
| **Open Food Facts** | Barcode → product lookup | The scanned barcode number |
| **Sentry** (optional; only if diagnostics enabled) | Crash/error reporting | Diagnostic data; no PII attached by default |
| **PostHog** (hosted in the United States) | Product analytics | Usage events linked to your account ID; no email, item names, or typed text |
| **Expo / EAS** | App builds, updates, and push notification delivery | Basic app/build and device information; device push tokens and household notification text |
| **Apple / Google** | App distribution (and, in future, payments) | Governed by their own policies |

`[Confirm this list and each provider's data‑processing terms with counsel;
add any provider added after this date. Consider a Data Processing Addendum with
each where required.]`

## 6. Data location and retention

Your data is processed and stored in the **United States** `[confirm region for
your final configuration]`. We retain your pantry data for as long as your
account is active. When you delete your account (see
[Section 7](#7-your-rights-and-choices)) we remove or irreversibly disassociate
the personal data you added, subject to limited retention required for legal,
security, or backup purposes (backups are rotated on a `[RETENTION PERIOD]`
cycle).

## 7. Your rights and choices

- **Access and edit.** You can view and edit all of your pantry data directly in
  the App.
- **Delete your account.** Settings → **Delete my account** permanently deletes
  your account and removes the data you added. Items you contributed to shared
  households are removed; sole‑member households are handled per the App's
  documented deletion behavior.
- **Notifications.** Turn reminders off in your device's OS settings.
- **Camera.** Revoke camera access in your device settings (barcode scanning
  will stop working).
- **Photos.** Revoke Photos access in your device settings (reading a receipt
  screenshot will stop working; paste and camera capture still work).
- **Diagnostics.** `[Describe how a user disables diagnostics, if exposed in‑app;
  otherwise state the default.]`

Depending on where you live, you may have additional rights (for example, under
the EU/UK GDPR or the California CCPA/CPRA) to access, correct, delete, port, or
restrict processing of your personal information, and to object to certain
processing. To exercise these, contact us at `[PRIVACY CONTACT EMAIL]`. We will
not discriminate against you for exercising them. `[Counsel: confirm which
regimes apply based on where you offer the App and expand this section
accordingly.]`

## 8. Children's privacy

The App is **not directed to children under `[13 / 16 — confirm]`**, and we do
not knowingly collect personal information from them. If you believe a child has
provided us personal information, contact us and we will delete it.

## 9. Security

We use industry‑standard measures to protect your data, including encryption in
transit (TLS), authentication on every write, and tenancy checks that keep one
household's data from being read or written by another. No method of transmission
or storage is 100% secure, but we work to protect your information and to respond
promptly to any incident.

## 10. Changes to this policy

We may update this policy as the App evolves. We'll change the "Last updated"
date above and, for material changes, provide a more prominent notice in the App.
Continued use after an update means you accept the revised policy.

## 11. Contact us

Questions or requests about your privacy:

`[COMPANY / LEGAL ENTITY NAME]`
`[PRIVACY CONTACT EMAIL]`
`[REGISTERED ADDRESS]`
