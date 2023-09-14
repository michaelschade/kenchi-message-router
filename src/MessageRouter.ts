import type { Message, MessageCallback, MessageError } from './Message';
import {
  MessageSender,
  MessageReceiver,
  MessagingStrategy,
} from './strategies';
import WaitForReady from './strategies/WaitForReadySender';
import {
  NodeConfigs,
  Topology,
  NodeConfig,
  EdgeConfig,
  EdgeConfigs,
} from './Config';
import { makeErrorBlob } from './utils';
import MessageRouterError from './Error';
import {
  ICommands,
  IMessageRouter,
  MessageBlob,
  CommandHandler,
  CommandOpts,
  ValidateOrigin,
} from './types';

type NormalizedNodeConfigs = {
  [key: string]: NodeConfig[];
};

type Logger = (level: 'log' | 'debug', msg: string, details?: {}) => void;

const defaultLogger: Logger = (level, msg, details) => {
  if (details) {
    console[level](msg, details);
  } else {
    console[level](msg);
  }
};

export default class MessageRouter<
  TCommands extends ICommands,
  TNode extends string
> implements IMessageRouter<TCommands, TNode>
{
  private routes: { [node: string]: string | null } = {};
  private senders: { [node: string]: MessageSender } = {};
  private receivers: { [node: string]: MessageReceiver } = {};
  private commandHandlers: {
    [node: string]: { [command: string]: CommandHandler<any, any> };
  } = {};
  private registered = false;
  private secureOrigins: Set<string>;
  private insecureReceivers: Set<string> = new Set();

  constructor(
    nodeConfigs: NodeConfigs,
    topology: Topology,
    private node: TNode,
    private logger: Logger = defaultLogger
  ) {
    if (!nodeConfigs[this.node]) {
      throw new Error(
        `The node ${
          this.node
        } does not exist in your topology. Expecting one of ${Object.keys(
          nodeConfigs
        )}`
      );
    }
    const normalizedNodeConfigs: { [node: string]: NodeConfig[] } = {};
    Object.keys(nodeConfigs).forEach((k) => {
      normalizedNodeConfigs[k] = this.arrayify(nodeConfigs[k]);
    });

    const edgeConfigs = topology.edges;
    this.secureOrigins = topology.secureOrigins;

    const allNodes = new Set<string>();
    Object.keys(edgeConfigs).forEach((node) => {
      allNodes.add(node);
      Object.keys(edgeConfigs[node]).forEach((node) => allNodes.add(node));
    });

    this.resolveRoutes(allNodes, edgeConfigs);
    this.resolveSenders(normalizedNodeConfigs, edgeConfigs);
    this.resolveReceivers(normalizedNodeConfigs, edgeConfigs);

    if (
      Object.keys(this.senders).length === 0 &&
      Object.keys(this.receivers).length === 0
    ) {
      throw new Error(
        'No edges into or out of this node, did you mistype your node name?'
      );
    }
  }

  private resolveRoutes(allNodes: Set<string>, edgeConfigs: EdgeConfigs) {
    allNodes.forEach((node) => {
      if (node === this.node) {
        return;
      }
      this.routes[node] = this.dijkstraFirstStep(edgeConfigs, node);
    });
  }

  private arrayify<T>(item: T[] | T): T[] {
    return Array.isArray(item) ? item : [item];
  }

  private resolveSenders(
    nodeConfigs: NormalizedNodeConfigs,
    edgeConfigs: EdgeConfigs
  ) {
    const adjacentNodes = Object.keys(edgeConfigs[this.node] || {});
    adjacentNodes.forEach((node) => {
      if (!nodeConfigs[node]) {
        throw new Error(
          `Missing config for ${node}. You must provide configs for all outgoing adjacent nodes: ${adjacentNodes}`
        );
      }

      const edgeConfig = edgeConfigs[this.node][node];
      if (edgeConfig) {
        this.senders[node] = this.instantiateSender(
          nodeConfigs,
          edgeConfig,
          node
        );
        if (edgeConfig.waitForReady) {
          this.senders[node] = new WaitForReady(node, this.senders[node], this);
        }
      }
    });
  }

  private resolveReceivers(
    nodeConfigs: NormalizedNodeConfigs,
    edgeConfigs: EdgeConfigs
  ) {
    Object.keys(nodeConfigs).forEach((node) => {
      if (node === this.node) {
        return;
      }
      const edgeConfig = (edgeConfigs[node] || {})[this.node];
      if (edgeConfig) {
        if (!nodeConfigs[node]) {
          throw new Error(
            `Missing config for ${node}. You must provide configs for all incoming adjacent nodes`
          );
        }
        if (!edgeConfig.secure) {
          this.insecureReceivers.add(node);
        }
        this.receivers[node] = this.instantiateReceiver(
          nodeConfigs,
          edgeConfig,
          node
        );
      }
    });
  }

  private instantiateSender(
    nodeConfigs: NormalizedNodeConfigs,
    edgeConfig: EdgeConfig,
    receiverName: string
  ): MessageSender {
    const strategy = edgeConfig.strategy;

    const [senderConfig, receiverConfig] = this.findNodeConfigs(
      nodeConfigs,
      strategy,
      this.node,
      receiverName
    );

    if (edgeConfig.secure) {
      if (!this.secureOrigins.has(receiverConfig.getOrigin())) {
        throw new Error(
          `[${
            this.node
          }] Can't consider myself secure talking to ${receiverName} if I have a non-whitelisted origin ${senderConfig.getOrigin()}`
        );
      }
      if (!this.secureOrigins.has(senderConfig.getOrigin())) {
        throw new Error(
          `[${
            this.node
          }] Can't consider ${receiverName} secure if it has a non-whitelisted origin ${receiverConfig.getOrigin()}`
        );
      }
    }

    return new strategy.newSender(
      this.node,
      senderConfig,
      receiverName,
      receiverConfig,
      this
    );
  }

  private instantiateReceiver(
    nodeConfigs: NormalizedNodeConfigs,
    edgeConfig: EdgeConfig,
    senderName: string
  ): MessageReceiver {
    const strategy = edgeConfig.strategy;

    const [senderConfig, receiverConfig] = this.findNodeConfigs(
      nodeConfigs,
      strategy,
      senderName,
      this.node
    );

    if (edgeConfig.secure) {
      if (!this.secureOrigins.has(receiverConfig.getOrigin())) {
        throw new Error(
          `[${
            this.node
          }] Can't consider myself secure talking to ${senderName} if I have a non-whitelisted origin ${receiverConfig.getOrigin()}`
        );
      }
      if (!this.secureOrigins.has(senderConfig.getOrigin())) {
        throw new Error(
          `[${
            this.node
          }] Can't consider ${senderName} secure if it has a non-whitelisted origin ${senderConfig.getOrigin()}`
        );
      }
    }

    return new strategy.newReceiver(
      senderName,
      senderConfig,
      this.node,
      receiverConfig,
      this
    );
  }

  private findNodeConfigs(
    nodeConfigs: NormalizedNodeConfigs,
    strategy: MessagingStrategy,
    senderName: string,
    receiverName: string
  ): [NodeConfig, NodeConfig] {
    const senderConfig = nodeConfigs[senderName].find(
      (c) => c instanceof strategy.senderConfig
    );
    if (!senderConfig) {
      throw new Error(
        `[${this.node}] Couldn't find a ${strategy.senderConfig.name} for ${senderName} to satisfy its edge to ${receiverName}`
      );
    }

    const receiverConfig = nodeConfigs[receiverName].find(
      (c) => c instanceof strategy.receiverConfig
    );
    if (!receiverConfig) {
      throw new Error(
        `[${this.node}] Couldn't find a ${strategy.receiverConfig.name} for ${receiverName} to satisfy its edge from ${senderName}`
      );
    }

    return [senderConfig, receiverConfig];
  }

  // Return the first step on the shortest path from `this.node` to `to`.
  // It's like I'm back in college!
  private dijkstraFirstStep(edgeConfigs: EdgeConfigs, to: string) {
    const seen = new Set<string>([this.node]);
    const queue: { firstNode: null | string; node: string }[] = [
      { firstNode: null, node: this.node },
    ];
    while (queue.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { firstNode, node } = queue.shift()!;

      if (node === to) {
        return firstNode;
      }

      const neighbors = Object.keys(edgeConfigs[node] || {});
      neighbors.forEach((nextNode) => {
        if (!seen.has(nextNode)) {
          seen.add(nextNode);
          queue.push({ firstNode: firstNode || nextNode, node: nextNode });
        }
      });
    }
    return null;
  }

  sendCommand<
    TDest extends string,
    TCommand extends keyof TCommands[TDest] & string
  >(
    destination: TDest,
    command: TCommand,
    ...[args, opts]: ValidateOrigin<
      TNode,
      TCommands[TDest][TCommand]
    >['args'] extends Record<string, undefined>
      ? [Record<string, undefined>?, CommandOpts?]
      : [TCommands[TDest][TCommand]['args'], CommandOpts?]
  ): Promise<ValidateOrigin<TNode, TCommands[TDest][TCommand]>['resp']> {
    const step = this.routes[destination];
    if (!step) {
      throw new Error(`No path to reach ${destination} from ${this.node}`);
    }

    if (step === destination) {
      this.log(`{${command}} Sending to ${destination} directly`);
    } else {
      this.log(`{${command}} Sending to ${destination} via ${step}`);
    }
    const messagePasser = this.senders[step];
    return new Promise((resolve, reject) => {
      messagePasser.sendMessage(
        {
          localRouting: {
            from: this.node,
            to: step,
          },
          globalRouting: {
            origin: this.node,
            destination,
            passerState: {},
          },
          command,
          args: args || {},
          opts: opts || {},
        },
        (message: Message) => {
          if (message.error) {
            this.log(`{${command}} Got error`, message);
            const error = new MessageRouterError(message);
            reject(error);
          } else {
            this.log(`{${command}} Got response`);
            // Pretty sure there's nothing better than casting to be done here
            resolve(message.response);
          }
        }
      );
    });
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
    if (!Array.isArray(origins)) {
      origins = [origins];
    }
    origins.forEach((origin) => {
      if (!this.commandHandlers[origin]) {
        this.commandHandlers[origin] = {};
      }
      if (this.commandHandlers[origin][command]) {
        throw new Error('Only one handler per origin/command');
      }
      this.commandHandlers[origin][command] = handler;
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
    if (!Array.isArray(origins)) {
      origins = [origins];
    }
    origins.forEach((origin) => {
      const existingCallback = (this.commandHandlers[origin] || {})[command];
      if (!existingCallback) {
        throw new Error('Handler does not exist');
      }
      if (existingCallback !== handler) {
        throw new Error('A different handler is registered to this command');
      }
      delete this.commandHandlers[origin][command];
    });
  }

  registerListeners(): void {
    if (this.registered) {
      throw new Error('Double-registering listeners');
    }
    this.registered = true;

    Object.keys(this.senders).forEach((node) => {
      this.senders[node].registerListener();
    });

    Object.keys(this.receivers).forEach((node) => {
      this.receivers[node].registerListener();
    });
  }

  unregisterListeners(): void {
    this.registered = false;

    Object.keys(this.senders).forEach((node) => {
      this.senders[node].unregisterListener();
    });

    Object.keys(this.receivers).forEach((node) => {
      this.receivers[node].unregisterListener();
    });
  }

  private makeResponse(
    originalMessage: Message,
    response?: MessageBlob,
    error?: MessageError
  ): Message {
    return {
      ...originalMessage,
      localRouting: {
        from: originalMessage.localRouting.to,
        to: originalMessage.localRouting.from,
      },
      isResponse: true,
      response,
      error,
    };
  }

  _routeMessage(message: Message, callback: MessageCallback): void {
    const origin = message.globalRouting.origin;
    const destination = message.globalRouting.destination;
    const pathLog =
      origin === message.localRouting.from
        ? ' directly'
        : ` via ${message.localRouting.from}`;

    if (
      this.insecureReceivers.has(message.localRouting.from) &&
      !(
        origin === message.localRouting.from ||
        destination === message.localRouting.to
      )
    ) {
      throw new Error(
        'Refusing to handle message from insecure node: they can only ' +
          "initiate or terminate messages, not forward them. It's possible a " +
          'malicious actor is trying to poke the system.'
      );
    }

    if (destination === this.node) {
      const handlers = this.commandHandlers[origin];
      if (!handlers) {
        callback(
          this.makeResponse(
            message,
            undefined,
            makeErrorBlob(
              message,
              'noHandler',
              `No handlers found for messages from ${origin}`
            )
          )
        );
        return;
      }
      const handler = handlers[message.command] || handlers['*'];
      if (!handler) {
        callback(
          this.makeResponse(
            message,
            undefined,
            makeErrorBlob(
              message,
              'noHandler',
              `No handler found for command ${message.command} from ${origin}`
            )
          )
        );
        return;
      }
      this.log(
        `{${message.command}} from ${origin}${pathLog} for me. Handling`
      );
      const handlerPromise = handler(message.args, message.command, origin);
      if (!(handlerPromise instanceof Promise)) {
        callback(
          this.makeResponse(
            message,
            undefined,
            makeErrorBlob(
              message,
              'invalidHandler',
              `Expected handler to return a Promise, instead got ${typeof handlerPromise}`
            )
          )
        );
        return;
      }
      handlerPromise
        .then((response: MessageBlob | void) => {
          callback(this.makeResponse(message, response || undefined));
        })
        .catch((caughtError?: MessageBlob | Error) => {
          const rethrow =
            caughtError instanceof Error &&
            !(caughtError instanceof MessageRouterError);
          let error: MessageError;
          if (caughtError && rethrow) {
            // TODO: do we want to send the error message back through the chain? Possible information leak
            error = makeErrorBlob(
              message,
              'handlerError',
              'An unexpected error was thrown during handling',
              { name: caughtError.name }
            );
          } else if (caughtError === undefined) {
            error = makeErrorBlob(
              message,
              'unknownError',
              'The handler rejected without a message'
            );
          } else {
            error = caughtError;
          }
          // Can't have both response and error undefined. If we reject with nothing fill in error.
          callback(this.makeResponse(message, undefined, error));
          if (rethrow) {
            throw caughtError;
          }
        });
    } else {
      const step = this.routes[destination];
      if (!step) {
        throw new Error(`No path to reach ${destination} from ${this.node}`);
      }
      const messagePasser = this.senders[step];
      const newMessage = {
        ...message,
        localRouting: {
          from: this.node,
          to: step,
        },
      };
      this.log(
        `{${message.command}} from ${origin}${pathLog} for ${destination}. Forwarding to ${newMessage.localRouting.to}`
      );
      messagePasser.sendMessage(newMessage, (response) => {
        const newResponse = {
          ...response,
          localRouting: {
            from: message.localRouting.to,
            to: message.localRouting.from,
          },
        };
        callback(newResponse);
      });
    }
  }

  private log(msg: string, details?: MessageBlob) {
    this.logger('log', `[${this.node}] ${msg}`, details);
  }

  private debug(msg: string, details?: MessageBlob) {
    this.logger('debug', `[${this.node}] ${msg}`, details);
  }

  _passerLog(adjacentNode: string, isSender: boolean, msg: string) {
    this.logger(
      'log',
      `[${this.node} ${isSender ? '=>' : '<='} ${adjacentNode}] ${msg}`
    );
  }

  _passerDebug(adjacentNode: string, isSender: boolean, msg: string) {
    this.logger(
      'debug',
      `[${this.node} ${isSender ? '=>' : '<='} ${adjacentNode}] ${msg}`
    );
  }
}
