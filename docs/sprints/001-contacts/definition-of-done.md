# Sprint 001 (contacts) — Definition of Done

> References `decision.md` (Problem / Acceptance Criteria / Constraints). Not restated here.

This is a conformance corpus, not an application module — so "done" is measured
as **method-surface coverage** and **green against the reference server**, not as
a code-coverage percentage.

## Oracle discipline — expected values and the `required` flag

Because the only server run against is `unifyd`, the plan must guard against the
tests and the oracle sharing a bug (review B1) and against `required` being a
movable goalpost (review M1):

- **Expected values are derived from the spec, not the server.** Every
  `required:true` assertion cites the specific RFC 9610 / 9553 **MUST** it
  encodes, and its expected value comes from the RFC text, an RFC example, or a
  hand-computed vector — **never** from an observed `unifyd` response. The vectors
  live in the clarifications doc so a reviewer can check assertion-against-spec
  without running the server. `unifyd` is used to *run* a test, never to *author*
  its expectation.
- **The `required` flag tracks spec obligation, not convenience.** A spec **MUST**
  is `required:true` — full stop. The *only* admissible reasons for `required:false`
  are: (a) a genuine RFC **SHOULD/MAY** (e.g. `shareWith` sharing, the SHOULD
  sorts `name/given|surname|surname2`), or (b) a server-*optional* capability.
  A non-deterministic fixture is a **fixture** problem to fix (capture real values,
  seed deliberately), never a reason to demote a MUST. Note "WARN" is not a status
  — it is how a `required:false` test's FAIL is *displayed*, so demoting a MUST
  hides its failure from the gate.
- **A MUST that `unifyd` fails is the deliverable.** It stays `required:true`; its
  red is a real conformance finding, filed as a `unifyd` gap — the point of an
  external oracle — not tuned away.

## Coverage bar (what "complete" means)

- **Method surface** — every RFC 9610 method is exercised: `AddressBook/{get,
  changes,set}` and `ContactCard/{get,changes,query,queryChanges,set,copy}`.
  A registered test exists for each. Absence of any method's tests = not done.
- **Filter surface** — every `ContactCard/query` FilterCondition in RFC 9610
  §ContactCard/query has ≥1 test: `inAddressBook`, `uid`, `hasMember`, `kind`,
  `createdBefore`, `createdAfter`, `updatedBefore`, `updatedAfter`, `text`,
  `name`, `name/given`, `name/surname`, `name/surname2`, `nickname`,
  `organization`, `email`, `phone`, `onlineService`, `address`, `note`.
- **Sort surface** — `created` + `updated` (MUST, `required: true`);
  `name/given`, `name/surname`, `name/surname2` (SHOULD, `required: false`).

## Integration points to verify (real, not mocked)

- **Live `unifyd` contacts wire surface** — every test runs against a running
  `unifyd` over HTTP; no server behavior is stubbed.
- **Session capability discovery** — the contacts capability is read from the
  session; the contacts primary account id is resolved from `primaryAccounts`
  (may differ from the mail account); the `using` set includes the contacts URN.
- **Blob upload / download** — the photo/media path uploads an image blob and
  reads it back as a `blobId` on `ContactCard/get`.
- **Cross-account** — `ContactCard/copy` runs against a second accessible
  account, skipping (like `email-copy`) when none is configured.
- **Account lifecycle** — clean-account force-cleans stale contacts objects and
  seed/teardown round-trips leave the account as found.

## Edge cases that must have tests

- `get` for an unknown id → returned in `notFound` (String[]).
- `ContactCard/set create` missing a required Card property (`@type` / `version`
  / `uid`) → `invalidProperties` (or the server's documented invalid-Card error).
- `addressBookIds` must be a non-empty map whose values are all `true`.
- `AddressBook/set destroy` of a non-empty book with
  `onDestroyRemoveContents:false` → `addressBookHasContents`; and the
  `onDestroyRemoveContents:true` path.
- Exactly one `AddressBook` has `isDefault:true`; server-set props
  (`id`,`isDefault`,`myRights`) rejected when supplied on create.
- Non-image blob rejected for the photo/media property (RFC 9610 §3.5 — a server
  **MUST** reject; `required:true`).
- A `ContactCard/set create` whose `uid` collides with an existing card in the
  account is rejected (RFC 9610 §3 — MUST NOT have two cards with the same uid).
- A returned Media entry carries **both** `blobId` and `mediaType` (RFC 9610 §3),
  not `blobId` alone.
- `query` with `filter: {}` and with the filter omitted (never `filter: null`).
- `query` phrase (quoted) vs token (unquoted whitespace) matching semantics.
- `changes` reports `cannotCalculateChanges` for an unknown/too-old state, and a
  card created-and-destroyed within the window appears in no bucket.

## Regression baseline

Before chunk 1 changes anything, capture a **baseline snapshot** — per-category
`requiredPassed` / `requiredFailed` from a full-suite run against the `unifyd`
config — and commit it under the sprint dir (`baseline.json` or a `baseline.md`
table). Target `requiredFailed == 0` for the mail/core categories; if any are red
today, record that so "no regression" means "no *new* red vs this snapshot." The
comparison is on `required` counts and skip-tolerant (live runs emit
nondeterministic SKIPs for cross-account / smee).

## The gate

- `npm run build` — `tsc` clean (no type errors).
- Suite run against the `unifyd` config with
  `--filter 'contacts/*,addressbook/*'`: all `required` tests **pass**; SHOULD /
  server-optional tests pass or fail-visibly (never demote a MUST to hide it).
- **Contacts actually executed** (review B2): against the known-contacts-capable
  `unifyd` config, the number of **executed (non-skip)** `contacts` + `addressbook`
  tests is `> 0` and equals the expected registered count. A run where the
  contacts surface skips is a gate **failure**, not a pass. The runner logs the
  resolved `contactsAccountId` and the discovered contacts capability at startup.
- **Method/filter coverage check** (review m6): the union of registered
  `required` contacts test ids maps to every method in the Coverage bar and every
  ContactCard/query FilterCondition — asserted, not assumed.
- Full-suite run (no filter) against `unifyd`: the mail/core `required` counts
  equal the regression baseline (no new required failures from the framework
  changes).

Each chunk inherits the slice of this gate covering the methods it adds.
