// RFC 9610: JMAP for Contacts, over the JSContact data model (RFC 9553).
// Type definitions and the capability constant used by the contacts tests.

import type { Id, UnsignedInt, UTCDate } from "./jmap-core.js";

/** The capability URN required in `using` for any AddressBook/* or ContactCard/* method. */
export const CONTACTS_CAPABILITY = "urn:ietf:params:jmap:contacts";

// --- Account capability object (RFC 9610) ---

export interface ContactsAccountCapability {
  maxAddressBooksPerCard: UnsignedInt | null;
  mayCreateAddressBook: boolean;
}

// --- AddressBook (RFC 9610) ---

export interface AddressBookRights {
  mayRead: boolean;
  mayWrite: boolean;
  mayShare: boolean;
  mayDelete: boolean;
}

export interface AddressBook {
  id: Id;
  name: string;
  description: string | null;
  sortOrder: UnsignedInt;
  isDefault: boolean;
  isSubscribed: boolean;
  shareWith: Record<Id, AddressBookRights> | null;
  myRights: AddressBookRights;
}

// --- ContactCard (RFC 9610 metadata over a JSContact Card, RFC 9553) ---

/**
 * A JSContact Card as returned/accepted by JMAP. Only the properties the tests
 * touch are typed explicitly; the index signature keeps it open for the rest of
 * the JSContact surface (RFC 9553) without over-modelling a data-model spec.
 */
export interface Card {
  "@type": "Card";
  version: string;
  uid: string;
  kind?: string;
  created?: UTCDate;
  updated?: UTCDate;
  name?: JSName;
  nicknames?: Record<Id, { "@type"?: "Nickname"; name: string }>;
  organizations?: Record<Id, { "@type"?: "Organization"; name?: string; units?: JSOrgUnit[] }>;
  emails?: Record<Id, JSEmail>;
  phones?: Record<Id, JSPhone>;
  onlineServices?: Record<Id, JSOnlineService>;
  addresses?: Record<Id, JSAddress>;
  notes?: Record<Id, { "@type"?: "Note"; note: string }>;
  members?: Record<string, boolean>;
  media?: Record<Id, JSMedia>;
  [key: string]: unknown;
}

/** ContactCard = the Card body plus JMAP metadata. */
export interface ContactCard extends Card {
  id: Id;
  addressBookIds: Record<Id, boolean>;
}

export interface JSName {
  "@type"?: "Name";
  full?: string;
  components?: JSNameComponent[];
  isOrdered?: boolean;
}

export interface JSNameComponent {
  "@type"?: "NameComponent";
  kind: string; // "given" | "surname" | "surname2" | "title" | ...
  value: string;
}

export interface JSOrgUnit {
  "@type"?: "OrgUnit";
  name: string;
}

export interface JSEmail {
  "@type"?: "EmailAddress";
  address: string;
  contexts?: Record<string, boolean>;
  pref?: UnsignedInt;
  label?: string;
}

export interface JSPhone {
  "@type"?: "Phone";
  number: string;
  features?: Record<string, boolean>;
  contexts?: Record<string, boolean>;
  pref?: UnsignedInt;
  label?: string;
}

export interface JSOnlineService {
  "@type"?: "OnlineService";
  service?: string;
  uri?: string;
  user?: string;
  label?: string;
}

export interface JSAddress {
  "@type"?: "Address";
  full?: string;
  components?: JSAddressComponent[];
  countryCode?: string;
  contexts?: Record<string, boolean>;
}

export interface JSAddressComponent {
  "@type"?: "AddressComponent";
  kind: string; // "name" | "locality" | "region" | "postcode" | "country" | ...
  value: string;
}

export interface JSMedia {
  "@type"?: "Media";
  kind: string; // "photo" | "logo" | "sound"
  uri?: string;
  blobId?: Id;
  mediaType?: string;
}
