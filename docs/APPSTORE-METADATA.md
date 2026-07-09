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
| Marketing URL (optional) | — |

## Promotional text (170 chars max)

> Your household's shared pantry — scan groceries in, watch expiry dates, cook
> what you have, and shop what you're missing. Built to waste less food.

## Description

> Pantry Party is the shared pantry for your household. Everyone sees the same
> shelves — what's in the fridge, freezer, and cupboard — synced instantly and
> working even when your phone is offline.
>
> ADD GROCERIES IN SECONDS
> Scan a barcode and items name themselves. Point the camera at a receipt and
> Pantry Party reads it — no typing, no forms. Or add things by hand when you
> prefer.
>
> STOP WASTING FOOD
> Track best-before dates and fill levels. See what's expiring soon and cook it
> before it turns into compost guilt.
>
> COOK WHAT YOU HAVE
> Browse 150 curated recipes plus live suggestions matched to what's actually in
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
| Diagnostics → Crash Data | Yes (Sentry, no PII) | **No** | No |
| Location, Contacts, Health, Purchases, Browsing, Search history | Not collected | — | — |

Camera: used for barcode/receipt/QR scanning; images processed on device, never
stored or transmitted (matches the privacy policy and the `NSCameraUsageDescription`).

## Beta review notes (external TestFlight)

> Sign-in required. Demo account: create one with any email via Sign Up (email
> confirmation is disabled for review) — or use the provided demo credentials:
> `[create a demo account and fill in before requesting review]`.
> Camera features (barcode/receipt scanning) require a physical device.
> The app is offline-first: data syncs when connectivity returns.

## Remaining decisions

- [ ] Demo account for review (create + record credentials here)
- [ ] Age rating questionnaire (expect 4+; no user-generated public content)
- [ ] Primary category: **Food & Drink**; secondary: Productivity or Shopping
- [ ] Confirm contact email (currently jcsenka013@gmail.com on the legal pages)
- [ ] Legal entity name on the Terms (currently "the Pantry Party team")
