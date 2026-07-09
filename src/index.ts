if (typeof Bun === 'undefined' && !(typeof process !== 'undefined' && process.versions && process.versions.bun)) {
  throw new Error('QXChat.ts only supports the Bun runtime. Please run using bun.');
}

export * from '@websocket';
export { Room } from '@client/Room';
export { Message } from '@client/Message';
export * from '@builders';
export * from '@crypto';
export {
  sanitizeAndValidateUsername,
  validateRoomId,
  validateMessageText,
  validateRoomNote,
  validateRoomTitle,
  validatePronouns,
  validateProfileDescription,
  validateAvatarSize,
  validateBannerSize,
  validateAttachmentSize
} from '@errors';
export * from '@types';
