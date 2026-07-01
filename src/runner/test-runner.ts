import type { TestResult } from "../types/report.js";
import type { Config } from "../types/config.js";
import { JmapClient } from "../client/jmap-client.js";
import { Transport } from "../client/transport.js";
import { TestContext } from "./test-context.js";
import { getTests, type TestDescriptor } from "./test-registry.js";
import { cleanAccount } from "../setup/clean-account.js";
import { seedData } from "../setup/seed-data.js";
import { seedContacts } from "../setup/seed-contacts.js";
import { teardown } from "../setup/teardown.js";
import { hasCapability, getAccountId, findCrossAccountId } from "../client/session.js";
import { CONTACTS_CAPABILITY } from "../types/jmap-contacts.js";
import { printProgress, printSummaryLine } from "../reporter/console-reporter.js";
import { createSmeeChannel } from "../helpers/smee.js";

export interface RunOptions {
  config: Config;
  force: boolean;
  filter?: string;
  verbose: boolean;
  failOnly?: boolean;
}

export async function runTests(options: RunOptions): Promise<TestResult[]> {
  const { config, force } = options;

  // Initialize primary client
  const transport = new Transport({
    authMethod: config.authMethod,
    account: config.users.primary,
    timeout: config.timeout,
    verbose: config.verbose,
  });

  const client = new JmapClient(transport, config.sessionUrl);
  await client.initialize();

  process.stderr.write(
    `Connected to ${config.sessionUrl}\n` +
      `Account: ${client.session.username} (${client.accountId})\n\n`
  );

  // Scan session for cross-account access (a second mail-capable account)
  let crossAccountId: string | undefined;
  const MAIL_CAP = "urn:ietf:params:jmap:mail";
  for (const [acctId, acct] of Object.entries(client.session.accounts)) {
    if (acctId !== client.accountId && MAIL_CAP in acct.accountCapabilities) {
      crossAccountId = acctId;
      break;
    }
  }

  if (crossAccountId) {
    process.stderr.write(
      `Cross-account: ${crossAccountId} (mail-capable, accessible by primary user)\n\n`
    );
  } else {
    process.stderr.write(
      "⚠ No cross-account access — primary user has only one mail account; cross-account tests will skip\n"
    );
  }

  // Resolve the contacts account (may differ from mail) and a contacts-capable
  // cross-account for ContactCard/copy. Dedicated field — NOT crossAccountId,
  // which is mail-capable and consumed by email-copy/blob-copy.
  let contactsAccountId: string | undefined;
  let contactsCrossAccountId: string | undefined;
  if (hasCapability(client.session, CONTACTS_CAPABILITY)) {
    contactsAccountId = getAccountId(client.session, CONTACTS_CAPABILITY);
    contactsCrossAccountId = findCrossAccountId(
      client.session,
      CONTACTS_CAPABILITY,
      contactsAccountId
    );
    process.stderr.write(
      `Contacts: capability present, account ${contactsAccountId}` +
        (contactsCrossAccountId
          ? `, cross-account ${contactsCrossAccountId} (ContactCard/copy)\n`
          : ` (no contacts cross-account — ContactCard/copy will skip)\n`)
    );
  } else {
    process.stderr.write(
      "⚠ No contacts capability — AddressBook/ContactCard tests will skip\n"
    );
  }

  // Initialize secondary client if configured
  let secondaryClient: JmapClient | undefined;
  if (config.users.secondary) {
    const secondaryTransport = new Transport({
      authMethod: config.authMethod,
      account: config.users.secondary,
      timeout: config.timeout,
      verbose: config.verbose,
    });
    secondaryClient = new JmapClient(secondaryTransport, config.sessionUrl);
    await secondaryClient.initialize();
    process.stderr.write(
      `Secondary user: ${secondaryClient.session.username} (${secondaryClient.accountId})\n\n`
    );
  }

  // Set up smee.io channel for push subscription tests
  process.stderr.write("Connecting to smee.io for push subscription tests...\n");
  const smeeChannel = await createSmeeChannel();
  if (smeeChannel) {
    process.stderr.write(`Smee channel: ${smeeChannel.url}\n\n`);
  } else {
    process.stderr.write(
      "⚠ Could not reach smee.io — push subscription callback tests will skip\n\n"
    );
  }

  // Build skip categories
  const skipCategories: string[] = [];
  if (!config.users.secondary) {
    skipCategories.push("submission");
    process.stderr.write(
      "⚠ No secondary user configured — skipping EmailSubmission tests\n"
    );
  }

  // Get tests to run
  const allTests = getTests({
    filter: options.filter,
    skipCategories,
  });

  const ctx = new TestContext(client, config);
  if (crossAccountId) {
    ctx.crossAccountId = crossAccountId;
  }
  if (secondaryClient) {
    ctx.secondaryClient = secondaryClient;
  }
  if (smeeChannel) {
    ctx.smeeChannel = smeeChannel;
  }
  if (contactsAccountId) {
    ctx.contactsAccountId = contactsAccountId;
  }
  if (contactsCrossAccountId) {
    ctx.contactsCrossAccountId = contactsCrossAccountId;
  }

  // Clean account
  process.stderr.write("\n--- Cleaning account ---\n");
  await cleanAccount(ctx, force);

  // Seed test data
  process.stderr.write("\n--- Seeding test data ---\n");
  await seedData(ctx);
  await seedContacts(ctx);

  // Run tests
  process.stderr.write(`\n--- Running ${allTests.length} tests ---\n\n`);

  // Drain any exchanges from setup so they don't leak into first test
  ctx.drainExchanges();

  const results: TestResult[] = [];

  for (let i = 0; i < allTests.length; i++) {
    const test = allTests[i];
    const start = performance.now();

    let result: TestResult;

    // Check precondition
    const skipReason = test.runIf ? test.runIf(ctx) : true;
    if (skipReason !== true) {
      const durationMs = Math.round(performance.now() - start);
      result = {
        testId: test.testId,
        name: test.name,
        rfc: test.rfc,
        section: test.section,
        required: test.required,
        status: "skip",
        durationMs,
        error: skipReason,
      };
    } else {
      try {
        await test.fn(ctx);
        const durationMs = Math.round(performance.now() - start);
        result = {
          testId: test.testId,
          name: test.name,
          rfc: test.rfc,
          section: test.section,
          required: test.required,
          status: "pass",
          durationMs,
        };
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        const error =
          err instanceof Error ? err.message : String(err);
        result = {
          testId: test.testId,
          name: test.name,
          rfc: test.rfc,
          section: test.section,
          required: test.required,
          status: "fail",
          durationMs,
          error,
        };
      }
    }

    // Drain recorded HTTP exchanges from clients
    const exchanges = ctx.drainExchanges();
    if (exchanges.length > 0) {
      result.exchanges = exchanges;
    }

    results.push(result);
    printProgress(i + 1, allTests.length, result, options.failOnly);
  }

  // Guard (review B2): a contacts-capable server must actually EXECUTE the
  // contacts surface. If the capability is present but every registered contacts
  // test skipped, a green run would be indistinguishable from an account/
  // capability/`using` misconfig — so fail the run explicitly.
  const contactsResults = results.filter(
    (r) => r.testId.startsWith("contacts/") || r.testId.startsWith("addressbook/")
  );
  if (ctx.contactsAccountId && contactsResults.length > 0) {
    const executed = contactsResults.filter((r) => r.status !== "skip").length;
    if (executed === 0) {
      process.stderr.write(
        `\n✗ Contacts capability present but all ${contactsResults.length} contacts tests skipped — failing the run.\n`
      );
      results.push({
        testId: "contacts/_executed-guard",
        name: "Contacts surface must execute against a contacts-capable server",
        rfc: "RFC9610",
        section: "runner",
        required: true,
        status: "fail",
        durationMs: 0,
        error:
          `Server advertises ${CONTACTS_CAPABILITY} but all ${contactsResults.length} contacts/addressbook ` +
          `tests skipped — likely a contacts account / capability / \`using\` misconfiguration.`,
      });
    }
  }

  // Teardown
  process.stderr.write("\n\n--- Tearing down ---\n");
  try {
    await teardown(ctx);
  } catch (err) {
    process.stderr.write(
      `Warning: teardown error: ${err instanceof Error ? err.message : err}\n`
    );
  }

  // Close smee channel
  smeeChannel?.close();

  printSummaryLine(results);
  return results;
}
