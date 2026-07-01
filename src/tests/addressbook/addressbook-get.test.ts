import { defineTests } from "../../runner/test-registry.js";
import { needsContacts } from "../contacts/_capability.js";

// RFC 9610 §2.1 AddressBook/get. Gated on the contacts capability; reads the
// seeded books (ctx.addressBookIds) plus the account's own books.

defineTests({ rfc: "RFC9610", section: "2.1", category: "addressbook" }, [
  {
    id: "get-all",
    name: "AddressBook/get with ids=null returns all address books",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/get", {
        accountId: ctx.contactsAccountId!,
        ids: null,
      });
      const list = result.list as Array<Record<string, unknown>>;
      ctx.assert(Array.isArray(list), "list must be an array");
      ctx.assertGreaterThan(list.length, 0, "expected at least one address book");
      ctx.assertType(result.state, "string");
    },
  },
  {
    id: "get-by-id",
    name: "AddressBook/get by id returns the seeded book",
    runIf: needsContacts,
    fn: async (ctx) => {
      const id = ctx.addressBookIds["bookMain"];
      ctx.assertTruthy(id, "seed must have created bookMain");
      const result = await ctx.client.call("AddressBook/get", {
        accountId: ctx.contactsAccountId!,
        ids: [id],
      });
      const list = result.list as Array<Record<string, unknown>>;
      ctx.assertLength(list, 1);
      ctx.assertEqual(list[0].id, id);
    },
  },
  {
    id: "get-required-properties",
    name: "AddressBook has all required properties with correct types",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/get", {
        accountId: ctx.contactsAccountId!,
        ids: [ctx.addressBookIds["bookMain"]],
      });
      const book = (result.list as Array<Record<string, unknown>>)[0];
      ctx.assertIdValid(book.id as string);
      ctx.assertType(book.name, "string");
      ctx.assert(
        book.description === null || typeof book.description === "string",
        "description must be null or string"
      );
      ctx.assertType(book.sortOrder, "number");
      ctx.assertType(book.isDefault, "boolean");
      ctx.assertType(book.isSubscribed, "boolean");
      const rights = book.myRights as Record<string, unknown>;
      ctx.assertTruthy(rights, "myRights must be present");
      ctx.assertType(rights.mayRead, "boolean");
      ctx.assertType(rights.mayWrite, "boolean");
      ctx.assertType(rights.mayShare, "boolean");
      ctx.assertType(rights.mayDelete, "boolean");
    },
  },
  {
    id: "get-properties-projection",
    name: "AddressBook/get honors the properties argument",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/get", {
        accountId: ctx.contactsAccountId!,
        ids: [ctx.addressBookIds["bookMain"]],
        properties: ["id", "name"],
      });
      const book = (result.list as Array<Record<string, unknown>>)[0];
      ctx.assertHasProperty(book, "name");
      ctx.assert(
        !("sortOrder" in book),
        "sortOrder must not be returned when not in requested properties"
      );
    },
  },
  {
    id: "get-not-found",
    name: "AddressBook/get returns unknown ids in notFound",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/get", {
        accountId: ctx.contactsAccountId!,
        ids: ["nonexistent-address-book-xyz"],
      });
      ctx.assert(
        Array.isArray(result.notFound),
        "notFound MUST be a String[] (RFC 8620 §5.1), got " + JSON.stringify(result.notFound)
      );
      ctx.assertIncludes(result.notFound as string[], "nonexistent-address-book-xyz");
    },
  },
  {
    id: "get-exactly-one-default",
    name: "Exactly one AddressBook is the default (isDefault=true)",
    runIf: needsContacts,
    fn: async (ctx) => {
      const result = await ctx.client.call("AddressBook/get", {
        accountId: ctx.contactsAccountId!,
        ids: null,
      });
      const list = result.list as Array<{ isDefault: boolean }>;
      const defaults = list.filter((b) => b.isDefault === true);
      ctx.assertLength(defaults, 1, "RFC 9610 §2: exactly one AddressBook must be the default");
    },
  },
]);
