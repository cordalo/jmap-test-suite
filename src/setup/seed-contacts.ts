import type { TestContext } from "../runner/test-context.js";
import type { Card } from "../types/jmap-contacts.js";

// Contacts fixtures + lifecycle (RFC 9610 / RFC 9553). All entry points are
// no-ops unless the account is contacts-capable (ctx.contactsAccountId set), so a
// mail-only server is entirely unaffected.

/** Stable, human-readable uids so `uid` / `hasMember` filters are deterministic. */
export const SEED_UID = {
  alice: "urn:example:contacts:alice",
  bob: "urn:example:contacts:bob",
  carol: "urn:example:contacts:carol",
  dave: "urn:example:contacts:dave",
  team: "urn:example:contacts:team",
  minimal: "urn:example:contacts:minimal",
} as const;

export interface BuildCardOpts {
  uid: string;
  kind?: string;
  full?: string;
  given?: string;
  surname?: string;
  surname2?: string;
  nickname?: string;
  emails?: Array<{ address: string; contexts?: string[]; pref?: number }>;
  phones?: Array<{ number: string; features?: string[] }>;
  addresses?: Array<{ full?: string; locality?: string; countryCode?: string }>;
  organizations?: Array<{ name?: string; units?: string[] }>;
  onlineServices?: Array<{ service?: string; uri?: string; user?: string }>;
  notes?: string[];
  members?: string[];
}

/**
 * Assemble a valid JSContact Card. Written defensively — the seed runs on every
 * contacts-capable run, so a malformed shape here would abort the whole suite.
 * Only `@type`/`version`/`uid` are mandatory (RFC 9553 §2.1); everything else is
 * added only when supplied.
 */
export function buildCard(opts: BuildCardOpts): Card {
  const card: Card = { "@type": "Card", version: "1.0", uid: opts.uid };

  if (opts.kind) card.kind = opts.kind;

  const nameComponents: Array<{ "@type": "NameComponent"; kind: string; value: string }> = [];
  if (opts.given) nameComponents.push({ "@type": "NameComponent", kind: "given", value: opts.given });
  if (opts.surname) nameComponents.push({ "@type": "NameComponent", kind: "surname", value: opts.surname });
  if (opts.surname2) nameComponents.push({ "@type": "NameComponent", kind: "surname2", value: opts.surname2 });
  if (opts.full || nameComponents.length > 0) {
    card.name = { "@type": "Name" };
    if (opts.full) card.name.full = opts.full;
    if (nameComponents.length > 0) card.name.components = nameComponents;
  }

  if (opts.nickname) {
    card.nicknames = { n1: { "@type": "Nickname", name: opts.nickname } };
  }

  if (opts.emails?.length) {
    card.emails = {};
    opts.emails.forEach((e, i) => {
      const entry: NonNullable<Card["emails"]>[string] = { "@type": "EmailAddress", address: e.address };
      if (e.contexts) entry.contexts = Object.fromEntries(e.contexts.map((c) => [c, true]));
      if (e.pref !== undefined) entry.pref = e.pref;
      card.emails![`e${i + 1}`] = entry;
    });
  }

  if (opts.phones?.length) {
    card.phones = {};
    opts.phones.forEach((p, i) => {
      const entry: NonNullable<Card["phones"]>[string] = { "@type": "Phone", number: p.number };
      if (p.features) entry.features = Object.fromEntries(p.features.map((f) => [f, true]));
      card.phones![`p${i + 1}`] = entry;
    });
  }

  if (opts.addresses?.length) {
    card.addresses = {};
    opts.addresses.forEach((a, i) => {
      const entry: NonNullable<Card["addresses"]>[string] = { "@type": "Address" };
      if (a.full) entry.full = a.full;
      if (a.locality) entry.components = [{ "@type": "AddressComponent", kind: "locality", value: a.locality }];
      if (a.countryCode) entry.countryCode = a.countryCode;
      card.addresses![`a${i + 1}`] = entry;
    });
  }

  if (opts.organizations?.length) {
    card.organizations = {};
    opts.organizations.forEach((o, i) => {
      const entry: NonNullable<Card["organizations"]>[string] = { "@type": "Organization" };
      if (o.name) entry.name = o.name;
      if (o.units) entry.units = o.units.map((u) => ({ "@type": "OrgUnit", name: u }));
      card.organizations![`o${i + 1}`] = entry;
    });
  }

  if (opts.onlineServices?.length) {
    card.onlineServices = {};
    opts.onlineServices.forEach((s, i) => {
      const entry: NonNullable<Card["onlineServices"]>[string] = { "@type": "OnlineService" };
      if (s.service) entry.service = s.service;
      if (s.uri) entry.uri = s.uri;
      if (s.user) entry.user = s.user;
      card.onlineServices![`s${i + 1}`] = entry;
    });
  }

  if (opts.notes?.length) {
    card.notes = {};
    opts.notes.forEach((n, i) => {
      card.notes![`no${i + 1}`] = { "@type": "Note", note: n };
    });
  }

  if (opts.members?.length) {
    card.members = Object.fromEntries(opts.members.map((m) => [m, true]));
  }

  return card;
}

/**
 * Create two AddressBooks and a handful of ContactCards, recording ids and the
 * server-assigned created/updated timestamps on ctx. Ordered, sequential creates
 * so created/updated are distinct for the time-window and sort tests.
 */
export async function seedContacts(ctx: TestContext): Promise<void> {
  const accountId = ctx.contactsAccountId;
  if (!accountId) return;

  const { client } = ctx;

  // Two address books.
  const bookRes = await client.call("AddressBook/set", {
    accountId,
    create: {
      bookMain: { name: "Test Book Main" },
      bookOther: { name: "Test Book Other" },
    },
  });
  const booksCreated = bookRes.created as Record<string, { id: string }> | null;
  if (!booksCreated?.bookMain || !booksCreated?.bookOther) {
    const notCreated = JSON.stringify(bookRes.notCreated ?? {});
    throw new Error(`Contacts seed: AddressBook/set did not create both books (${notCreated})`);
  }
  ctx.addressBookIds.bookMain = booksCreated.bookMain.id;
  ctx.addressBookIds.bookOther = booksCreated.bookOther.id;
  const main = ctx.addressBookIds.bookMain;
  const other = ctx.addressBookIds.bookOther;

  // Cards, created one at a time and in this order so timestamps separate.
  const specs: Array<{ key: keyof typeof SEED_UID; book: string; card: Card }> = [
    {
      key: "alice",
      book: main,
      card: buildCard({
        uid: SEED_UID.alice,
        kind: "individual",
        full: "Alice Anderson",
        given: "Alice",
        surname: "Anderson",
        emails: [{ address: "alice@work.example.com", contexts: ["work"], pref: 1 }],
        phones: [{ number: "tel:+1-555-0100", features: ["mobile"] }],
        organizations: [{ name: "Acme" }],
        onlineServices: [{ service: "Mastodon", uri: "https://example.social/@alice", user: "@alice" }],
      }),
    },
    {
      key: "bob",
      book: main,
      card: buildCard({
        uid: SEED_UID.bob,
        kind: "individual",
        full: "Bob Baker Croft",
        given: "Bob",
        surname: "Baker",
        surname2: "Croft",
        emails: [{ address: "bob@home.example.com", contexts: ["private"] }],
        addresses: [{ full: "742 Evergreen Terrace, Springfield", locality: "Springfield", countryCode: "US" }],
      }),
    },
    {
      key: "carol",
      book: main,
      card: buildCard({
        uid: SEED_UID.carol,
        kind: "individual",
        full: "Carol Jones",
        given: "Carol",
        surname: "Jones",
        nickname: "CJ",
        notes: ["Met at the 2026 interop conference."],
      }),
    },
    {
      key: "dave",
      book: other,
      card: buildCard({ uid: SEED_UID.dave, kind: "individual", full: "Dave Doyle", given: "Dave", surname: "Doyle" }),
    },
    {
      key: "team",
      book: main,
      card: buildCard({ uid: SEED_UID.team, kind: "group", full: "Project Team", members: [SEED_UID.alice, SEED_UID.bob] }),
    },
    {
      key: "minimal",
      book: main,
      card: buildCard({ uid: SEED_UID.minimal }),
    },
  ];

  const idToKey: Record<string, string> = {};
  for (const spec of specs) {
    const res = await client.call("ContactCard/set", {
      accountId,
      create: { [spec.key]: { ...spec.card, addressBookIds: { [spec.book]: true } } },
    });
    const created = res.created as Record<string, { id: string }> | null;
    if (created?.[spec.key]) {
      const id = created[spec.key].id;
      ctx.contactCardIds[spec.key] = id;
      idToKey[id] = spec.key;
    } else {
      const err = (res.notCreated as Record<string, { type: string; description?: string }> | null)?.[spec.key];
      process.stderr.write(
        `  Warning: contacts seed could not create '${spec.key}': ${err?.type ?? "unknown"} - ${err?.description ?? ""}\n`
      );
    }
  }

  // Read back server-assigned created/updated for the time-window / sort tests.
  const ids = Object.values(ctx.contactCardIds);
  if (ids.length > 0) {
    const get = await client.call("ContactCard/get", {
      accountId,
      ids,
      properties: ["id", "created", "updated"],
    });
    for (const c of (get.list as Array<{ id: string; created?: string; updated?: string }>)) {
      const key = idToKey[c.id];
      if (key) ctx.contactCardMeta[key] = { created: c.created, updated: c.updated };
    }
  }

  process.stderr.write(
    `  Seeded contacts: ${Object.keys(ctx.addressBookIds).length} address books, ${Object.keys(ctx.contactCardIds).length} cards\n`
  );
}

/** Count contacts objects that make an account "not empty" (custom books + cards). */
export async function countContacts(ctx: TestContext): Promise<number> {
  const accountId = ctx.contactsAccountId;
  if (!accountId) return 0;
  const { client } = ctx;

  let cardTotal = 0;
  try {
    const q = await client.call("ContactCard/query", { accountId, limit: 1, calculateTotal: true });
    cardTotal = (q.total as number) ?? ((q.ids as string[])?.length ?? 0);
  } catch {
    // ContactCard/query may be unavailable; fall back to zero.
  }

  let customBooks = 0;
  try {
    const books = await client.call("AddressBook/get", { accountId, ids: null });
    customBooks = (books.list as Array<{ isDefault: boolean }>).filter((b) => !b.isDefault).length;
  } catch {
    // ignore
  }

  return cardTotal + customBooks;
}

/** Force-delete all contacts data: cards first, then non-default books. */
export async function forceCleanContacts(ctx: TestContext): Promise<void> {
  const accountId = ctx.contactsAccountId;
  if (!accountId) return;
  const { client } = ctx;

  // Destroy all cards in batches.
  let destroyed = 0;
  while (true) {
    const q = await client.call("ContactCard/query", { accountId, limit: 50 });
    const ids = q.ids as string[];
    if (ids.length === 0) break;
    await client.call("ContactCard/set", { accountId, destroy: ids });
    destroyed += ids.length;
    if (ids.length < 50) break;
  }
  if (destroyed > 0) process.stderr.write(`  Deleted ${destroyed} contact cards\n`);

  // Destroy custom (non-default) books, removing any remaining contents.
  const books = await client.call("AddressBook/get", { accountId, ids: null });
  const custom = (books.list as Array<{ id: string; isDefault: boolean }>).filter((b) => !b.isDefault);
  for (const b of custom) {
    try {
      await client.call("AddressBook/set", {
        accountId,
        destroy: [b.id],
        onDestroyRemoveContents: true,
      });
    } catch {
      process.stderr.write(`  Warning: could not delete address book ${b.id}\n`);
    }
  }
  if (custom.length > 0) process.stderr.write(`  Deleted ${custom.length} address books\n`);
}

/** Destroy the seeded contacts objects (cards before books). */
export async function teardownContacts(ctx: TestContext): Promise<void> {
  const accountId = ctx.contactsAccountId;
  if (!accountId) return;
  const { client } = ctx;

  const cardIds = Object.values(ctx.contactCardIds);
  if (cardIds.length > 0) {
    try {
      await client.call("ContactCard/set", { accountId, destroy: cardIds });
    } catch {
      // may already be gone
    }
  }

  const bookIds = Object.values(ctx.addressBookIds);
  for (const id of bookIds) {
    try {
      await client.call("AddressBook/set", { accountId, destroy: [id], onDestroyRemoveContents: true });
    } catch {
      // may already be gone
    }
  }
  if (cardIds.length > 0 || bookIds.length > 0) {
    process.stderr.write("  Contacts teardown complete.\n");
  }
}
