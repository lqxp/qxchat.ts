export { BaseClient } from './client/BaseClient';
export { SelfbotClient } from './client/SelfbotClient';
export { RestClient } from './client/rest/RestClient';
export { TypedEventEmitter } from './client/TypedEventEmitter';
export { WebSocketManager } from './client/gateway/WebSocketManager';
export { BaseConnection } from './client/gateway/BaseConnection';
export { PacketHandler } from './client/gateway/PacketHandler';
export { CacheManager, CacheManager as ClientCache } from './client/managers/CacheManager';

export { BaseStructure } from './structures/BaseStructure';
export { Message } from './structures/Message';
export { Room } from './structures/Room';
export { User } from './structures/User';
export type { UserData } from './structures/User';
export type { IActionClient } from './structures/IActionClient';

export { BaseBuilder } from './builders/BaseBuilder';
export { MessageBuilder } from './builders/MessageBuilder';
export type { MessagePayload } from './builders/MessageBuilder';
export { ProfileBuilder } from './builders/ProfileBuilder';
export type { ProfileImagePayload, ProfilePayload } from './builders/ProfileBuilder';
export { RoomBuilder } from './builders/RoomBuilder';
export type { RoomPayload } from './builders/RoomBuilder';
export { OpCode } from './types/gateway';
export type { GatewayPayload, IdentifyPayload, HelloPayload } from './types/gateway';

export { PresenceStatus, ClientPlatform, ProfileImageKind } from './types/options';
export type { ClientOptions } from './types/options';

export type {
  APIMessage,
  APIProfile,
  APIAttachment,
  APIRoomRecord,
  APIRoomIcon,
} from './types/api';

export { MessageKind } from './types/structures';
export type {
  EncryptedEnvelope,
  JsonWebKey,
  Attachment,
  MessageData,
  RoomData,
  Profile,
} from './types/structures';

export { Events } from './types/events';
export type { ClientEvents } from './types/events';

export {
  LIMITS,
  sanitizeAndValidateUsername,
  validateRoomId,
  validateMessageText,
  validateRoomNote,
  validateRoomTitle,
  validatePronouns,
  validateProfileDescription,
  validateAvatarSize,
  validateBannerSize,
  validateAttachmentSize,
} from './errors/limits';

export type {
  Username,
  RoomId,
  RoomTitle,
  RoomNote,
  Pronouns,
  ProfileDescription,
  MessageText,
  ValidateUsernameType,
  ValidateRoomIdType,
  ValidateRoomTitleType,
} from './errors/limits';

export {
  generateRoomAccessToken,
  parseRoomAccessToken,
  encryptRoomPayload,
  decryptRoomPayload,
} from './crypto/e2ee';

export {
  DEFAULT_WS_URL,
  DEFAULT_API_URL,
  DEFAULT_VERSION,
  SNAPSHOT_VERSION,
} from './constants';
