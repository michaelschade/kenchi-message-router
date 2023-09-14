import { Message, MessageCallback, isMessage } from '../Message';
import { NodeConfig } from '../Config';
import type MessageRouter from '../MessageRouter';
import { makeErrorBlob } from '../utils';
import { ICommands } from '../types';

export type MessageRouterHandler = (
  message: Message,
  callback: MessageCallback
) => void;

export interface MessagingStrategy {
  senderConfig: new (...args: any[]) => NodeConfig;
  newSender: new <TCommands extends ICommands, TNode extends string>(
    senderName: string,
    senderConfig: NodeConfig,
    receiverName: string,
    receiverConfig: NodeConfig,
    router: MessageRouter<TCommands, TNode>
  ) => MessageSender;

  receiverConfig: new (...args: any[]) => NodeConfig;
  newReceiver: new <TCommands extends ICommands, TNode extends string>(
    senderName: string,
    senderConfig: NodeConfig,
    receiverName: string,
    receiverConfig: NodeConfig,
    router: MessageRouter<TCommands, TNode>
  ) => MessageReceiver;
}

export interface MessageSender {
  sendMessage(message: Message, callback?: MessageCallback): void;

  registerListener(): void;
  unregisterListener(): void;
}

export interface MessageReceiver {
  registerListener(): void;
  unregisterListener(): void;
}

export abstract class RoutingMessageSender<
  TCommands extends ICommands,
  TNode extends string
> implements MessageSender
{
  constructor(
    protected senderName: string,
    protected receiverName: string,
    protected router: MessageRouter<TCommands, TNode>
  ) {}

  abstract sendMessage(message: Message, callback?: MessageCallback): void;

  abstract registerListener(): void;
  abstract unregisterListener(): void;

  protected verifyMessageIntegrity(message: unknown): Message | null {
    if (!isMessage(message)) {
      this.router._passerDebug(
        this.receiverName,
        true,
        `skipping: invalid message format`
      );
      return null;
    }

    if (message.localRouting.to !== this.senderName) {
      this.router._passerDebug(
        this.receiverName,
        true,
        `skipping: different recipient`
      );
      return null;
    }

    if (message.localRouting.from !== this.receiverName) {
      this.router._passerDebug(
        this.receiverName,
        true,
        `skipping: different sender`
      );
      return null;
    }

    return message;
  }

  protected makeErrorMessage(
    originalMessage: Message,
    type: string,
    description: string,
    details: Record<string, unknown> = {}
  ) {
    return {
      ...originalMessage,
      isResponse: true,
      error: makeErrorBlob(originalMessage, type, description, details),
    };
  }
}

export abstract class RoutingMessageReceiver<
  TCommands extends ICommands,
  TNode extends string
> implements MessageReceiver
{
  constructor(
    protected senderName: string,
    protected receiverName: string,
    protected router: MessageRouter<TCommands, TNode>
  ) {}

  abstract registerListener(): void;
  abstract unregisterListener(): void;

  protected verifyMessageIntegrity(message: unknown): Message | null {
    if (!isMessage(message)) {
      this.router._passerDebug(
        this.senderName,
        false,
        `skipping: invalid message format`
      );
      return null;
    }

    if (message.localRouting.to !== this.receiverName) {
      this.router._passerDebug(
        this.senderName,
        false,
        `skipping: different recipient`
      );
      return null;
    }

    if (message.localRouting.from !== this.senderName) {
      this.router._passerDebug(
        this.senderName,
        false,
        `skipping: different sender`
      );
      return null;
    }

    return message;
  }
}
