/// <reference types="@types/jest" />

import MessageRouter, {
  NodeConfigs,
  Topology,
  WindowMessagingStrategy,
  WindowNodeConfig,
  ICommands,
} from '../src';
import { TestResponse } from './utils';

const origin = 'http://localhost';

interface TestCommands extends ICommands {
  b: {
    hello: {
      origin: 'a';
      args: { hello: string };
      resp: TestResponse;
    };
  };
}
beforeAll(async () => {
  // workaround for https://github.com/jsdom/jsdom/issues/2745
  // if no origin exists, set it
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin === '') {
      event.stopImmediatePropagation();
      const eventWithOrigin: MessageEvent = new MessageEvent('message', {
        data: event.data,
        origin,
      });
      window.dispatchEvent(eventWithOrigin);
    }
  });
});

test('basic message passing', (done) => {
  const nodeConfigs: NodeConfigs = {
    a: new WindowNodeConfig(origin, window),
    b: new WindowNodeConfig(origin, window),
  };
  const topology: Topology = {
    secureOrigins: new Set([origin]),
    edges: {
      a: {
        b: {
          strategy: WindowMessagingStrategy,
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

  bRouter.addCommandHandler('a', 'hello', () =>
    Promise.resolve({ success: 'hello from B' })
  );
  aRouter.sendCommand('b', 'hello', { hello: 'world' }).then((response) => {
    expect(response.success).toBe('hello from B');
    done();
  });
});
