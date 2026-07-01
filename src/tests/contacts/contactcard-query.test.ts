import { defineTests } from "../../runner/test-registry.js";
import { needsContacts } from "./_capability.js";
import type { TestContext } from "../../runner/test-context.js";

// RFC 9610 §3.3 ContactCard/query — every FilterCondition, the sort surface, the
// filter combinators, and paging. Reads the deterministic seed (ctx.contactCardIds
// keyed by name; ctx.contactCardMeta holds server-assigned created/updated).
//
// Convention (suite rule): never send `filter: null` — omit it or send `{}`.
// Text/name filters assume the server indexes contacts synchronously at write
// (unifyd derives search at write time); if a target indexes asynchronously these
// would need assert-with-retry.

async function query(
  ctx: TestContext,
  args: Record<string, unknown>
): Promise<{ ids: string[]; total?: number; queryState: string }> {
  const r = await ctx.client.call("ContactCard/query", {
    accountId: ctx.contactsAccountId!,
    ...args,
  });
  return { ids: r.ids as string[], total: r.total as number | undefined, queryState: r.queryState as string };
}

/** A card must match this filter; another seeded card must not. */
function filterTest(
  id: string,
  name: string,
  filter: Record<string, unknown>,
  presentKey: string,
  absentKey: string,
  required = true
) {
  return {
    id,
    name,
    required,
    runIf: needsContacts,
    fn: async (ctx: TestContext) => {
      const { ids } = await query(ctx, { filter });
      ctx.assertIncludes(ids, ctx.contactCardIds[presentKey], `${presentKey} must match ${JSON.stringify(filter)}`);
      ctx.assertNotIncludes(ids, ctx.contactCardIds[absentKey], `${absentKey} must not match ${JSON.stringify(filter)}`);
    },
  };
}

// Time-window filters run only when the server returned created/updated (they are
// server-assigned; the seed reads them back). Otherwise skip with a reason.
const needsTimestamps = (ctx: TestContext): true | string => {
  const gate = needsContacts(ctx);
  if (gate !== true) return gate;
  return ctx.contactCardMeta?.["bob"]?.created && ctx.contactCardMeta?.["bob"]?.updated
    ? true
    : "Server did not return created/updated timestamps for seeded cards";
};

defineTests({ rfc: "RFC9610", section: "3.3", category: "contacts" }, [
  // --- FilterConditions ---
  {
    id: "query-in-address-book",
    name: "ContactCard/query filter inAddressBook",
    runIf: needsContacts,
    fn: async (ctx) => {
      // dave is the only seeded card in bookOther.
      const { ids } = await query(ctx, { filter: { inAddressBook: ctx.addressBookIds["bookOther"] } });
      ctx.assertIncludes(ids, ctx.contactCardIds["dave"], "dave is in bookOther");
      ctx.assertNotIncludes(ids, ctx.contactCardIds["alice"], "alice is in bookMain");
    },
  },
  filterTest("query-uid", "ContactCard/query filter uid", { uid: "urn:example:contacts:alice" }, "alice", "bob"),
  filterTest("query-has-member", "ContactCard/query filter hasMember", { hasMember: "urn:example:contacts:alice" }, "team", "alice"),
  filterTest("query-kind", "ContactCard/query filter kind", { kind: "group" }, "team", "alice"),
  filterTest("query-text", "ContactCard/query filter text", { text: "Anderson" }, "alice", "bob"),
  filterTest("query-name", "ContactCard/query filter name", { name: "Anderson" }, "alice", "bob"),
  filterTest("query-name-given", "ContactCard/query filter name/given", { "name/given": "Alice" }, "alice", "bob"),
  filterTest("query-name-surname", "ContactCard/query filter name/surname", { "name/surname": "Baker" }, "bob", "alice"),
  filterTest("query-name-surname2", "ContactCard/query filter name/surname2", { "name/surname2": "Croft" }, "bob", "alice"),
  filterTest("query-nickname", "ContactCard/query filter nickname", { nickname: "CJ" }, "carol", "alice"),
  filterTest("query-organization", "ContactCard/query filter organization", { organization: "Acme" }, "alice", "bob"),
  filterTest("query-email", "ContactCard/query filter email", { email: "alice@work.example.com" }, "alice", "bob"),
  filterTest("query-phone", "ContactCard/query filter phone", { phone: "555-0100" }, "alice", "bob"),
  filterTest("query-online-service", "ContactCard/query filter onlineService", { onlineService: "Mastodon" }, "alice", "bob"),
  filterTest("query-address", "ContactCard/query filter address", { address: "Springfield" }, "bob", "alice"),
  filterTest("query-note", "ContactCard/query filter note", { note: "interop" }, "carol", "alice"),

  {
    id: "query-created-before",
    name: "ContactCard/query filter createdBefore",
    runIf: needsTimestamps,
    fn: async (ctx) => {
      const { ids } = await query(ctx, { filter: { createdBefore: ctx.contactCardMeta["bob"].created } });
      ctx.assertIncludes(ids, ctx.contactCardIds["alice"], "alice created before bob");
      ctx.assertNotIncludes(ids, ctx.contactCardIds["bob"], "bob not strictly before its own created");
    },
  },
  {
    id: "query-created-after",
    name: "ContactCard/query filter createdAfter",
    runIf: needsTimestamps,
    fn: async (ctx) => {
      const { ids } = await query(ctx, { filter: { createdAfter: ctx.contactCardMeta["bob"].created } });
      ctx.assertIncludes(ids, ctx.contactCardIds["bob"], "bob is same-or-after its own created");
      ctx.assertNotIncludes(ids, ctx.contactCardIds["alice"], "alice created before bob");
    },
  },
  {
    id: "query-updated-before",
    name: "ContactCard/query filter updatedBefore",
    runIf: needsTimestamps,
    fn: async (ctx) => {
      const { ids } = await query(ctx, { filter: { updatedBefore: ctx.contactCardMeta["bob"].updated } });
      ctx.assertIncludes(ids, ctx.contactCardIds["alice"]);
      ctx.assertNotIncludes(ids, ctx.contactCardIds["bob"]);
    },
  },
  {
    id: "query-updated-after",
    name: "ContactCard/query filter updatedAfter",
    runIf: needsTimestamps,
    fn: async (ctx) => {
      const { ids } = await query(ctx, { filter: { updatedAfter: ctx.contactCardMeta["bob"].updated } });
      ctx.assertIncludes(ids, ctx.contactCardIds["bob"]);
      ctx.assertNotIncludes(ids, ctx.contactCardIds["alice"]);
    },
  },

  // --- Combinators / semantics ---
  {
    id: "query-empty-filter",
    name: "ContactCard/query with filter={} returns all account cards (seed is a subset)",
    runIf: needsContacts,
    fn: async (ctx) => {
      const { ids } = await query(ctx, { filter: {} });
      for (const key of ["alice", "bob", "carol", "dave", "team", "minimal"]) {
        ctx.assertIncludes(ids, ctx.contactCardIds[key], `${key} must be in the unfiltered result`);
      }
    },
  },
  {
    id: "query-omitted-filter",
    name: "ContactCard/query with no filter returns all account cards",
    runIf: needsContacts,
    fn: async (ctx) => {
      const { ids } = await query(ctx, {});
      ctx.assertIncludes(ids, ctx.contactCardIds["alice"]);
      ctx.assertIncludes(ids, ctx.contactCardIds["bob"]);
    },
  },
  {
    id: "query-implicit-and",
    name: "ContactCard/query ANDs conditions within one FilterCondition",
    runIf: needsContacts,
    fn: async (ctx) => {
      const { ids } = await query(ctx, { filter: { kind: "individual", "name/given": "Alice" } });
      ctx.assertIncludes(ids, ctx.contactCardIds["alice"]);
      ctx.assertNotIncludes(ids, ctx.contactCardIds["team"]);
    },
  },
  {
    id: "query-operator-or",
    name: "ContactCard/query supports the OR FilterOperator",
    required: false,
    runIf: needsContacts,
    fn: async (ctx) => {
      const { ids } = await query(ctx, {
        filter: { operator: "OR", conditions: [{ uid: "urn:example:contacts:alice" }, { uid: "urn:example:contacts:bob" }] },
      });
      ctx.assertIncludes(ids, ctx.contactCardIds["alice"]);
      ctx.assertIncludes(ids, ctx.contactCardIds["bob"]);
      ctx.assertNotIncludes(ids, ctx.contactCardIds["carol"]);
    },
  },
  {
    id: "query-text-phrase-vs-token",
    name: "ContactCard/query text: token (all present) and quoted phrase both match",
    runIf: needsContacts,
    fn: async (ctx) => {
      const tokens = await query(ctx, { filter: { text: "Alice Anderson" } });
      ctx.assertIncludes(tokens.ids, ctx.contactCardIds["alice"], "both tokens present");
      const phrase = await query(ctx, { filter: { text: '"Alice Anderson"' } });
      ctx.assertIncludes(phrase.ids, ctx.contactCardIds["alice"], "exact phrase present");
    },
  },
  {
    id: "query-text-case-insensitive",
    name: "ContactCard/query text matching is case-insensitive",
    runIf: needsContacts,
    fn: async (ctx) => {
      const { ids } = await query(ctx, { filter: { text: "anderson" } });
      ctx.assertIncludes(ids, ctx.contactCardIds["alice"]);
    },
  },

  // --- Sort ---
  {
    id: "query-sort-created",
    name: "ContactCard/query sorts by created (MUST)",
    runIf: needsTimestamps,
    fn: async (ctx) => {
      const asc = await query(ctx, { sort: [{ property: "created", isAscending: true }] });
      const desc = await query(ctx, { sort: [{ property: "created", isAscending: false }] });
      // alice was seeded first, minimal last — alice precedes bob ascending.
      const iA = asc.ids.indexOf(ctx.contactCardIds["alice"]);
      const iB = asc.ids.indexOf(ctx.contactCardIds["bob"]);
      ctx.assert(iA >= 0 && iB >= 0 && iA < iB, "ascending created: alice before bob");
      const jA = desc.ids.indexOf(ctx.contactCardIds["alice"]);
      const jB = desc.ids.indexOf(ctx.contactCardIds["bob"]);
      ctx.assert(jA >= 0 && jB >= 0 && jB < jA, "descending created: bob before alice");
    },
  },
  {
    id: "query-sort-updated",
    name: "ContactCard/query sorts by updated (MUST)",
    runIf: needsTimestamps,
    fn: async (ctx) => {
      const asc = await query(ctx, { sort: [{ property: "updated", isAscending: true }] });
      const iA = asc.ids.indexOf(ctx.contactCardIds["alice"]);
      const iB = asc.ids.indexOf(ctx.contactCardIds["bob"]);
      ctx.assert(iA >= 0 && iB >= 0 && iA < iB, "ascending updated: alice before bob");
    },
  },
  {
    id: "query-sort-name-given",
    name: "ContactCard/query sorts by name/given (SHOULD)",
    required: false,
    runIf: needsContacts,
    fn: async (ctx) => {
      const { ids } = await query(ctx, { sort: [{ property: "name/given", isAscending: true }] });
      // Alice < Bob < Carol < Dave by given name.
      const iAlice = ids.indexOf(ctx.contactCardIds["alice"]);
      const iCarol = ids.indexOf(ctx.contactCardIds["carol"]);
      ctx.assert(iAlice >= 0 && iCarol >= 0 && iAlice < iCarol, "Alice before Carol by given name");
    },
  },
  {
    id: "query-sort-name-surname",
    name: "ContactCard/query sorts by name/surname (SHOULD)",
    required: false,
    runIf: needsContacts,
    fn: async (ctx) => {
      const { ids } = await query(ctx, { sort: [{ property: "name/surname", isAscending: true }] });
      // Anderson < Baker < Jones.
      const iAnderson = ids.indexOf(ctx.contactCardIds["alice"]);
      const iJones = ids.indexOf(ctx.contactCardIds["carol"]);
      ctx.assert(iAnderson >= 0 && iJones >= 0 && iAnderson < iJones, "Anderson before Jones by surname");
    },
  },
  {
    id: "query-sort-name-surname2",
    name: "ContactCard/query sorts by name/surname2 (SHOULD)",
    required: false,
    runIf: needsContacts,
    fn: async (ctx) => {
      // Only asserts the sort is accepted and returns a well-formed id list.
      const { ids } = await query(ctx, { sort: [{ property: "name/surname2", isAscending: true }] });
      ctx.assert(Array.isArray(ids), "ids must be an array");
    },
  },

  // --- Paging ---
  {
    id: "query-paging-limit",
    name: "ContactCard/query honors limit and position",
    runIf: needsContacts,
    fn: async (ctx) => {
      const r = await ctx.client.call("ContactCard/query", {
        accountId: ctx.contactsAccountId!,
        filter: {},
        limit: 2,
      });
      const ids = r.ids as string[];
      ctx.assertLessThan(ids.length, 3, "limit=2 returns at most 2 ids");
      ctx.assertType(r.position, "number");
      ctx.assertType(r.queryState, "string");
    },
  },
  {
    id: "query-calculate-total",
    name: "ContactCard/query returns total when calculateTotal is set",
    runIf: needsContacts,
    fn: async (ctx) => {
      const r = await ctx.client.call("ContactCard/query", {
        accountId: ctx.contactsAccountId!,
        filter: {},
        limit: 1,
        calculateTotal: true,
      });
      ctx.assertType(r.total, "number");
      ctx.assertGreaterOrEqual(r.total as number, 6, "at least the six seeded cards");
    },
  },
]);
