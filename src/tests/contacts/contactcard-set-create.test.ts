import { defineTests } from "../../runner/test-registry.js";
import { needsContacts } from "./_capability.js";
import { assertValidCard, assertValidMembership } from "./_card.js";
import { buildCard } from "../../setup/seed-contacts.js";
import type { TestContext } from "../../runner/test-context.js";

// RFC 9610 §3.5 ContactCard/set — create. Cards are created and destroyed within
// each test. addressBookIds uses the seeded bookMain.

function inBookMain(ctx: TestContext, card: Record<string, unknown>): Record<string, unknown> {
  return { ...card, addressBookIds: { [ctx.addressBookIds["bookMain"]]: true } };
}

async function destroy(ctx: TestContext, id: string | undefined): Promise<void> {
  if (!id) return;
  await ctx.client.call("ContactCard/set", { accountId: ctx.contactsAccountId!, destroy: [id] });
}

defineTests({ rfc: "RFC9610", section: "3.5", category: "contacts" }, [
  {
    id: "set-create-minimal",
    name: "ContactCard/set creates a minimal valid Card",
    runIf: needsContacts,
    fn: async (ctx) => {
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: { c: inBookMain(ctx, buildCard({ uid: "urn:example:contacts:create-minimal" })) },
      });
      const created = (res.created as Record<string, Record<string, unknown>> | null)?.c;
      ctx.assertTruthy(created, "minimal card must be created");
      ctx.assertIdValid(created!.id as string);
      await destroy(ctx, created!.id as string);
    },
  },
  {
    id: "set-create-rich-roundtrip",
    name: "ContactCard/set creates a rich Card that round-trips on get",
    runIf: needsContacts,
    fn: async (ctx) => {
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: {
          c: inBookMain(
            ctx,
            buildCard({
              uid: "urn:example:contacts:create-rich",
              kind: "individual",
              full: "Rich Contact",
              given: "Rich",
              surname: "Contact",
              emails: [{ address: "rich@example.com", contexts: ["work"], pref: 1 }],
              phones: [{ number: "tel:+1-555-0199", features: ["voice"] }],
              addresses: [{ full: "1 Test Way", locality: "Testville", countryCode: "US" }],
              organizations: [{ name: "TestCorp" }],
            })
          ),
        },
      });
      const id = (res.created as Record<string, { id: string }> | null)?.c?.id;
      ctx.assertTruthy(id, "rich card must be created");
      try {
        const get = await ctx.client.call("ContactCard/get", {
          accountId: ctx.contactsAccountId!,
          ids: [id!],
        });
        const card = (get.list as Array<Record<string, unknown>>)[0];
        assertValidCard(ctx, card);
        assertValidMembership(ctx, card);
        ctx.assertTruthy(card.emails, "emails round-trip");
        ctx.assertTruthy(card.phones, "phones round-trip");
      } finally {
        await destroy(ctx, id!);
      }
    },
  },
  {
    id: "set-create-group",
    name: "ContactCard/set creates a group Card with members",
    runIf: needsContacts,
    fn: async (ctx) => {
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: {
          c: inBookMain(ctx, buildCard({ uid: "urn:example:contacts:create-group", kind: "group", members: ["urn:example:contacts:alice"] })),
        },
      });
      const id = (res.created as Record<string, { id: string }> | null)?.c?.id;
      ctx.assertTruthy(id, "group card must be created");
      await destroy(ctx, id!);
    },
  },
  {
    id: "set-create-empty-addressbookids-rejected",
    name: "ContactCard/set rejects an empty addressBookIds map",
    runIf: needsContacts,
    fn: async (ctx) => {
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: { c: { ...buildCard({ uid: "urn:example:contacts:create-noabid" }), addressBookIds: {} } },
      });
      const notCreated = res.notCreated as Record<string, { type: string }> | null;
      ctx.assertTruthy(notCreated?.c, "a card must belong to at least one address book");
      await destroy(ctx, (res.created as Record<string, { id: string }> | null)?.c?.id);
    },
  },
  {
    id: "set-create-false-addressbookid-rejected",
    name: "ContactCard/set rejects an addressBookIds value that is not true",
    runIf: needsContacts,
    fn: async (ctx) => {
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: { c: { ...buildCard({ uid: "urn:example:contacts:create-falseabid" }), addressBookIds: { [ctx.addressBookIds["bookMain"]]: false } } },
      });
      const notCreated = res.notCreated as Record<string, { type: string }> | null;
      ctx.assertTruthy(notCreated?.c, "addressBookIds values must all be true (RFC 9610 §3)");
      await destroy(ctx, (res.created as Record<string, { id: string }> | null)?.c?.id);
    },
  },
  {
    id: "set-create-unknown-addressbookid-rejected",
    name: "ContactCard/set rejects an unknown address book id",
    runIf: needsContacts,
    fn: async (ctx) => {
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: { c: { ...buildCard({ uid: "urn:example:contacts:create-badbook" }), addressBookIds: { "no-such-book-xyz": true } } },
      });
      const notCreated = res.notCreated as Record<string, { type: string }> | null;
      ctx.assertTruthy(notCreated?.c, "an unknown address book id must be rejected");
      await destroy(ctx, (res.created as Record<string, { id: string }> | null)?.c?.id);
    },
  },
  {
    id: "set-create-missing-uid-rejected",
    name: "ContactCard/set rejects a Card missing the required uid",
    runIf: needsContacts,
    fn: async (ctx) => {
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: { c: { "@type": "Card", version: "1.0", addressBookIds: { [ctx.addressBookIds["bookMain"]]: true } } },
      });
      const notCreated = res.notCreated as Record<string, { type: string }> | null;
      ctx.assertTruthy(notCreated?.c, "a Card without uid must be rejected (RFC 9553 §2.1)");
      await destroy(ctx, (res.created as Record<string, { id: string }> | null)?.c?.id);
    },
  },
  {
    id: "set-create-invalid-kind-rejected",
    name: "ContactCard/set rejects an invalid kind value",
    runIf: needsContacts,
    fn: async (ctx) => {
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: { c: inBookMain(ctx, { ...buildCard({ uid: "urn:example:contacts:create-badkind" }), kind: "not-a-valid-kind" }) },
      });
      const notCreated = res.notCreated as Record<string, { type: string }> | null;
      ctx.assertTruthy(notCreated?.c, "an invalid kind must be rejected");
      await destroy(ctx, (res.created as Record<string, { id: string }> | null)?.c?.id);
    },
  },
  {
    id: "set-create-duplicate-uid-rejected",
    name: "ContactCard/set rejects a second card with a duplicate uid (RFC 9610 §3 MUST NOT)",
    runIf: needsContacts,
    fn: async (ctx) => {
      const uid = "urn:example:contacts:create-dupuid";
      const first = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: { a: inBookMain(ctx, buildCard({ uid })) },
      });
      const firstId = (first.created as Record<string, { id: string }> | null)?.a?.id;
      ctx.assertTruthy(firstId, "first card must be created");
      try {
        const second = await ctx.client.call("ContactCard/set", {
          accountId: ctx.contactsAccountId!,
          create: { b: inBookMain(ctx, buildCard({ uid })) },
        });
        const notCreated = second.notCreated as Record<string, { type: string }> | null;
        ctx.assertTruthy(notCreated?.b, "a duplicate uid must be rejected");
        await destroy(ctx, (second.created as Record<string, { id: string }> | null)?.b?.id);
      } finally {
        await destroy(ctx, firstId!);
      }
    },
  },
]);
