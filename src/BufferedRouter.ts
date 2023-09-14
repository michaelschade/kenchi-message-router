import {
  ICommands,
  IMessageRouter,
  ValidateOrigin,
  MessageBlob,
  CommandHandler,
  CommandOpts,
} from './types';
import MessageRouter from '.';

type BufferedMessage = {
  args: any;
  resolve: (response?: void | MessageBlob) => void;
  reject: (reason: unknown) => void;
};

export default class BufferedRouter<
  TCommands extends ICommands,
  TNode extends string
> implements IMessageRouter<TCommands, TNode>
{
  // origin => command => message
  private buffer: Record<string, Record<string, BufferedMessage[]>> = {};

  constructor(
    private messageRouter: MessageRouter<TCommands, TNode>,
    bufferedOrigins: string | string[]
  ) {
    const bufferedOriginsArray = Array.isArray(bufferedOrigins)
      ? bufferedOrigins
      : [bufferedOrigins];
    bufferedOriginsArray.forEach((origin) => {
      // @ts-ignore TODO
      messageRouter.addCommandHandler(origin, '*', this.handleUnknownCommand);
    });
  }

  sendCommand<
    TDest extends string,
    TCommand extends keyof TCommands[TDest] & string
  >(
    destination: TDest,
    command: TCommand,
    ...args: ValidateOrigin<
      TNode,
      TCommands[TDest][TCommand]
    >['args'] extends Record<string, undefined>
      ? [Record<string, undefined>?, CommandOpts?]
      : [TCommands[TDest][TCommand]['args'], CommandOpts?]
  ): Promise<ValidateOrigin<TNode, TCommands[TDest][TCommand]>['resp']> {
    return this.messageRouter.sendCommand(destination, command, ...args);
  }

  addCommandHandler<
    TOrigin extends string,
    TCommand extends keyof TCommands[TNode] & string
  >(
    origins: TOrigin | TOrigin[],
    command: TCommand,
    handler: TOrigin extends TCommands[TNode][TCommand]['origin']
      ? CommandHandler<
          TCommands[TNode][TCommand]['args'],
          TCommands[TNode][TCommand]['resp']
        >
      : never
  ) {
    if (command === '*') {
      throw new Error(
        'Cannot register a wildcard command handler on top of a buffer router'
      );
    }

    if (!Array.isArray(origins)) {
      origins = [origins];
    }

    origins.forEach((origin) => {
      this.messageRouter.addCommandHandler(origin, command, handler);

      const messages = this.buffer[origin]?.[command];
      if (messages) {
        messages.forEach(({ args, resolve, reject }) => {
          const promiseOrVoid = handler(args, command, origin);
          if (promiseOrVoid) {
            promiseOrVoid.then(resolve).catch(reject);
          } else {
            resolve();
          }
        });
        delete this.buffer[origin][command];
      }
    });
  }

  removeCommandHandler<
    TOrigin extends string,
    TCommand extends keyof TCommands[TNode] & string
  >(
    origins: TOrigin | TOrigin[],
    command: TCommand,
    handler: TOrigin extends TCommands[TNode][TCommand]['origin']
      ? CommandHandler<
          TCommands[TNode][TCommand]['args'],
          TCommands[TNode][TCommand]['resp']
        >
      : never
  ) {
    return this.messageRouter.removeCommandHandler(origins, command, handler);
  }

  registerListeners() {
    return this.messageRouter.registerListeners();
  }

  unregisterListeners() {
    return this.messageRouter.unregisterListeners();
  }

  private handleUnknownCommand = (
    args: MessageBlob,
    command: string,
    origin: string
  ): Promise<void | MessageBlob> => {
    return new Promise((resolve, reject) => {
      if (!this.buffer[origin]) {
        this.buffer[origin] = { [command]: [] };
      }
      if (!this.buffer[origin][command]) {
        this.buffer[origin][command] = [];
      }
      this.buffer[origin][command].push({ args, resolve, reject });
    });
  };
}
