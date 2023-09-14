import { Message } from './Message';
import { MessageBlob } from './types';

export const makeErrorBlob = (
  originalMessage: Message,
  type: string,
  description: string,
  details: MessageBlob = {}
) => {
  return {
    localRouting: originalMessage.localRouting, // Copy here since localRouting can be updated
    type,
    message: description,
    details,
  };
};
