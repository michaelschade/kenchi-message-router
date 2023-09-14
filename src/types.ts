export type MessageBlob = Record<string, unknown>;

export interface CommandDetails {
  origin: string;
  args: Record<string, unknown>;
  resp: void | MessageBlob;
}

export interface CommandsForDestination {
  [command: string]: CommandDetails;
}

export interface ICommands {
  [destination: string]: CommandsForDestination;
}

export type CommandOpts = {
  tabId?: number;
  timeout?: number | null;
  confirmReceipt?: boolean; // Default true
};

export type CommandHandler<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResp extends void | MessageBlob = void
> = (
  args: TArgs,
  command: string,
  origin: string
  // The brackets to avoid distributing the type https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
) => [TResp] extends [void] ? Promise<TResp> | void : Promise<TResp>;

export type ValidateOrigin<
  TOrigin extends string,
  TCommand extends CommandDetails
> = TOrigin extends TCommand['origin'] ? TCommand : never;

export interface IMessageRouter<
  TCommands extends ICommands,
  TNode extends string
> {
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
  ): Promise<ValidateOrigin<TNode, TCommands[TDest][TCommand]>['resp']>;

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
  ): void;

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
  ): void;

  registerListeners(): void;
  unregisterListeners(): void;
}
