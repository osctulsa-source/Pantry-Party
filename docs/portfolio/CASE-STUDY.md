# Pantry Party: a shared pantry that works offline

A mobile product by **JC Senka** · **React Native / Expo · TypeScript · NestJS · PostgreSQL**

[Project website](https://legal-production-9e0c.up.railway.app/) · [Source code](https://github.com/osctulsa-source/Pantry-Party) · [JC on LinkedIn](https://www.linkedin.com/in/jcsenka/)

## The problem

A household needs a shared view of its groceries: what is available, what should be used
soon, and what belongs on the next shopping trip. Entering every item manually creates
friction, and a grocery-store connection should not determine whether an edit saves.

Pantry Party combines receipt and grocery-order capture, editable review, pantry inventory,
recipe discovery, and a shared shopping list. The iPhone app is in a working TestFlight beta.
As of October 8, 2026, JC has been using it successfully through TestFlight for a couple of
months.

## Project ownership and scope

JC Senka is the project creator and maintainer. The repository brings together the mobile
experience, shared domain rules, authenticated API, sync configuration, tests, and release
runbooks. The examples below point to inspectable implementation.

## One edit, from phone to household

1. A pantry edit writes to **local SQLite**, so the UI does not wait for a server round trip.
2. **PowerSync** queues the mutation while the device is disconnected.
3. On reconnection, the connector uploads through an authenticated **NestJS/Express API**.
4. The API validates the operation and household membership before writing to **Postgres**.
5. PowerSync downloads household-scoped changes to connected members' devices.

Supabase provides authentication and durable Postgres storage. Zod schemas and pure
TypeScript rules live in a shared package. Managed sync reduces infrastructure work, while
the application still owns authorization, local data lifecycle, and conflict behavior.

[Architecture and tradeoffs](https://github.com/osctulsa-source/Pantry-Party/blob/main/docs/ARCHITECTURE.md)

## Engineering example: two devices creating one household

**Failure mode:** concurrent first-time bootstrap requests can both observe no membership
and create separate households for the same person.

**Implementation:** the bootstrap endpoint uses a Postgres transaction and a per-user
advisory transaction lock. It checks existing membership inside that transaction before
creating a household.

**Evidence:** the integration test deliberately slows inserts, sends four concurrent
bootstrap requests, and asserts one household ID and exactly one creation. It uses real
Postgres; JWT verification is mocked in the test harness.

[Endpoint implementation](https://github.com/osctulsa-source/Pantry-Party/blob/main/services/api/src/routes/household.ts) · [Concurrency regression](https://github.com/osctulsa-source/Pantry-Party/blob/main/services/api/src/__integration__/household.integration.test.ts)

## Engineering example: signing out during sync startup

**Failure mode:** sign-out can arrive while a database connection is still in flight.
Skipping cleanup because the connection has not finished can leave the previous session's
local data behind.

**Implementation:** connection and disconnect-and-clear operations are serialized through
a promise chain, so cleanup follows even a pending connection.

**Evidence:** a controlled asynchronous test holds connection completion, issues sign-out,
then releases the connection and checks that data clearing runs exactly once. This is a
mocked lifecycle regression test, not proof of all native-device behavior.

[Connection lifecycle](https://github.com/osctulsa-source/Pantry-Party/blob/main/apps/mobile/src/data/powersync/db.ts) · [Race regression](https://github.com/osctulsa-source/Pantry-Party/blob/main/apps/mobile/src/data/powersync/db.race.test.ts)

## Capture with human review

On-device OCR reads receipt or order images. Parsers turn recognized text into candidate
items, and a review step lets the user correct or exclude entries before saving. Barcode
lookup and typed lists provide other entry paths. OCR is an applied machine-learning
integration; this project does not claim a custom-trained model or an LLM agent.

[OCR and parsing boundary](https://github.com/osctulsa-source/Pantry-Party/blob/main/apps/mobile/src/features/capture/runTextOcr.ts) · [Editable list review](https://github.com/osctulsa-source/Pantry-Party/blob/main/apps/mobile/src/features/capture/BulkPasteScreen.tsx) · [Capture-review regressions](https://github.com/osctulsa-source/Pantry-Party/blob/main/apps/mobile/src/features/capture/BulkPasteScreen.test.tsx)

## Validation and current limits

GitHub Actions runs typechecking, lint, core/mobile/API tests, real-Postgres integration
checks, migration checks, and iOS release-script checks. Device smoke flows cover navigation
and known UI regressions. The latest workflow result is linked below; it is separate from
hands-on validation of a particular TestFlight binary.

[Live CI results](https://github.com/osctulsa-source/Pantry-Party/actions/workflows/ci.yml)

- Concurrent quantity edits currently use **last-write-wins**. Per-device contribution
  merging is planned and requires a migration and mixed-client compatibility strategy.
- Offline pantry edits do not imply that authentication, remote recipe requests, or all
  other features work without a connection.
- The working distribution is an **iPhone TestFlight beta**. A public App Store or Android
  store release is not claimed.
- OTA updates are disabled. iOS changes follow the documented full-binary release gates.

## Try the project

[Request beta access](mailto:jcsenka013@gmail.com?subject=Pantry%20Party%20beta), explore the
[source](https://github.com/osctulsa-source/Pantry-Party), or follow the
[demo guide](https://github.com/osctulsa-source/Pantry-Party/blob/main/docs/portfolio/DEMO.md).
