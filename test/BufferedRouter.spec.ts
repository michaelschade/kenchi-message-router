/// <reference types="@types/jest" />

import { MessageRouterError, BufferedRouter } from '../src';
import { getBasicRouters } from './utils';

test('buffers message', (done) => {
  const [aRouter, , unbufferedCRouter] = getBasicRouters();
  const cRouter = new BufferedRouter(unbufferedCRouter, 'a');

  aRouter.sendCommand('c', 'hello', { hello: 'world' }).then((response) => {
    expect(response.success).toBe('hello from C');
    done();
  });
  cRouter.addCommandHandler('a', 'hello', () =>
    Promise.resolve({ success: 'hello from C' })
  );
});

test('buffers failure', (done) => {
  const [aRouter, , unbufferedCRouter] = getBasicRouters();
  const cRouter = new BufferedRouter(unbufferedCRouter, 'a');

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
  cRouter.addCommandHandler('a', 'hello', () =>
    Promise.reject({ type: 'iDontLikeYou', message: 'You smell' })
  );
});

test('does not buffer from wrong origin', (done) => {
  const [aRouter, , unbufferedCRouter] = getBasicRouters();
  const _cRouter = new BufferedRouter(unbufferedCRouter, 'b');

  aRouter
    .sendCommand('c', 'hello', { hello: 'world' })
    .then(() => fail())
    .catch((error) => {
      expect(error).toBeInstanceOf(MessageRouterError);
      expect(error.command).toBe('hello');
      expect(error.message).toBe('[a->c] {hello} noHandler');
      done();
    });
});
