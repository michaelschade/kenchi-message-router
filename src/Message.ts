import { MessageBlob, CommandOpts } from './types';

type LocalRouting = {
  from: string;
  to: string;
};

export type MessageError = {
  error?: string; // Deprecated, use type
  type?: string;
  message?: string;
  details?: MessageBlob;
  localRouting?: LocalRouting;
};

export type Message = {
  command: string;
  localRouting: LocalRouting;
  globalRouting: {
    origin: string;
    destination: string;
    passerState: Record<string, unknown>;
  };
  args: MessageBlob;
  isResponse?: boolean;
  response?: MessageBlob;
  error?: MessageError;
  opts?: CommandOpts;
};

export function isMessage(data: unknown): data is Message {
  if (typeof data !== 'object' || !data) {
    return false;
  }

  // Close enough
  return (
    'command' in data &&
    'localRouting' in data &&
    'globalRouting' in data &&
    'args' in data
  );
}

export type MessageCallback = (message: Message) => void;
