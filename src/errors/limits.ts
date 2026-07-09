/**
 * Compile-time constraints and runtime validation rules for QXChat limit limits.
 */

/** Represents a tuple of a given length. */
type BuildTuple<L extends number, T extends unknown[] = []> =
  T['length'] extends L ? T : BuildTuple<L, [...T, unknown]>;

/** Checks if A <= B at compile time. Supports small numbers (<= 100). */
export type IsLessThanOrEqual<A extends number, B extends number> =
  [A] extends [never]
  ? true
  : [B] extends [never]
  ? true
  : number extends A
  ? true
  : number extends B
  ? true
  : A extends B
  ? true
  : BuildTuple<A> extends [...BuildTuple<B>, ...unknown[]]
  ? false
  : true;

/** Computes the length of a string literal. */
export type StringLength<S extends string, Acc extends unknown[] = []> =
  S extends `${string}${infer Rest}`
  ? StringLength<Rest, [...Acc, unknown]>
  : Acc['length'];

/** Validates that string length does not exceed Max. */
export type CheckMaxLength<
  S extends string,
  Max extends number,
  Name extends string = 'String',
> =
  [S] extends [never]
  ? never
  : string extends S
  ? S
  : Max extends 512 | 2000
  ? S // Skip deep recursion for large limits
  : IsLessThanOrEqual<StringLength<S>, Max> extends true
  ? S
  : { readonly error: `QXChat: ${Name} length exceeds maximum of ${Max} characters` };

/** Validates that string length is at least Min. */
export type CheckMinLength<
  S extends string,
  Min extends number,
  Name extends string = 'String',
> =
  [S] extends [never]
  ? never
  : string extends S
  ? S
  : IsLessThanOrEqual<Min, StringLength<S>> extends true
  ? S
  : { readonly error: `QXChat: ${Name} must have at least ${Min} characters` };

/** Scans string for double periods (which are invalid in usernames). */
export type CheckNoDoubleDots<S extends string> =
  S extends `${string}..${string}`
  ? { readonly error: "QXChat: Username cannot contain consecutive periods ('..')" }
  : S;

/** Verifies that a character is a valid username character (a-z, 0-9, _, .). */
type IsValidUsernameChar<C extends string> =
  C extends 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm' | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z' |
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '_' | '.'
  ? true
  : false;

/** Verifies character-by-character validation of username characters. */
export type CheckUsernameChars<S extends string> =
  S extends `${infer Head}${infer Tail}`
  ? IsValidUsernameChar<Head> extends true
  ? CheckUsernameChars<Tail>
  : { readonly error: `QXChat: Username contains invalid character '${Head}'` }
  : unknown;

/** Checks username compile-time constraints. */
export type ValidateUsernameType<S extends string> =
  CheckMinLength<S, 2, 'Username'> extends { readonly error: string }
  ? CheckMinLength<S, 2, 'Username'>
  : CheckMaxLength<S, 32, 'Username'> extends { readonly error: string }
  ? CheckMaxLength<S, 32, 'Username'>
  : CheckNoDoubleDots<S> extends { readonly error: string }
  ? CheckNoDoubleDots<S>
  : CheckUsernameChars<S> extends { readonly error: string }
  ? CheckUsernameChars<S>
  : unknown;

/** Checks Room ID compile-time bounds. */
export type ValidateRoomIdType<S extends string> =
  CheckMinLength<S, 8, 'Room ID'> extends { readonly error: string }
  ? CheckMinLength<S, 8, 'Room ID'>
  : CheckMaxLength<S, 64, 'Room ID'> extends { readonly error: string }
  ? CheckMaxLength<S, 64, 'Room ID'>
  : unknown;

/** Checks Pronouns compile-time bounds. */
export type ValidatePronounsType<S extends string> =
  CheckMaxLength<S, 24, 'Pronouns'> extends { readonly error: string }
  ? CheckMaxLength<S, 24, 'Pronouns'>
  : unknown;

/** Checks Local Room Title compile-time bounds. */
export type ValidateRoomTitleType<S extends string> =
  CheckMaxLength<S, 64, 'Room title'> extends { readonly error: string }
  ? CheckMaxLength<S, 64, 'Room title'>
  : unknown;


declare const brand: unique symbol;

export type Username = string & { readonly [brand]: 'Username' };
export type RoomId = string & { readonly [brand]: 'RoomId' };
export type RoomTitle = string & { readonly [brand]: 'RoomTitle' };
export type RoomNote = string & { readonly [brand]: 'RoomNote' };
export type Pronouns = string & { readonly [brand]: 'Pronouns' };
export type ProfileDescription = string & { readonly [brand]: 'ProfileDescription' };
export type MessageText = string & { readonly [brand]: 'MessageText' };

export const LIMITS = {
  MESSAGE_LIMIT: 2000,
  ROOM_ID_MIN_LENGTH: 8,
  ROOM_ID_MAX_LENGTH: 64,
  MAX_ROOM_NOTE_LENGTH: 512,
  MAX_LOCAL_ROOM_NAME_LENGTH: 64,
  MAX_PROFILE_PRONOUNS_LENGTH: 24,
  MAX_PROFILE_DESCRIPTION_LENGTH: 512,
  MAX_ATTACHMENT_BYTES: 25 * 1024 * 1024,      // 25 MB
  MAX_PROFILE_AVATAR_BYTES: 2 * 1024 * 1024,   // 2 MB
  MAX_PROFILE_BANNER_BYTES: 5 * 1024 * 1024,   // 5 MB
} as const;

/** Validates username at runtime. */
export function sanitizeAndValidateUsername(val: string): Username {
  const u = String(val || "").trim().toLowerCase();
  if (u.length < 2 || u.length > 32) throw new Error(`QXChat: Username must be 2 to 32 characters. Found: ${u.length}`);
  if (!/^[a-z0-9_.]+$/.test(u)) throw new Error("QXChat: Username can only use a-z, 0-9, underscore and period.");
  if (u.includes("..")) throw new Error("QXChat: Username cannot contain two consecutive periods.");
  return u as Username;
}

export function validateRoomId(val: string): RoomId {
  const id = String(val || "").trim();
  if (id.length < LIMITS.ROOM_ID_MIN_LENGTH || id.length > LIMITS.ROOM_ID_MAX_LENGTH)
    throw new Error(`QXChat: Room ID must be between ${LIMITS.ROOM_ID_MIN_LENGTH} and ${LIMITS.ROOM_ID_MAX_LENGTH} characters.`);
  return id as RoomId;
}

export function validateMessageText(val: string): MessageText {
  const txt = String(val || "");
  if (txt.length > LIMITS.MESSAGE_LIMIT) throw new Error(`QXChat: Message text exceeds maximum limit of ${LIMITS.MESSAGE_LIMIT} characters.`);
  return txt as MessageText;
}

export function validateRoomNote(val: string): RoomNote {
  const note = String(val || "").trim();
  if (note.length > LIMITS.MAX_ROOM_NOTE_LENGTH) throw new Error(`QXChat: Room note exceeds maximum limit of ${LIMITS.MAX_ROOM_NOTE_LENGTH} characters.`);
  return note as RoomNote;
}

export function validateRoomTitle(val: string): RoomTitle {
  const title = String(val || "").trim();
  if (title.length > LIMITS.MAX_LOCAL_ROOM_NAME_LENGTH) throw new Error(`QXChat: Room title exceeds maximum limit of ${LIMITS.MAX_LOCAL_ROOM_NAME_LENGTH} characters.`);
  return title as RoomTitle;
}

export function validatePronouns(val: string): Pronouns {
  const pronouns = String(val || "").trim();
  if (pronouns.length > LIMITS.MAX_PROFILE_PRONOUNS_LENGTH) throw new Error(`QXChat: Profile pronouns exceed maximum limit of ${LIMITS.MAX_PROFILE_PRONOUNS_LENGTH} characters.`);
  return pronouns as Pronouns;
}

export function validateProfileDescription(val: string): ProfileDescription {
  const desc = String(val || "").trim();
  if (desc.length > LIMITS.MAX_PROFILE_DESCRIPTION_LENGTH) throw new Error(`QXChat: Profile description exceeds maximum limit of ${LIMITS.MAX_PROFILE_DESCRIPTION_LENGTH} characters.`);
  return desc as ProfileDescription;
}

export function validateAvatarSize(cnt: number): void {
  if (cnt > LIMITS.MAX_PROFILE_AVATAR_BYTES) throw new Error(`QXChat: Avatar image size (${cnt} bytes) exceeds limit of ${LIMITS.MAX_PROFILE_AVATAR_BYTES} bytes (2MB).`);
}

export function validateBannerSize(cnt: number): void {
  if (cnt > LIMITS.MAX_PROFILE_BANNER_BYTES) throw new Error(`QXChat: Banner image size (${cnt} bytes) exceeds limit of ${LIMITS.MAX_PROFILE_BANNER_BYTES} bytes (5MB).`);
}

export function validateAttachmentSize(cnt: number): void {
  if (cnt > LIMITS.MAX_ATTACHMENT_BYTES) throw new Error(`QXChat: Attachment size (${cnt} bytes) exceeds limit of ${LIMITS.MAX_ATTACHMENT_BYTES} bytes (25MB).`);
}
