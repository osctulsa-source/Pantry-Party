# Portfolio demo and device validation

Use a dedicated test account and household with synthetic data. Do not clear or seed a
real household for a recording. This guide does not require database credentials or direct
SQL writes. Use the app's normal add, edit, and remove actions.

## Prepare a repeatable demo

1. Sign in online and allow the initial household sync to complete.
2. Create/use a dedicated demo household. For the two-device check, invite a second test
   account through the normal household flow and accept on its device.
3. In Add items, open the typed/pasted list flow and paste `demo-groceries.txt` from this
   folder. Review the entries and add once. Repeated imports can increase quantities.
4. Set spinach's expiry to tomorrow through the item editor. Expiry dates are demo inputs,
   not food-safety advice. Add oats to the shopping list through the app.
5. Load a recipe online before recording. Recipe availability may require network access.
6. Hide notifications and keep account details, invitation codes, and real receipts out of
   the recording. Record the build number and date in your private QA notes.

## 75–90 second walkthrough

| Time | Action | Suggested narration |
|---|---|---|
| 0–10s | Show the pantry | “I built Pantry Party to help a household track groceries and cook what it already has.” |
| 10–30s | Read a synthetic receipt/order image; correct one item and exclude one | “Text is recognized on the device. I review the results before saving them.” |
| 30–45s | Show the added items and expiry | “Inventory and expiry information stay in the local database.” |
| 45–65s | Disable connectivity, edit an item's quantity, close and reopen the app | “This pantry edit persists without a network connection.” |
| 65–80s | Reconnect and show the edit on the other device | “Queued changes upload through an authenticated API and sync to the household.” |
| 80–90s | Show recipes or the shopping list | “The repository includes the architecture, regression tests, and release checks.” |

Only describe behavior that the recording actually demonstrates. If using one device,
omit the second-device claim. Use system connectivity controls; Wi-Fi off alone may leave
cellular data active. Keep the clip understandable with captions and without sound.

Save the finished recording as `web/legal/media/walkthrough.mp4` and add a matching
`walkthrough.vtt` caption file. The site generator publishes the video only when both exist.
Keep it short and compressed; large recordings should use a reviewed external host instead.
Regenerate the site after adding media. Screenshots are handled separately in
`web/legal/screenshots/README.md`.

## Device checks before calling a release demo-ready

These are manual acceptance checks, not assertions that this revision has passed them.
Record date, exact build, device/OS, result, and any observed delay for each run.

| Check | Procedure | Expected result |
|---|---|---|
| Capture correction | Import an image, correct a recognized name/quantity, exclude a row, save | Only reviewed items and corrected values appear in the pantry |
| Offline persistence | Sync online; disable all connectivity; add a uniquely named item; restart the app | Item and quantity remain visible while offline |
| Reconnect delivery | Reconnect device A; open the same household on online device B | B receives the item and the same quantity; record time, don't invent a latency target |
| Replay/restart | Restart A again after synchronization | No duplicate item or repeated quantity increase |
| Household join | Invite test account B and accept on B | Existing shared inventory becomes visible without duplicate household creation |
| Session cleanup | Sign out A, then sign in to an unrelated test household | Previous household's items are absent |
| Concurrent quantity edits | Edit the same item offline on A and B, then reconnect | Document observed last-write-wins behavior; do not promise additive merging |

A simulator run is not TestFlight verification. Follow `docs/TESTFLIGHT.md` for release
gates. Do not publish OTA updates; they are disabled.
