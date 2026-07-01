import { defineTests } from "../../runner/test-registry.js";
import { needsContacts } from "./_capability.js";
import { buildCard } from "../../setup/seed-contacts.js";
import type { TestContext } from "../../runner/test-context.js";

// RFC 9610 §3.6 ContactCard/copy (RFC 8620 §5.4). Copies from the primary contacts
// account to a second contacts-capable account. Gated on the DEDICATED contacts
// cross-account (ctx.contactsCrossAccountId), not the mail crossAccountId.

const needsContactsCrossAccount = (ctx: TestContext): true | string => {
  const gate = needsContacts(ctx);
  if (gate !== true) return gate;
  return ctx.contactsCrossAccountId ? true : "No second contacts-capable account for ContactCard/copy";
};

/** The default address book id in the given account (copy needs a destination book). */
async function defaultBook(ctx: TestContext, accountId: string): Promise<string> {
  const books = await ctx.client.call("AddressBook/get", { accountId, ids: null });
  const list = books.list as Array<{ id: string; isDefault: boolean }>;
  const def = list.find((b) => b.isDefault) ?? list[0];
  return def.id;
}

defineTests({ rfc: "RFC9610", section: "3.6", category: "contacts" }, [
  {
    id: "copy-cross-account",
    name: "ContactCard/copy copies a card into a second account as a new object",
    runIf: needsContactsCrossAccount,
    fn: async (ctx) => {
      const from = ctx.contactsAccountId!;
      const to = ctx.contactsCrossAccountId!;
      const destBook = await defaultBook(ctx, to);

      // Source card in the primary account.
      const created = await ctx.client.call("ContactCard/set", {
        accountId: from,
        create: {
          c: { ...buildCard({ uid: "urn:example:contacts:copy-src", full: "Copy Source" }), addressBookIds: { [ctx.addressBookIds["bookMain"]]: true } },
        },
      });
      const srcId = (created.created as Record<string, { id: string }>).c.id;

      let copyId: string | undefined;
      try {
        const copy = await ctx.client.call("ContactCard/copy", {
          fromAccountId: from,
          accountId: to,
          create: {
            dup: { id: srcId, addressBookIds: { [destBook]: true } },
          },
        });
        const copied = (copy.created as Record<string, { id: string }> | null)?.dup;
        ctx.assertTruthy(copied, "copy must create a destination card");
        copyId = copied!.id;
        ctx.assertNotEqual(copyId, srcId, "the copy is a distinct object");

        const get = await ctx.client.call("ContactCard/get", { accountId: to, ids: [copyId!] });
        const card = (get.list as Array<Record<string, unknown>>)[0];
        ctx.assertEqual(card.uid, "urn:example:contacts:copy-src", "copied card preserves uid/content");
      } finally {
        await ctx.client.call("ContactCard/set", { accountId: from, destroy: [srcId] });
        if (copyId) {
          await ctx.client.call("ContactCard/set", { accountId: to, destroy: [copyId] });
        }
      }
    },
  },
]);
