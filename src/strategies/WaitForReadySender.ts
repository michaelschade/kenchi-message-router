import { MessageSender } from '.';
import { Message, MessageCallback } from '../Message';
import MessageRouter from '..';
import { ICommands } from '../types';

export default class WaitForReadySender<
  TCommands extends ICommands,
  // TODO: figure out a way to require system:ready be in the command list...
  //  & {
  //   [key in TNode]: {
  //     'system:ready': { origins: TDest; args: undefined; resp: void };
  //   };
  // },
  TNode extends string,
  TDest extends string
> implements MessageSender
{
  private isReady = false;
  private queuedMessages: { message: Message; callback: MessageCallback }[] =
    [];

  constructor(
    private receiverName: TDest,
    private sender: MessageSender,
    private router: MessageRouter<TCommands, TNode>
  ) {
    this.router.addCommandHandler(
      receiverName,
      'system:ready',
      // @ts-ignore TODO!
      this.systemReady
    );
  }

  sendMessage(message: Message, callback: MessageCallback): void {
    if (this.isReady) {
      this.sender.sendMessage(message, callback);
    } else {
      this.router._passerLog(
        this.receiverName,
        true,
        `{${message.command}} Queueing message to ${message.globalRouting.destination} until adjacent node is ready`
      );
      this.queuedMessages.push({ message, callback });
    }
  }

  private systemReady = () => {
    if (this.isReady) {
      return Promise.reject({ type: 'alreadyReady' });
    }
    this.isReady = true;
    this.router._passerLog(
      this.receiverName,
      true,
      `{system:ready} flushing ${this.queuedMessages.length} messages`
    );
    this.queuedMessages.forEach(({ message, callback }) =>
      this.sender.sendMessage(message, callback)
    );
    this.queuedMessages = [];
    return Promise.resolve();
  };

  registerListener(): void {
    this.sender.registerListener();
  }

  unregisterListener(): void {
    this.sender.unregisterListener();
  }
}
