import { defineTests } from "../../runner/test-registry.js";
import { needsContacts } from "./_capability.js";
import { assertValidCard, assertValidMembership } from "./_card.js";
import { SEED_UID } from "../../setup/seed-contacts.js";

// RFC 9610 §3.1 ContactCard/get (JSContact Card body, RFC 9553). Reads the seeded
// cards (ctx.contactCardIds) written by seedContacts.

defineTests({ rfc: "RFC9610", section: "3.1", category: "contacts" }, [
  {
    id: "get-all",
    name: "ContactCard/get with ids=null returns all cards, each a valid Card",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("ContactCard/get", {
        accountId: ctx.contactsAccountId!,
        ids: null,
      });
      const list = result.list as Array<Record<string, unknown>>;
      ctx.assertGreaterThan(list.length, 0, "expected seeded cards");
      ctx.assertType(result.state, "string");
      for (const card of list) {
        assertValidCard(ctx, card);
        assertValidMembership(ctx, card);
      }
    },
  },
  {
    id: "get-by-id",
    name: "ContactCard/get by id returns the requested card",
    runIf: needsContacts,
    fn: async (ctx) => {
      const id = ctx.contactCardIds["alice"];
      ctx.assertTruthy(id, "seed must have created alice");
      const result = await ctx.client.call("ContactCard/get", {
        accountId: ctx.contactsAccountId!,
        ids: [id],
      });
      const list = result.list as Array<Record<string, unknown>>;
      ctx.assertLength(list, 1);
      ctx.assertEqual(list[0].id, id);
      ctx.assertEqual(list[0].uid, SEED_UID.alice);
    },
  },
  {
    id: "get-properties-projection",
    name: "ContactCard/get honors the properties argument",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("ContactCard/get", {
        accountId: ctx.contactsAccountId!,
        ids: [ctx.contactCardIds["alice"]],
        properties: ["uid", "emails"],
      });
      const card = (result.list as Array<Record<string, unknown>>)[0];
      ctx.assertHasProperty(card, "uid");
      ctx.assert(
        !("phones" in card),
        "phones must not be returned when only uid/emails were requested"
      );
    },
  },
  {
    id: "get-not-found",
    name: "ContactCard/get returns unknown ids in notFound",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("ContactCard/get", {
        accountId: ctx.contactsAccountId!,
        ids: ["nonexistent-card-xyz"],
      });
      ctx.assert(
        Array.isArray(result.notFound),
        "notFound MUST be a String[] (RFC 8620 §5.1), got " + JSON.stringify(result.notFound)
      );
      ctx.assertIncludes(result.notFound as string[], "nonexistent-card-xyz");
    },
  },
  {
    id: "get-addressbookids-valid",
    name: "ContactCard addressBookIds keys are valid books in the account",
    runIf: needsContacts,
    fn: async (ctx) => {
      const get = await ctx.client.call("ContactCard/get", {
        accountId: ctx.contactsAccountId!,
        ids: [ctx.contactCardIds["alice"]],
      });
      const card = (get.list as Array<Record<string, unknown>>)[0];
      assertValidMembership(ctx, card);
      const books = await ctx.client.call("AddressBook/get", {
        accountId: ctx.contactsAccountId!,
        ids: null,
      });
      const bookIds = new Set((books.list as Array<{ id: string }>).map((b) => b.id));
      for (const abid of Object.keys(card.addressBookIds as Record<string, unknown>)) {
        ctx.assert(bookIds.has(abid), `addressBookId ${abid} must be an existing book`);
      }
    },
  },
  {
    id: "get-kind-default-individual",
    name: "A card seeded without kind is individual (default)",
    runIf: needsContacts,
    fn: async (ctx) => {
      const get = await ctx.client.call("ContactCard/get", {
        accountId: ctx.contactsAccountId!,
        ids: [ctx.contactCardIds["minimal"]],
      });
      const card = (get.list as Array<Record<string, unknown>>)[0];
      assertValidCard(ctx, card);
      ctx.assert(
        card.kind === undefined || card.kind === "individual",
        `kind must default to individual, got ${JSON.stringify(card.kind)}`
      );
    },
  },
  {
    id: "get-group-members",
    name: "A group card returns kind=group with a members map",
    runIf: needsContacts,
    fn: async (ctx) => {
      const get = await ctx.client.call("ContactCard/get", {
        accountId: ctx.contactsAccountId!,
        ids: [ctx.contactCardIds["team"]],
      });
      const card = (get.list as Array<Record<string, unknown>>)[0];
      ctx.assertEqual(card.kind, "group");
      const members = card.members as Record<string, unknown> | undefined;
      ctx.assertTruthy(members, "group card must have members");
      ctx.assertEqual(members![SEED_UID.alice], true, "alice must be a member");
      ctx.assertEqual(members![SEED_UID.bob], true, "bob must be a member");
    },
  },
  {
    id: "get-subobjects-roundtrip",
    name: "Card name/email/phone/organization round-trip with required sub-properties",
    runIf: needsContacts,
    fn: async (ctx) => {
      const get = await ctx.client.call("ContactCard/get", {
        accountId: ctx.contactsAccountId!,
        ids: [ctx.contactCardIds["alice"]],
      });
      const card = (get.list as Array<Record<string, unknown>>)[0];

      const name = card.name as { full?: string; components?: Array<{ kind: string; value: string }> } | undefined;
      ctx.assertTruthy(name, "name must be present");
      ctx.assert(
        typeof name!.full === "string" || Array.isArray(name!.components),
        "name must have full or components"
      );

      const emails = card.emails as Record<string, { address?: string }> | undefined;
      ctx.assertTruthy(emails, "emails must be present");
      const email = Object.values(emails!)[0];
      ctx.assertType(email.address, "string");

      const phones = card.phones as Record<string, { number?: string }> | undefined;
      ctx.assertTruthy(phones, "phones must be present");
      ctx.assertType(Object.values(phones!)[0].number, "string");

      const orgs = card.organizations as Record<string, { name?: string; units?: unknown[] }> | undefined;
      ctx.assertTruthy(orgs, "organizations must be present");
      const org = Object.values(orgs!)[0];
      ctx.assert(
        typeof org.name === "string" || Array.isArray(org.units),
        "Organization must have at least one of name/units (RFC 9553 §2.6.1)"
      );
    },
  },
  {
    id: "get-address-roundtrip",
    name: "Card address round-trips with components or full",
    runIf: needsContacts,
    fn: async (ctx) => {
      const get = await ctx.client.call("ContactCard/get", {
        accountId: ctx.contactsAccountId!,
        ids: [ctx.contactCardIds["bob"]],
      });
      const card = (get.list as Array<Record<string, unknown>>)[0];
      const addresses = card.addresses as Record<string, { full?: string; components?: unknown[] }> | undefined;
      ctx.assertTruthy(addresses, "addresses must be present on bob");
      const addr = Object.values(addresses!)[0];
      ctx.assert(
        typeof addr.full === "string" || Array.isArray(addr.components),
        "address must have full or components"
      );
    },
  },
]);
