export type { Topology, NodeConfigs } from './Config';
export type {
  CommandHandler,
  CommandsForDestination,
  CommandDetails,
  MessageBlob,
  IMessageRouter,
  ICommands,
} from './types';

import ExtensionMessagingStrategy, {
  ExtensionNodeConfig,
} from './strategies/ExtensionMessagingStrategy';
import WindowMessagingStrategy, {
  WindowNodeConfig,
} from './strategies/WindowMessagingStrategy';

import BufferedRouter from './BufferedRouter';
import MessageRouterError from './Error';
import MessageRouter from './MessageRouter';

export {
  BufferedRouter,
  ExtensionMessagingStrategy,
  ExtensionNodeConfig,
  WindowMessagingStrategy,
  WindowNodeConfig,
  MessageRouterError,
};

export default MessageRouter;
