import {
  RoutingMessageSender,
  RoutingMessageReceiver,
  MessagingStrategy,
} from '.';
import { Message, isMessage, MessageCallback } from '../Message';
import { NodeConfig } from '../Config';
import type MessageRouter from '..';
import { ICommands } from '../types';

type ExtensionNodeType = 'background' | 'tab' | 'frame' | 'external';

export class ExtensionNodeConfig implements NodeConfig {
  constructor(
    private id: string,
    public readonly type: ExtensionNodeType,
    public tabId?: number // Can be set later
  ) {
    if (type === 'background' && tabId) {
      throw new Error(
        'Only non-background extension nodes can have a tabId or frameId'
      );
    }
  }

  getId(): string {
    return this.id;
  }

  getOrigin(): string {
    return `chrome-extension://${this.id}`;
  }
}

class ExtensionSender<
  TCommands extends ICommands,
  TNode extends string
> extends RoutingMessageSender<TCommands, TNode> {
  static nodeConfigType = ExtensionNodeConfig;

  private senderConfig: ExtensionNodeConfig;
  private receiverConfig: ExtensionNodeConfig;

  constructor(
    senderName: string,
    senderConfig: NodeConfig,
    receiverName: string,
    receiverConfig: NodeConfig,
    protected router: MessageRouter<TCommands, TNode>
  ) {
    super(senderName, receiverName, router);
    if (!(senderConfig instanceof ExtensionNodeConfig)) {
      throw new Error(
        `Expecting a valid ExtensionNodeConfig for ${senderName}`
      );
    }
    if (!(receiverConfig instanceof ExtensionNodeConfig)) {
      throw new Error(
        `Expecting a valid ExtensionNodeConfig for ${receiverName}`
      );
    }
    this.senderConfig = senderConfig;
    this.receiverConfig = receiverConfig;
  }

  sendMessage(message: Message, callback: MessageCallback) {
    const responseHandler = (response: unknown) => {
      if (chrome.runtime.lastError) {
        callback(
          this.makeErrorMessage(
            message,
            'chromeRuntime',
            'Error communicating with the extension',
            { message: chrome.runtime.lastError.message }
          )
        );
      } else if (!isMessage(response)) {
        callback(
          this.makeErrorMessage(
            message,
            'invalidResponse',
            'Response from extension was not a valid message',
            { response }
          )
        );
      } else {
        callback(response);
      }
    };
    if (this.receiverConfig.type === 'background') {
      if (this.senderConfig.tabId) {
        message.opts ||= {};
        message.opts.tabId = this.senderConfig.tabId;
        // Deprecated: we now use opts to store tabId. Keep the arg around until everyone is on 0.3.
        message.args.tabId = this.senderConfig.tabId;
      }

      chrome.runtime.sendMessage(
        this.receiverConfig.getId(),
        message,
        responseHandler
      );
    } else {
      let tabId: number;
      if (message.opts?.tabId) {
        if (this.receiverConfig.tabId) {
          throw new Error(
            'This tab already has its ID set by config, cannot override with arg.'
          );
        }
        if (this.senderConfig.type !== 'background') {
          throw new Error('Cannot specify tabId unless from the background.');
        }
        tabId = message.opts.tabId;
        delete message.opts.tabId; // Make sure we only use it once
      } else if (!this.receiverConfig.tabId) {
        throw new Error(
          'When communicating to a tab you must include `tabId` in the config or args.'
        );
      } else {
        tabId = this.receiverConfig.tabId;
      }

      const opts: { frameId?: number } = {};
      if (this.receiverConfig.type === 'tab') {
        opts.frameId = 0;
      } else {
        // If we're a frame we don't have the frameId, so just blast it to the
        // entire page and rely on the other frames ignoring it.
      }
      chrome.tabs.sendMessage(tabId, message, opts, responseHandler);
    }
  }

  registerListener() {
    /* NOOP */
  }
  unregisterListener() {
    /* NOOP */
  }
}

class ExtensionReceiver<
  TCommands extends ICommands,
  TNode extends string
> extends RoutingMessageReceiver<TCommands, TNode> {
  static nodeConfigType = ExtensionNodeConfig;

  private senderConfig: ExtensionNodeConfig;
  private receiverConfig: ExtensionNodeConfig;

  constructor(
    senderName: string,
    senderConfig: NodeConfig,
    receiverName: string,
    receiverConfig: NodeConfig,
    protected router: MessageRouter<TCommands, TNode>
  ) {
    super(senderName, receiverName, router);
    if (!(senderConfig instanceof ExtensionNodeConfig)) {
      throw new Error(
        `Expecting a valid ExtensionNodeConfig for ${senderName}`
      );
    }
    if (!(receiverConfig instanceof ExtensionNodeConfig)) {
      throw new Error(
        `Expecting a valid ExtensionNodeConfig for ${receiverName}`
      );
    }
    this.senderConfig = senderConfig;
    this.receiverConfig = receiverConfig;
  }

  registerListener() {
    if (
      this.receiverConfig.type === 'background' &&
      this.senderConfig.type === 'external'
    ) {
      chrome.runtime.onMessageExternal.addListener(this.handleMessageReceived);
    } else {
      chrome.runtime.onMessage.addListener(this.handleMessageReceived);
    }
  }

  unregisterListener() {
    if (
      this.receiverConfig.type === 'background' &&
      this.senderConfig.type === 'external'
    ) {
      chrome.runtime.onMessageExternal.removeListener(
        this.handleMessageReceived
      );
    } else {
      chrome.runtime.onMessage.removeListener(this.handleMessageReceived);
    }
  }

  private handleMessageReceived = (
    request: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    const message = this.verifyMessageIntegrity(request);
    if (!message) {
      return null;
    }

    if (
      this.receiverConfig.type === 'background' &&
      message.globalRouting.destination === this.receiverName
    ) {
      message.args.sender = sender;
    }
    this.router._routeMessage(message, sendResponse);

    return true; // Tells Chrome this is an async response
  };
}

const ExtensionMessagingStrategy: MessagingStrategy = {
  senderConfig: ExtensionNodeConfig,
  newSender: ExtensionSender,

  receiverConfig: ExtensionNodeConfig,
  newReceiver: ExtensionReceiver,
};

export default ExtensionMessagingStrategy;
