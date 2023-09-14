/// <reference types="@types/jest" />

import { NodeConfig, Topology, NodeConfigs } from '../src/Config';
import { Message, MessageCallback } from '../src/Message';
import type {
  MessageReceiver,
  MessageSender,
  MessagingStrategy,
} from '../src/strategies';
import MessageRouter from '../src/MessageRouter';
import { ICommands } from '../src/types';

export type TestResponse = { success: string };

type TestMessageHander = (message: Message, callback: MessageCallback) => void;

export class TestNodeConfig implements NodeConfig {
  constructor(
    public testMessageHandlers: Record<string, TestMessageHander[]>
  ) {}

  getOrigin(): string {
    return 'TEST';
  }
}

class TestSender<TCommands extends ICommands, TNode extends string>
  implements MessageSender
{
  private config: TestNodeConfig;

  constructor(
    senderName: string,
    senderConfig: NodeConfig,
    _receiverName: string,
    _receiverConfig: NodeConfig,
    _router: MessageRouter<TCommands, TNode>
  ) {
    if (!(senderConfig instanceof TestNodeConfig)) {
      throw new Error(`Expecting a valid TestNodeConfig for ${senderName}`);
    }
    this.config = senderConfig;
  }

  sendMessage(message: Message, callback: MessageCallback) {
    this.config.testMessageHandlers[message.localRouting.to].forEach((c) =>
      c(message, callback)
    );
  }

  registerListener() {
    // NOOP
  }

  unregisterListener() {
    // NOOP
  }
}

class TestReceiver<TCommands extends ICommands, TNode extends string>
  implements MessageReceiver
{
  private config: TestNodeConfig;

  constructor(
    _senderName: string,
    _senderConfig: NodeConfig,
    private receiverName: string,
    receiverConfig: NodeConfig,
    private router: MessageRouter<TCommands, TNode>
  ) {
    if (!(receiverConfig instanceof TestNodeConfig)) {
      throw new Error(`Expecting a valid TestNodeConfig for ${receiverName}`);
    }
    this.config = receiverConfig;
  }

  registerListener() {
    if (!this.config.testMessageHandlers[this.receiverName]) {
      this.config.testMessageHandlers[this.receiverName] = [];
    }
    this.config.testMessageHandlers[this.receiverName].push(this.handleMessage);
  }

  unregisterListener() {
    const index = this.config.testMessageHandlers[this.receiverName].findIndex(
      (f) => f === this.handleMessage
    );
    this.config.testMessageHandlers[this.receiverName].splice(index, 1);
  }

  private handleMessage = (message: Message, callback: MessageCallback) => {
    this.router._routeMessage(message, callback);
  };
}

export const TestMessagingStrategy: MessagingStrategy = {
  senderConfig: TestNodeConfig,
  newSender: TestSender,

  receiverConfig: TestNodeConfig,
  newReceiver: TestReceiver,
};

interface TestCommands extends ICommands {
  c: {
    hello: {
      origin: 'a';
      args: { hello: string };
      resp: TestResponse;
    };
  };
}
export function getBasicRouters(): [
  MessageRouter<TestCommands, 'a'>,
  MessageRouter<TestCommands, 'b'>,
  MessageRouter<TestCommands, 'c'>
] {
  const testMessageHandlers: Record<string, TestMessageHander[]> = {};
  const nodeConfigs: NodeConfigs = {
    a: new TestNodeConfig(testMessageHandlers),
    b: new TestNodeConfig(testMessageHandlers),
    c: new TestNodeConfig(testMessageHandlers),
  };
  const topology: Topology = {
    secureOrigins: new Set(['TEST']),
    edges: {
      a: {
        b: {
          strategy: TestMessagingStrategy,
          secure: true,
        },
      },
      b: {
        c: {
          strategy: TestMessagingStrategy,
          secure: true,
        },
      },
    },
  };
  const aRouter = new MessageRouter<TestCommands, 'a'>(
    nodeConfigs,
    topology,
    'a'
  );
  aRouter.registerListeners();
  const bRouter = new MessageRouter<TestCommands, 'b'>(
    nodeConfigs,
    topology,
    'b'
  );
  bRouter.registerListeners();
  const cRouter = new MessageRouter<TestCommands, 'c'>(
    nodeConfigs,
    topology,
    'c'
  );
  cRouter.registerListeners();
  return [aRouter, bRouter, cRouter];
}
