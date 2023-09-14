/// <reference types="@types/jest" />

import MessageRouter, { ICommands, NodeConfigs, Topology } from '../src';
import { TestMessagingStrategy, TestNodeConfig, TestResponse } from './utils';

interface TestCommands extends ICommands {
  d: {
    hello: {
      origin: 'a';
      args: { hello: string };
      resp: TestResponse;
    };
  };
}

export function getRouters(): [
  MessageRouter<TestCommands, 'a'>,
  MessageRouter<TestCommands, 'b'>,
  MessageRouter<TestCommands, 'c'>,
  MessageRouter<TestCommands, 'd'>
] {
  const testMessageHandlers: Record<string, any> = {};
  const nodeConfigs: NodeConfigs = {
    a: new TestNodeConfig(testMessageHandlers),
    b: new TestNodeConfig(testMessageHandlers),
    c: new TestNodeConfig(testMessageHandlers),
    d: new TestNodeConfig(testMessageHandlers),
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
          secure: false,
        },
      },
      c: {
        d: {
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
  const dRouter = new MessageRouter<TestCommands, 'd'>(
    nodeConfigs,
    topology,
    'd'
  );
  dRouter.registerListeners();
  return [aRouter, bRouter, cRouter, dRouter];
}

test('does not allow insecure nodes to route messages', async () => {
  const [aRouter, , , dRouter] = getRouters();

  dRouter.addCommandHandler('a', 'hello', async () => ({ success: 'yup' }));
  expect(
    aRouter.sendCommand('d', 'hello', { hello: 'world' })
  ).rejects.toThrowError('Refusing to handle message from insecure node');
});
