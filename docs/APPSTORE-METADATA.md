# App Store Connect metadata — draft copy

Paste-ready drafts for the App Store Connect record (**PantryPartyColeTech**,
`ascAppId 6788079875`). Needed before **external** TestFlight groups (Apple beta
review) and, later, the public App Store listing. Display name stays freely
changeable if the brand (Larder/Crumb) lands later.

## URLs

| Field | Value |
|---|---|
| Privacy Policy URL | `https://legal-production-9e0c.up.railway.app/privacy/` |
| Terms of Use (EULA) | `https://legal-production-9e0c.up.railway.app/terms/` (or leave Apple's standard EULA) |
| Support URL | `https://legal-production-9e0c.up.railway.app/` |
| Marketing URL (optional) | `https://legal-production-9e0c.up.railway.app/` |

## Promotional text (170 chars max)

> Your household's shared pantry — scan groceries in, watch expiry dates, cook
> what you have, and shop what you're missing. Built to waste less food.

## Description

> Pantry Party is the shared pantry for your household. Everyone sees the same
> shelves — what's in the fridge, freezer, and cupboard — synced instantly and
> working even when your phone is offline.
>
> ADD GROCERIES IN SECONDS
> Scan a barcode and items name themselves. Point the camera at a receipt, or
> choose a screenshot of a grocery order, and Pantry Party reads it on your
> device — no typing, no forms. Or add things by hand when you prefer.
>
> STOP WASTING FOOD
> Track best-before dates and fill levels. See what's expiring soon and cook it
> before it turns into compost guilt.
>
> COOK WHAT YOU HAVE
> Browse nearly 300 curated recipes plus live suggestions matched to what's actually in
> your pantry — with substitutions when you're missing an ingredient.
>
> SHOP AS A TEAM
> One shared shopping list for the household. Check things off at the store and
> everyone's list updates live.
>
> A LOCK-SCREEN WIDGET
> What's expiring, at a glance, without opening the app.
>
> PRIVATE BY DESIGN
> No ads, no data sales, no tracking. Your pantry is yours — we just keep it in
> sync. Delete your account (and its data) from inside the app at any time.

## Keywords (100 chars max)

`pantry,grocery,food waste,expiry,fridge,inventory,shopping list,household,recipes,barcode`

## App Privacy labels (Data Collection)

| Data type | Collected? | Linked to identity | Tracking |
|---|---|---|---|
| Contact Info → Email Address | Yes (account) | Yes | No |
| User Content → Other (pantry/shopping/household data) | Yes | Yes | No |
| Identifiers → User ID | Yes (account UUID) | Yes | No |
| Usage Data → Product Interaction | Yes (PostHog + first-party `analytics_events`) | Yes (account ID) | No |
| Diagnostics → Crash Data | Yes (Sentry, no PII) | **No** | No |
| Location, Contacts, Health, Purchases, Browsing, Search history | Not collected | — | — |

Camera: used for barcode/receipt/QR scanning; Photos library used when you
choose a receipt screenshot. Images processed on device, never stored or
transmitted (matches the privacy policy and the camera/photos usage strings).

## Beta review notes (external TestFlight)

> Sign-in required. Demo account: create one with any email via Sign Up (email
> confirmation is disabled for review) — or use the provided demo credentials:
> `[create a demo account and fill in before requesting review]`.
> Camera features (barcode/receipt scanning) require a physical device.
> The app is offline-first: data syncs when connectivity returns.

## TestFlight Test Information (external groups)

App Store Connect → TestFlight → Test Information. Required once per app before
the first external build goes to beta review.

| Field | Value |
|---|---|
| Feedback email | `jcsenka013@gmail.com` |
| Marketing URL | `https://legal-production-9e0c.up.railway.app/` |
| Privacy Policy URL | `https://legal-production-9e0c.up.railway.app/privacy/` |
| Sign-in required | Yes — demo account below |

**Beta App Description** (4,000 chars max):

> Pantry Party is a shared pantry for your household. Add groceries by barcode,
> receipt photo, grocery-order screenshot, or a pasted list; track expiry dates;
> find recipes that use what you already have; and keep one shopping list in
> sync for everyone at home. It keeps working offline and syncs when you're back
> online.

**What to Test** (per build, 4,000 chars max) — update for each build:

> Thanks for testing! Please try:
> 1. Sign up, then add a few items — scan a barcode, read a receipt or a
>    grocery-order screenshot, or paste a list.
> 2. Fix anything the app misread before saving. Tell us what it got wrong.
> 3. Set an expiry date and check the Expiring soon list.
> 4. Invite someone in your household (Settings → Household) and add items
>    from both phones.
> 5. Turn on Airplane Mode, make a change, turn it off — the change should sync.
>
> Send feedback from Settings → Send feedback (your build number is filled in),
> or take a screenshot in TestFlight. Known limit: if two phones edit the same
> item's quantity offline, the last edit wins.

## External TestFlight launch checklist

In order. Internal testers (App Store Connect users, up to 100) need only step 1.

1. A build passes the on-device checks in `docs/portfolio/DEMO.md` (at least
   capture, offline persistence, household join) — see `docs/TESTFLIGHT.md`.
2. Demo account exists and its credentials are in the beta review notes.
3. Test Information above is filled in; App Privacy answers match the labels
   table above.
4. Create an external group, add the build, submit for beta review (usually
   ~1 day for the first build; later builds of the same version are often
   instant).
5. After approval, enable the group's **public link** and share it. Set a
   tester limit so a shared link can't outgrow the backend plans (Supabase,
   PowerSync, Railway, Spoonacular).

## Remaining decisions

- [ ] Demo account for review (create + record credentials here)
- [ ] Age rating questionnaire (expect 4+; no user-generated public content)
- [ ] Primary category: **Food & Drink**; secondary: Productivity or Shopping
- [ ] Confirm contact email (currently jcsenka013@gmail.com on the legal pages)
- [ ] Legal entity name on the Terms (currently "the Pantry Party team")
