import { defineTests } from "../../runner/test-registry.js";
import { needsContacts } from "./_capability.js";
import { buildCard } from "../../setup/seed-contacts.js";
import type { TestContext } from "../../runner/test-context.js";

// RFC 9610 §3.5 ContactCard/set — update (RFC 8620 §5.3 PatchObject semantics).
// Each test creates its own card and destroys it in finally.

async function createCard(ctx: TestContext, uid: string, book?: string): Promise<string> {
  const res = await ctx.client.call("ContactCard/set", {
    accountId: ctx.contactsAccountId!,
    create: {
      c: {
        ...buildCard({ uid, given: "Patch", surname: "Target", full: "Patch Target" }),
        addressBookIds: { [book ?? ctx.addressBookIds["bookMain"]]: true },
      },
    },
  });
  return (res.created as Record<string, { id: string }>).c.id;
}

async function getCard(ctx: TestContext, id: string): Promise<Record<string, unknown>> {
  const get = await ctx.client.call("ContactCard/get", { accountId: ctx.contactsAccountId!, ids: [id] });
  return (get.list as Array<Record<string, unknown>>)[0];
}

async function destroy(ctx: TestContext, id: string): Promise<void> {
  await ctx.client.call("ContactCard/set", { accountId: ctx.contactsAccountId!, destroy: [id] });
}

defineTests({ rfc: "RFC9610", section: "3.5", category: "contacts" }, [
  {
    id: "set-update-patch-name",
    name: "ContactCard/set update patches a scalar via JSON pointer (name/full)",
    runIf: needsContacts,
    fn: async (ctx) => {
      const id = await createCard(ctx, "urn:example:contacts:update-name");
      try {
        await ctx.client.call("ContactCard/set", {
          accountId: ctx.contactsAccountId!,
          update: { [id]: { "name/full": "Patched Full Name" } },
        });
        const card = await getCard(ctx, id);
        const name = card.name as { full?: string };
        ctx.assertEqual(name.full, "Patched Full Name");
      } finally {
        await destroy(ctx, id);
      }
    },
  },
  {
    id: "set-update-add-email",
    name: "ContactCard/set update adds a map entry via JSON pointer (emails/*)",
    runIf: needsContacts,
    fn: async (ctx) => {
      const id = await createCard(ctx, "urn:example:contacts:update-email");
      try {
        await ctx.client.call("ContactCard/set", {
          accountId: ctx.contactsAccountId!,
          update: { [id]: { "emails/added": { "@type": "EmailAddress", address: "added@example.com" } } },
        });
        const card = await getCard(ctx, id);
        const emails = card.emails as Record<string, { address?: string }> | undefined;
        ctx.assertTruthy(emails, "emails must exist after patch");
        ctx.assert(
          Object.values(emails!).some((e) => e.address === "added@example.com"),
          "added email must be present"
        );
      } finally {
        await destroy(ctx, id);
      }
    },
  },
  {
    id: "set-update-move-address-book",
    name: "ContactCard/set update moves a card between address books",
    runIf: needsContacts,
    fn: async (ctx) => {
      const id = await createCard(ctx, "urn:example:contacts:update-move");
      const other = ctx.addressBookIds["bookOther"];
      try {
        await ctx.client.call("ContactCard/set", {
          accountId: ctx.contactsAccountId!,
          update: { [id]: { addressBookIds: { [other]: true } } },
        });
        const card = await getCard(ctx, id);
        const abids = card.addressBookIds as Record<string, boolean>;
        ctx.assertEqual(abids[other], true, "card must now be in bookOther");
        ctx.assert(!(ctx.addressBookIds["bookMain"] in abids), "card must no longer be in bookMain");
      } finally {
        await destroy(ctx, id);
      }
    },
  },
  {
    id: "set-update-empty-addressbookids-rejected",
    name: "ContactCard/set update rejects emptying addressBookIds",
    runIf: needsContacts,
    fn: async (ctx) => {
      const id = await createCard(ctx, "urn:example:contacts:update-noabid");
      try {
        const res = await ctx.client.call("ContactCard/set", {
          accountId: ctx.contactsAccountId!,
          update: { [id]: { addressBookIds: {} } },
        });
        const notUpdated = res.notUpdated as Record<string, { type: string }> | null;
        ctx.assertTruthy(notUpdated?.[id], "emptying addressBookIds must be rejected");
      } finally {
        await destroy(ctx, id);
      }
    },
  },
  {
    id: "set-update-not-found",
    name: "ContactCard/set update of an unknown id returns notUpdated",
    runIf: needsContacts,
    fn: async (ctx) => {
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        update: { "nonexistent-card-xyz": { "name/full": "X" } },
      });
      const notUpdated = res.notUpdated as Record<string, { type: string }> | null;
      ctx.assertTruthy(notUpdated?.["nonexistent-card-xyz"], "unknown id must appear in notUpdated");
      ctx.assertEqual(notUpdated!["nonexistent-card-xyz"].type, "notFound");
    },
  },
]);
