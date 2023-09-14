import {
  RoutingMessageSender,
  RoutingMessageReceiver,
  MessagingStrategy,
} from '.';
import { Message, isMessage, MessageCallback } from '../Message';
import { NodeConfig } from '../Config';
import MessageRouter from '..';
import { ICommands } from '../types';

export class WindowNodeConfig implements NodeConfig {
  constructor(private origin?: string, private window?: Window) {}

  getOrigin(): string {
    if (!this.origin) {
      throw new Error('Expected origin to be set by now');
    }
    return this.origin;
  }

  setOrigin(origin: string): void {
    if (this.origin) {
      throw new Error('Origin is already set');
    }
    this.origin = origin;
  }

  getWindow(): Window {
    if (!this.window) {
      throw new Error('Expected window to be set by now');
    }
    return this.window;
  }

  setWindow(window: Window): void {
    if (this.window) {
      throw new Error('Window is already set');
    }
    this.window = window;
  }
}

class WindowSender<
  TCommands extends ICommands,
  TNode extends string
> extends RoutingMessageSender<TCommands, TNode> {
  private uniqueId: string = Math.random().toString(36).substring(2, 15);
  private id = 1;
  private callbacks: { [id: number]: MessageCallback } = {};

  private config: WindowNodeConfig;
  private adjacentConfig: WindowNodeConfig;

  constructor(
    senderName: string,
    senderConfig: NodeConfig,
    protected receiverName: string,
    receiverConfig: NodeConfig,
    protected router: MessageRouter<TCommands, TNode>
  ) {
    super(senderName, receiverName, router);
    if (!(senderConfig instanceof WindowNodeConfig)) {
      throw new Error(`Expecting a valid WindowNodeConfig for ${senderName}`);
    }
    if (!(receiverConfig instanceof WindowNodeConfig)) {
      throw new Error(`Expecting a valid WindowNodeConfig for ${receiverName}`);
    }
    this.config = senderConfig;
    this.adjacentConfig = receiverConfig;
  }

  sendMessage(message: Message, callback: MessageCallback) {
    const id = this.id++;

    const confirmReceipt = message.opts?.confirmReceipt !== false;
    if (confirmReceipt) {
      this.callbacks[id] = (response: unknown) => {
        if (!isMessage(response)) {
          callback(
            this.makeErrorMessage(
              message,
              'invalidResponse',
              'Response from window was not a valid message',
              { response }
            )
          );
        } else {
          callback(response);
        }
      };
    }

    message.globalRouting.passerState[this.uniqueId] = id;

    if (message.opts?.timeout !== null && confirmReceipt) {
      window.setTimeout(() => {
        if (id in this.callbacks) {
          const responseCallback = this.callbacks[id];
          delete this.callbacks[id];
          responseCallback(
            this.makeErrorMessage(
              message,
              'windowTimeout',
              `Timed out waiting on a response from ${message.localRouting.to}`
            )
          );
        }
      }, message.opts?.timeout || 5000);
    }
    this.adjacentConfig
      .getWindow()
      .postMessage(message, this.adjacentConfig.getOrigin());
  }

  registerListener() {
    this.config
      .getWindow()
      .addEventListener('message', this.handleSenderResponse);
  }

  unregisterListener() {
    this.config
      .getWindow()
      .removeEventListener('message', this.handleSenderResponse);
  }

  private integrityChecks(e: MessageEvent): Message | null {
    const expectedOrigin = this.adjacentConfig.getOrigin();
    if (expectedOrigin !== '*' && e.origin !== expectedOrigin) {
      this.router._passerDebug(
        this.receiverName,
        true,
        `skipping: mismatched origin from ${e.origin}, expecting ${expectedOrigin}`
      );
      return null;
    }

    return this.verifyMessageIntegrity(e.data);
  }

  private handleSenderResponse = (e: MessageEvent) => {
    const message = this.integrityChecks(e);
    if (!message) {
      return;
    }

    // We could have registered both a MessagePasser sender and receiver listener on the same event
    if (!message.isResponse) {
      return;
    }

    const id = message.globalRouting.passerState[this.uniqueId];
    if (typeof id === 'number') {
      const callback = this.callbacks[id];
      // Could have already timed out
      if (callback) {
        delete this.callbacks[id];
        callback(message);
      }
    }
  };
}

class WindowReceiver<
  TCommands extends ICommands,
  TNode extends string
> extends RoutingMessageReceiver<TCommands, TNode> {
  private config: WindowNodeConfig;
  private adjacentConfig: WindowNodeConfig;

  constructor(
    senderName: string,
    senderConfig: NodeConfig,
    protected receiverName: string,
    receiverConfig: NodeConfig,
    protected router: MessageRouter<TCommands, TNode>
  ) {
    super(senderName, receiverName, router);
    if (!(senderConfig instanceof WindowNodeConfig)) {
      throw new Error(`Expecting a valid WindowNodeConfig for ${senderName}`);
    }
    if (!(receiverConfig instanceof WindowNodeConfig)) {
      throw new Error(`Expecting a valid WindowNodeConfig for ${receiverName}`);
    }
    this.config = receiverConfig;
    this.adjacentConfig = senderConfig;
  }

  registerListener() {
    this.config
      .getWindow()
      .addEventListener('message', this.handleMessageReceived);
  }

  unregisterListener() {
    this.config
      .getWindow()
      .removeEventListener('message', this.handleMessageReceived);
  }

  private handleMessageReceived = (e: MessageEvent) => {
    const message = this.integrityChecks(e);
    if (!message) {
      return;
    }

    // We could have registered both a MessagePasser sender and receiver listener on the same event
    if (message.isResponse) {
      return;
    }

    this.router._routeMessage(message, (responseMessage: Message) => {
      this.adjacentConfig
        .getWindow()
        .postMessage(responseMessage, this.adjacentConfig.getOrigin());
    });
  };

  private integrityChecks(e: MessageEvent): Message | null {
    const expectedOrigin = this.adjacentConfig.getOrigin();
    if (expectedOrigin !== '*' && e.origin !== expectedOrigin) {
      this.router._passerDebug(
        this.senderName,
        false,
        `skipping: mismatched origin from ${e.origin}, expecting ${expectedOrigin}`
      );
      return null;
    }

    return this.verifyMessageIntegrity(e.data);
  }
}

const WindowMessagingStrategy: MessagingStrategy = {
  senderConfig: WindowNodeConfig,
  newSender: WindowSender,

  receiverConfig: WindowNodeConfig,
  newReceiver: WindowReceiver,
};

export default WindowMessagingStrategy;
