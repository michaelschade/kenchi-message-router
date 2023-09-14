import { Message, MessageError } from './Message';

export default class MessageRouterError extends Error {
  public command: string;
  public details: MessageError;

  constructor(message: Message) {
    if (!message.error) {
      throw new Error(
        "Instantiating a MessageRouterError from a response that isn't actually an error"
      );
    }
    // TODO: coalesce on using .type: need .error for backwards compat
    super(
      `[${message.globalRouting.origin}->${
        message.globalRouting.destination
      }] {${message.command}} ${message.error.error || message.error.type}`
    );

    // Set the prototype explicitly. Necessary for instanceof to work.
    // See https://github.com/microsoft/TypeScript-wiki/blob/466551af203ca08db17261fd3ad8885534e33a34/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, MessageRouterError.prototype);

    this.command = message.command;
    this.details = message.error;
  }
}
