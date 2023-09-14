/// <reference types="@types/jest" />
/// <reference types="@types/node" />

import MessageRouter, {
  ExtensionMessagingStrategy,
  ExtensionNodeConfig,
  NodeConfigs,
  Topology,
} from '../src';
import { TestResponse } from './utils';
import { ICommands } from '../src/types';

const EXTENSION_ID = '123';

interface TestCommands extends ICommands {
  c: {
    hello: {
      origin: 'a';
      args: {};
      resp: TestResponse;
    };
  };
  b: {
    hello: {
      origin: 'a';
      args: { hello: string };
      resp: TestResponse;
    };
  };
  a: {
    goodbye: {
      origin: 'b';
      args: { goodbye: string };
      resp: TestResponse;
    };
  };
}

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Object.assign(global, require('jest-chrome'));

  // @ts-ignore
  global.chrome.runtime.sendMessage = (
    _extensionId: string,
    message: unknown,
    callback?: unknown
  ) => {
    (global.chrome.runtime.onMessage as any).callListeners(
      message,
      {},
      callback
    );
  };

  // @ts-ignore
  global.chrome.tabs.sendMessage = (
    _tabId: number,
    message: unknown,
    _opts: unknown,
    callback?: unknown
  ) => {
    (global.chrome.runtime.onMessage as any).callListeners(
      message,
      {},
      callback
    );
  };
});

afterEach(() => {
  (global.chrome.runtime.onMessage as any).clearListeners();
});

function getRouters(
  tabId?: number
): [
  MessageRouter<TestCommands, 'a'>,
  MessageRouter<TestCommands, 'b'>,
  MessageRouter<TestCommands, 'c'>
] {
  const nodeConfigs: NodeConfigs = {
    a: new ExtensionNodeConfig(EXTENSION_ID, 'tab', tabId),
    b: new ExtensionNodeConfig(EXTENSION_ID, 'background'),
    c: new ExtensionNodeConfig(EXTENSION_ID, 'tab'),
  };
  const topology: Topology = {
    secureOrigins: new Set([`chrome-extension://${EXTENSION_ID}`]),
    edges: {
      a: {
        b: {
          strategy: ExtensionMessagingStrategy,
          secure: true,
        },
      },
      b: {
        a: {
          strategy: ExtensionMessagingStrategy,
          secure: true,
        },
        c: {
          strategy: ExtensionMessagingStrategy,
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

test('basic message passing', async () => {
  const [aRouter, bRouter] = getRouters();
  bRouter.addCommandHandler('a', 'hello', async () => ({
    success: 'hello from B',
  }));
  const response = await aRouter.sendCommand('b', 'hello', { hello: 'world' });
  expect(response.success).toBe('hello from B');
});

test('message passing from background with tabId in config', async () => {
  const [aRouter, bRouter] = getRouters(123);
  aRouter.addCommandHandler('b', 'goodbye', async () => ({
    success: 'goodbye from A',
  }));
  const response = await bRouter.sendCommand('a', 'goodbye', {
    goodbye: 'world',
  });
  expect(response.success).toBe('goodbye from A');
});

test('message passing from background with tabId in opts', async () => {
  const [aRouter, bRouter] = getRouters();
  aRouter.addCommandHandler('b', 'goodbye', async () => ({
    success: 'goodbye from A',
  }));
  const response = await bRouter.sendCommand(
    'a',
    'goodbye',
    { goodbye: 'world' },
    { tabId: 123 }
  );
  expect(response.success).toBe('goodbye from A');
});

test('errors with no tabId', async () => {
  const [aRouter, bRouter] = getRouters();
  aRouter.addCommandHandler('b', 'goodbye', async () => ({
    success: 'goodbye from A',
  }));
  expect(
    bRouter.sendCommand('a', 'goodbye', {
      goodbye: 'world',
    })
  ).rejects.toThrowError('must include `tabId`');
});

test('sending through background works without tab ID on receiving end', async () => {
  const [aRouter, , cRouter] = getRouters(123);
  cRouter.addCommandHandler('a', 'hello', async () => ({ success: ':wave:' }));
  expect(aRouter.sendCommand('c', 'hello')).resolves.toMatchObject({
    success: ':wave:',
  });
});

test('sending through background works without tab ID on receiving end and tab ID passed via args', async () => {
  const [aRouter, , cRouter] = getRouters();
  cRouter.addCommandHandler('a', 'hello', async () => ({ success: ':wave:' }));
  expect(
    aRouter.sendCommand('c', 'hello', undefined, { tabId: 123 })
  ).resolves.toMatchObject({
    success: ':wave:',
  });
});
