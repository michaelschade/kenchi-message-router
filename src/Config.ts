import { MessagingStrategy } from './strategies';

export type EdgeConfig = {
  strategy: MessagingStrategy;
  secure: boolean;
  waitForReady?: boolean;
};

export type EdgeConfigs = {
  [node: string]: {
    [node: string]: EdgeConfig;
  };
};

export type Topology = {
  secureOrigins: Set<string>;
  edges: EdgeConfigs;
};

export interface NodeConfig {
  getOrigin(): string;
}

export type NodeConfigs = {
  [node: string]: NodeConfig[] | NodeConfig;
};
