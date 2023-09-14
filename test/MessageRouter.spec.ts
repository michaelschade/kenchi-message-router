/// <reference types="@types/jest" />

import { MessageRouterError } from '../src';
import { getBasicRouters } from './utils';

test('basic message passing', (done) => {
  const [aRouter, , cRouter] = getBasicRouters();

  cRouter.addCommandHandler('a', 'hello', () =>
    Promise.resolve({ success: 'hello from C' })
  );
  aRouter.sendCommand('c', 'hello', { hello: 'world' }).then((response) => {
    expect(response.success).toBe('hello from C');
    done();
  });
});

test('basic error', (done) => {
  const [aRouter, , cRouter] = getBasicRouters();

  cRouter.addCommandHandler('a', 'hello', () =>
    Promise.reject({ type: 'iDontLikeYou', message: 'You smell' })
  );
  aRouter
    .sendCommand('c', 'hello', { hello: 'world' })
    .then(() => fail())
    .catch((error) => {
      expect(error).toBeInstanceOf(MessageRouterError);
      expect(error.command).toBe('hello');
      expect(error.message).toBe('[a->c] {hello} iDontLikeYou');
      expect(error.details.message).toBe('You smell');
      done();
    });
});
