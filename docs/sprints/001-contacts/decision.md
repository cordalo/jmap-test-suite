# Sprint 001 (contacts) — Extend the suite to JMAP Contacts — Decision

## Problem

This suite is a black-box JMAP conformance runner. Its coverage today is
RFC 8620 (Core) and RFC 8621 (Mail) only — ten categories, ~300 tests, all
mail-shaped. It exercises no part of **JMAP for Contacts** (RFC 9610) or its
data model **JSContact** (RFC 9553).

The server under test (`unifyd`) already implements a full JMAP Contacts wire
surface: it advertises `urn:ietf:params:jmap:contacts` and serves `AddressBook`
(get / changes / set) and `ContactCard` (get / changes / query / queryChanges /
set / copy), including the JSContact `media` → `blobId` photo path. That surface
has only an *in-process* seam assertion on the server side; there is no
independent, wire-level, spec-grounded oracle that exercises it from the outside
the way this suite already does for the mail surface. Contacts is the first
non-mail JMAP surface, and the natural next coverage domain (calendars follows).

The gap: a client-side conformance corpus for the Contacts surface, built to the
RFCs and exercised over the wire, so the implementation is validated against the
specification rather than against itself.

## Acceptance Criteria

A non-implementer can confirm each of these by running the suite:

1. Running against a contacts-capable server exercises **AddressBook** `get` /
   `changes` / `set`, **ContactCard** `get` / `changes` / `query` /
   `queryChanges` / `set` / `copy`, and the ContactCard **photo/media** blob
   path (upload → `blobId`+`mediaType` on read; non-image **rejected** for a
   photo, which RFC 9610 §3.5 makes a server MUST). `copy` is exercised against a
   contacts-capable second account the `unifyd` test config provides; if the
   deployment cannot provide one, the copy surface is reported **unverified**
   (never silently skipped-as-green — see the execution-count gate in the DoD).
2. Every one of the RFC 9610 `ContactCard/query` **FilterCondition** properties
   has at least one test; the two MUST sort orders (`created`, `updated`) are
   covered; the SHOULD sorts (`name/given`, `name/surname`, `name/surname2`) are
   present and marked recommended (WARN, not FAIL, on absence).
3. When the server does **not** advertise `urn:ietf:params:jmap:contacts`, every
   contacts test **skips** (not fails) — capability-gated like the existing
   `vacation` category.
4. Contacts tests operate on the **contacts primary account** (which may differ
   from the mail account) and send the correct `using` capability set. The
   account resolver's separate-account (non-`primaryAccounts`) fallback branch is
   covered by a direct unit test with a synthesized session; the same-account
   case is verified live against `unifyd`.
5. The suite still runs green against `unifyd` for the existing mail categories
   (**no regression**), and the new contacts categories pass against `unifyd`.
6. The clean / seed / teardown lifecycle handles contacts objects: a re-run
   force-cleans stale `AddressBook`/`ContactCard` data and leaves the account as
   it found it (no cross-run pollution).
7. RFC 9610 / 9553 interpretation decisions the tests rest on are captured in the
   repo's clarifications document, matching the existing `rfc-clarifications.md`
   convention.

## Constraints

- **Honors existing suite conventions** — the `defineTests()` registry, `runIf`
  capability gating (the `vacation` pattern), the "no `filter: null` — omit it"
  rule, self-cleaning tests (`finally` teardown of created objects), HTTP-status
  range assertions, and per-test exchange recording. New categories plug in via
  `cli.ts` imports; no test framework is introduced.
- **Validation target is `unifyd` only.** Tests are written to the RFC/spec and
  exercised against `unifyd`. No Fastmail or other third-party server is used
  (no access rights).
- **Repository boundary** — all work lands in *this* repository
  (`jmap-test-suite`, the cordalo fork). No change is made to the `cordalo-unify`
  server repository as part of this sprint.
- **Data model scope** — Cards are built to the minimum validity RFC 9553
  requires (`@type` = `Card`, `version`, `uid`) and exercise the sub-objects the
  JMAP methods meaningfully touch (Name, EmailAddress, Phone, Address,
  Organization, and `media` for the photo path). Exhaustive JSContact validation
  (localizations / PatchObject, personalInfo, speakToAs, phonetics) is **not** a
  goal — that is a data-model spec, not JMAP behavior.
- **Non-goals** — JMAP Calendars (a separate, later sprint); any server-side
  change; a code-coverage percentage gate (this is a conformance corpus — see
  `definition-of-done.md` for how "done" is measured instead).
- **House rules** — no AI/bot attribution anywhere; TypeScript, Node 22+/bun,
  `tsc`-clean build.

## Tracking note

This sprint belongs to the same effort the upstream cordalo `unifyd` project
tracks as its JMAP-conformance line (the jmapio cross-validation oracle, and the
sibling calendar-corpus item). An owning tracking issue —
*"Contacts conformance: fork/extend the jmapio suite for the ContactCard /
AddressBook surface"* — should be filed against that backlog as the sibling of
the existing calendar item. It is **recommended here, not filed by this sprint**,
per the repository boundary above.
