import { defineTests } from "../../runner/test-registry.js";
import { JmapMethodError } from "../../client/jmap-client.js";
import { needsContacts } from "../contacts/_capability.js";
import { buildCard } from "../../setup/seed-contacts.js";

// RFC 9610 §2.3 AddressBook/set. Set tests create/destroy their own books.
// The destructive edges (addressBookHasContents, onDestroyRemoveContents) create
// their OWN disposable book AND card and never touch the seeded books.

defineTests({ rfc: "RFC9610", section: "2.3", category: "addressbook" }, [
  {
    id: "set-create-basic",
    name: "AddressBook/set creates a book and returns server-set id",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        create: { b: { name: "Create Basic Book" } },
      });
      const created = result.created as Record<string, { id: string }>;
      ctx.assertTruthy(created?.b?.id, "server must assign an id");
      ctx.assertTruthy(result.oldState);
      ctx.assertNotEqual(result.oldState, result.newState);
      await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        destroy: [created.b.id],
      });
    },
  },
  {
    id: "set-create-defaults",
    name: "AddressBook/set create applies default sortOrder=0 and description=null",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        create: { b: { name: "Defaults Book" } },
      });
      const id = (result.created as Record<string, { id: string }>).b.id;
      try {
        const get = await ctx.client.call("AddressBook/get", {
          accountId: ctx.contactsAccountId!,
          ids: [id],
        });
        const book = (get.list as Array<Record<string, unknown>>)[0];
        ctx.assertEqual(book.sortOrder, 0, "sortOrder must default to 0");
        ctx.assertEqual(book.description, null, "description must default to null");
      } finally {
        await ctx.client.call("AddressBook/set", {
          accountId: ctx.contactsAccountId!,
          destroy: [id],
        });
      }
    },
  },
  {
    id: "set-create-empty-name-rejected",
    name: "AddressBook/set rejects an empty name",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        create: { b: { name: "" } },
      });
      const notCreated = result.notCreated as Record<string, { type: string }> | null;
      ctx.assertTruthy(notCreated?.b, "empty name must be rejected in notCreated");
      // Clean up if the server erroneously created it anyway.
      const created = result.created as Record<string, { id: string }> | null;
      if (created?.b) {
        await ctx.client.call("AddressBook/set", {
          accountId: ctx.contactsAccountId!,
          destroy: [created.b.id],
        });
      }
    },
  },
  {
    id: "set-create-overlong-name-rejected",
    name: "AddressBook/set rejects a name over 255 octets",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        create: { b: { name: "x".repeat(256) } },
      });
      const notCreated = result.notCreated as Record<string, { type: string }> | null;
      ctx.assertTruthy(notCreated?.b, "name > 255 octets must be rejected (RFC 9610 §2)");
      const created = result.created as Record<string, { id: string }> | null;
      if (created?.b) {
        await ctx.client.call("AddressBook/set", {
          accountId: ctx.contactsAccountId!,
          destroy: [created.b.id],
        });
      }
    },
  },
  {
    id: "set-create-server-set-props-rejected",
    name: "AddressBook/set rejects client-supplied server-set properties",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        create: {
          b: {
            name: "Server-set Props Book",
            id: "client-chosen-id",
            isDefault: true,
            myRights: { mayRead: true, mayWrite: true, mayShare: true, mayDelete: true },
          },
        },
      });
      const notCreated = result.notCreated as Record<string, { type: string; properties?: string[] }> | null;
      ctx.assertTruthy(
        notCreated?.b,
        "supplying server-set props (id/isDefault/myRights) must be rejected with invalidProperties"
      );
      const created = result.created as Record<string, { id: string }> | null;
      if (created?.b) {
        await ctx.client.call("AddressBook/set", {
          accountId: ctx.contactsAccountId!,
          destroy: [created.b.id],
        });
      }
    },
  },
  {
    id: "set-update-rename-and-sortorder",
    name: "AddressBook/set updates name and sortOrder",
    runIf: needsContacts,
    fn: async (ctx) => {
      const create = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        create: { b: { name: "Rename Before", sortOrder: 5 } },
      });
      const id = (create.created as Record<string, { id: string }>).b.id;
      try {
        await ctx.client.call("AddressBook/set", {
          accountId: ctx.contactsAccountId!,
          update: { [id]: { name: "Rename After", sortOrder: 42 } },
        });
        const get = await ctx.client.call("AddressBook/get", {
          accountId: ctx.contactsAccountId!,
          ids: [id],
        });
        const book = (get.list as Array<Record<string, unknown>>)[0];
        ctx.assertEqual(book.name, "Rename After");
        ctx.assertEqual(book.sortOrder, 42);
      } finally {
        await ctx.client.call("AddressBook/set", {
          accountId: ctx.contactsAccountId!,
          destroy: [id],
        });
      }
    },
  },
  {
    id: "set-destroy-empty",
    name: "AddressBook/set destroys an empty book",
    runIf: needsContacts,
    fn: async (ctx) => {
      const create = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        create: { b: { name: "Destroy Empty Book" } },
      });
      const id = (create.created as Record<string, { id: string }>).b.id;
      const destroy = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        destroy: [id],
      });
      ctx.assert(Array.isArray(destroy.destroyed), "destroyed must be an array");
      ctx.assertIncludes(destroy.destroyed as string[], id);
    },
  },
  {
    id: "set-destroy-not-found",
    name: "AddressBook/set returns notDestroyed for an unknown id",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/set", {
        accountId: ctx.contactsAccountId!,
        destroy: ["nonexistent-book-xyz"],
      });
      const notDestroyed = result.notDestroyed as Record<string, { type: string }> | null;
      ctx.assertTruthy(notDestroyed?.["nonexistent-book-xyz"], "unknown destroy must appear in notDestroyed");
      ctx.assertEqual(notDestroyed!["nonexistent-book-xyz"].type, "notFound");
    },
  },
  {
    id: "set-destroy-non-empty-rejected",
    name: "AddressBook/set destroy of a non-empty book without onDestroyRemoveContents is rejected (addressBookHasContents)",
    runIf: needsContacts,
    fn: async (ctx) => {
      // Own disposable book + card — never a seeded book.
      const acct = ctx.contactsAccountId!;
      const bookRes = await ctx.client.call("AddressBook/set", {
        accountId: acct,
        create: { b: { name: "Non-empty Destroy Book" } },
      });
      const bookId = (bookRes.created as Record<string, { id: string }>).b.id;
      const cardRes = await ctx.client.call("ContactCard/set", {
        accountId: acct,
        create: {
          c: { ...buildCard({ uid: "urn:example:contacts:ab-hascontents" }), addressBookIds: { [bookId]: true } },
        },
      });
      const cardId = (cardRes.created as Record<string, { id: string }> | null)?.c?.id;
      try {
        const destroy = await ctx.client.call("AddressBook/set", {
          accountId: acct,
          destroy: [bookId],
          onDestroyRemoveContents: false,
        });
        const notDestroyed = destroy.notDestroyed as Record<string, { type: string }> | null;
        ctx.assertTruthy(notDestroyed?.[bookId], "non-empty book destroy must be rejected");
        ctx.assertEqual(notDestroyed![bookId].type, "addressBookHasContents");
      } finally {
        // Remove contents then the book.
        if (cardId) {
          await ctx.client.call("ContactCard/set", { accountId: acct, destroy: [cardId] });
        }
        await ctx.client.call("AddressBook/set", {
          accountId: acct,
          destroy: [bookId],
          onDestroyRemoveContents: true,
        });
      }
    },
  },
  {
    id: "set-destroy-on-destroy-remove-contents",
    name: "AddressBook/set destroy with onDestroyRemoveContents removes the book and its cards",
    runIf: needsContacts,
    fn: async (ctx) => {
      const acct = ctx.contactsAccountId!;
      const bookRes = await ctx.client.call("AddressBook/set", {
        accountId: acct,
        create: { b: { name: "RemoveContents Book" } },
      });
      const bookId = (bookRes.created as Record<string, { id: string }>).b.id;
      const cardRes = await ctx.client.call("ContactCard/set", {
        accountId: acct,
        create: {
          c: { ...buildCard({ uid: "urn:example:contacts:ab-removecontents" }), addressBookIds: { [bookId]: true } },
        },
      });
      const cardId = (cardRes.created as Record<string, { id: string }> | null)?.c?.id;

      const destroy = await ctx.client.call("AddressBook/set", {
        accountId: acct,
        destroy: [bookId],
        onDestroyRemoveContents: true,
      });
      ctx.assertIncludes(destroy.destroyed as string[], bookId);

      if (cardId) {
        // The card belonged only to this book, so it must be gone.
        const get = await ctx.client.call("ContactCard/get", {
          accountId: acct,
          ids: [cardId],
          properties: ["id"],
        });
        ctx.assertLength(get.list as unknown[], 0, "card in a removed book must be destroyed");
        ctx.assertIncludes(get.notFound as string[], cardId);
      }
    },
  },
  {
    id: "set-on-success-set-is-default",
    name: "AddressBook/set onSuccessSetIsDefault makes a book the default",
    required: false,
    runIf: needsContacts,
    fn: async (ctx) => {
      // Server support for changing the default is optional — WARN, not required.
      const acct = ctx.contactsAccountId!;
      const create = await ctx.client.call("AddressBook/set", {
        accountId: acct,
        create: { b: { name: "Become Default Book" } },
        onSuccessSetIsDefault: "#b",
      });
      const id = (create.created as Record<string, { id: string }> | null)?.b?.id;
      ctx.assertTruthy(id, "book must be created");
      try {
        const get = await ctx.client.call("AddressBook/get", {
          accountId: acct,
          ids: [id!],
        });
        const book = (get.list as Array<Record<string, unknown>>)[0];
        ctx.assertEqual(book.isDefault, true, "named book should become the default");
      } finally {
        // Cannot destroy the default book; another book must be default first.
        // Best-effort cleanup — teardown force-clean will catch it otherwise.
        try {
          await ctx.client.call("AddressBook/set", { accountId: acct, destroy: [id!] });
        } catch {
          /* ignore — leaves cleanup to teardown */
        }
      }
    },
  },
  {
    id: "no-query-method",
    name: "AddressBook/query is not defined and returns unknownMethod",
    runIf: needsContacts,
    fn: async (ctx) => {
      try {
        await ctx.client.call("AddressBook/query", {
          accountId: ctx.contactsAccountId!,
        });
        ctx.assert(false, "AddressBook/query must not be a defined method");
      } catch (err) {
        if (!(err instanceof JmapMethodError)) throw err;
        ctx.assertEqual(err.type, "unknownMethod");
      }
    },
  },
]);
