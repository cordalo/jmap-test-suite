import { defineTests } from "../../runner/test-registry.js";
import { needsContacts } from "./_capability.js";
import { buildCard } from "../../setup/seed-contacts.js";

// RFC 9610 §3.5 ContactCard/set — destroy.

defineTests({ rfc: "RFC9610", section: "3.5", category: "contacts" }, [
  {
    id: "set-destroy",
    name: "ContactCard/set destroys a card",
    runIf: needsContacts,
    fn: async (ctx) => {
      const create = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        create: {
          c: { ...buildCard({ uid: "urn:example:contacts:destroy-me" }), addressBookIds: { [ctx.addressBookIds["bookMain"]]: true } },
        },
      });
      const id = (create.created as Record<string, { id: string }>).c.id;

      const destroy = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        destroy: [id],
      });
      ctx.assert(Array.isArray(destroy.destroyed), "destroyed must be an array");
      ctx.assertIncludes(destroy.destroyed as string[], id);

      // A second get must report it in notFound.
      const get = await ctx.client.call("ContactCard/get", {
        accountId: ctx.contactsAccountId!,
        ids: [id],
        properties: ["id"],
      });
      ctx.assertIncludes(get.notFound as string[], id);
    },
  },
  {
    id: "set-destroy-not-found",
    name: "ContactCard/set destroy of an unknown id returns notDestroyed",
    runIf: needsContacts,
    fn: async (ctx) => {
      const res = await ctx.client.call("ContactCard/set", {
        accountId: ctx.contactsAccountId!,
        destroy: ["nonexistent-card-xyz"],
      });
      const notDestroyed = res.notDestroyed as Record<string, { type: string }> | null;
      ctx.assertTruthy(notDestroyed?.["nonexistent-card-xyz"], "unknown destroy must appear in notDestroyed");
      ctx.assertEqual(notDestroyed!["nonexistent-card-xyz"].type, "notFound");
    },
  },
]);
