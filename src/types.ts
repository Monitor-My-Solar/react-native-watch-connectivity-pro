export enum SessionState {
  NotActivated = 'NotActivated',
  Inactive = 'Inactive',
  Activated = 'Activated',
}

export interface WatchState {
  isPaired: boolean;
  isReachable: boolean;
  isComplicationEnabled?: boolean;
  isWatchAppInstalled: boolean;
  sessionState: SessionState;
}

export interface FileTransfer {
  id: string;
  file: string;
  metadata?: { [key: string]: any };
  progress: number;
  error?: Error;
}

export interface UserInfo {
  id: string;
  data: { [key: string]: any };
  transferTime?: Date;
}

export type FileTransferEvent = {
  fileTransfer: FileTransfer;
};

export type ReceivedFileEvent = {
  id: string;
  file: string;
  fileName: string;
  fileSize: number;
  metadata?: { [key: string]: any };
  timestamp: number;
};

export type UserInfoEvent = {
  userInfo: UserInfo;
};

export type MessageEvent = {
  message: { [key: string]: any };
  replyHandler?: (response: { [key: string]: any }) => void;
};

export type WatchStateEvent = {
  watchState: WatchState;
};

export type WatchConnectivityError = {
  domain: string;
  code: number;
  localizedDescription: string;
};

export type ActivationErrorEvent = {
  error: WatchConnectivityError;
};

export type MessageQueueStatus = {
  count: number;
  isProcessing: boolean;
  oldestMessage: number | null;
  newestMessage: number | null;
};

export type QueueProcessResult = {
  processed: number;
};

export type ComplicationTransferResult = {
  id: string;
  timestamp: number;
  isCurrentComplicationInfo: boolean;
  userInfo: Record<string, any>;
};

export type FileTransferInfo = {
  id: string;
  fileSize: number;
  timestamp: number;
  fileName: string;
  file: string;
  metadata?: Record<string, any>;
  progress: number;
};

export type SendMessageResult = {
  sent: boolean;
  queued?: boolean;
  reason?: string;
};

export interface RNWatchConnectivityProModule {
  initSession(): Promise<boolean>;
  getReachability(): Promise<boolean>;
  sendMessage(
    message: Record<string, any>,
    responseHandler?: string
  ): Promise<SendMessageResult>;
  updateApplicationContext(context: Record<string, any>): Promise<boolean>;
  getApplicationContext(): Promise<Record<string, any>>;

  // Queue management
  queueMessage(message: Record<string, any>): Promise<Record<string, any>>;
  getQueueStatus(): Promise<MessageQueueStatus>;
  processMessageQueue(): Promise<QueueProcessResult>;
  clearMessageQueue(): Promise<boolean>;

  // Complication support
  isComplicationEnabled(): Promise<boolean>;
  getRemainingComplicationTransfers(): Promise<number>;
  transferCurrentComplicationUserInfo(
    userInfo: Record<string, any>
  ): Promise<ComplicationTransferResult>;

  // File transfer
  transferFile(
    filePath: string,
    metadata?: Record<string, any>
  ): Promise<FileTransferInfo>;
}
