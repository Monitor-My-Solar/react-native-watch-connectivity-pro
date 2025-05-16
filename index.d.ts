declare module 'react-native-watch-connectivity-pro' {
  export interface WatchState {
    isPaired: boolean;
    isReachable: boolean;
    isWatchAppInstalled: boolean;
    isComplicationEnabled?: boolean;
    sessionState: 'NotActivated' | 'Inactive' | 'Activated' | 'Unknown';
    lastStateChange: number;
    queuedMessages: number;
  }

  export interface UserInfoTransfer {
    id: string;
    data: Record<string, any>;
  }

  export interface FileTransfer {
    id: string;
    file: string;
    metadata?: Record<string, any>;
    progress: number;
  }

  export interface QueueStatus {
    count: number;
    isProcessing: boolean;
    oldestMessage: number;
    newestMessage: number;
  }

  export type MessageQueueUpdateEvent = {
    count: number;
    isProcessing: boolean;
    oldestMessage: number;
    newestMessage: number;
  };

  export type SendMessageResult = {
    queued?: boolean;
    reason?: 'session_not_activated' | 'watch_not_reachable';
  };

  interface RNWatchConnectivityProStatic {
    /**
     * Initialize the watch connectivity session.
     * @returns A promise that resolves with the current watch state.
     */
    initSession(): Promise<WatchState>;

    /**
     * Send a message to the watch.
     * @param message Message object to send.
     * @param replyHandler Optional callback for handling replies.
     * @returns A promise that resolves when the message is sent or queued.
     */
    sendMessage(
      message: Record<string, any>,
      replyHandler?: (reply: Record<string, any>) => void
    ): Promise<SendMessageResult>;

    /**
     * Reply to a message received from the watch.
     * @param handlerId ID of the reply handler.
     * @param response Response object to send.
     * @returns A promise that resolves when the reply is sent.
     */
    replyToMessage(
      handlerId: string,
      response: Record<string, any>
    ): Promise<boolean>;

    /**
     * Update the application context.
     * @param context Context object to update.
     * @returns A promise that resolves when the context is updated.
     */
    updateApplicationContext(context: Record<string, any>): Promise<void>;

    /**
     * Get the current application context.
     * @returns A promise that resolves with the current application context.
     */
    getApplicationContext(): Promise<Record<string, any>>;

    /**
     * Transfer user info to the watch.
     * @param userInfo User info object to transfer.
     * @returns A promise that resolves with the transfer details.
     */
    transferUserInfo(userInfo: Record<string, any>): Promise<UserInfoTransfer>;

    /**
     * Get the current user info transfers.
     * @returns A promise that resolves with the current user info transfers.
     */
    getCurrentUserInfo(): Promise<UserInfoTransfer[]>;

    /**
     * Transfer a file to the watch.
     * @param file Path to the file to transfer.
     * @param metadata Optional metadata for the file.
     * @returns A promise that resolves with the transfer details.
     */
    transferFile(
      file: string,
      metadata?: Record<string, any>
    ): Promise<FileTransfer>;

    /**
     * Get the current file transfers.
     * @returns A promise that resolves with the current file transfers.
     */
    getFileTransfers(): Promise<FileTransfer[]>;

    /**
     * Check the watch connectivity status.
     * @returns A promise that resolves with the current watch state.
     */
    checkWatchConnectivityStatus(): Promise<WatchState>;

    /**
     * Get the status of the message queue.
     * @returns A promise that resolves with the queue status.
     */
    getQueueStatus(): Promise<QueueStatus>;

    /**
     * Clear the message queue.
     * @returns A promise that resolves when the queue is cleared.
     */
    clearMessageQueue(): Promise<boolean>;

    /**
     * Force process the message queue.
     * @returns A promise that resolves with the number of processed messages.
     */
    processMessageQueue(): Promise<{ processed: number }>;
  }

  const RNWatchConnectivityPro: RNWatchConnectivityProStatic;
  export default RNWatchConnectivityPro;
} 