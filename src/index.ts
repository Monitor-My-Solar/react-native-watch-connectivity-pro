import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type {
  WatchState,
  MessageEvent,
  UserInfoEvent,
  FileTransferEvent,
  WatchStateEvent,
  ActivationErrorEvent,
  UserInfo,
  FileTransfer,
  ReceivedFileEvent,
  ComplicationTransferResult,
} from './types';

const LINKING_ERROR =
  `The package 'react-native-watch-connectivity-pro' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const RNWatchConnectivityPro = NativeModules.RNWatchConnectivityPro
  ? NativeModules.RNWatchConnectivityPro
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

const eventEmitter = new NativeEventEmitter(RNWatchConnectivityPro);

// Event names
export const Events = {
  MESSAGE_RECEIVED: 'messageReceived',
  WATCH_STATE_UPDATED: 'watchStateUpdated',
  FILE_TRANSFER_PROGRESS: 'fileTransferProgress',
  FILE_TRANSFER_FINISHED: 'fileTransferFinished',
  FILE_TRANSFER_ERROR: 'fileTransferError',
  FILE_RECEIVED: 'fileReceived',
  USER_INFO_RECEIVED: 'userInfoReceived',
  USER_INFO_TRANSFER_FINISHED: 'userInfoTransferFinished',
  ACTIVATION_ERROR: 'activationError',
  MESSAGE_QUEUE_UPDATED: 'messageQueueUpdated',
};

// Store for message reply handlers
const replyHandlers: { [key: string]: (response: any) => void } = {};

// Internal event for reply handlers
const INTERNAL_EVENTS = {
  MESSAGE_REPLY: 'internal_messageReply',
};

// Listen for message replies
eventEmitter.addListener(INTERNAL_EVENTS.MESSAGE_REPLY, (event) => {
  const { replyId, response } = event;
  if (replyId && replyHandlers[replyId]) {
    const handler = replyHandlers[replyId];
    // Call the handler and then remove it
    handler(response);
    delete replyHandlers[replyId];
  }
});

// Listen for messages from the watch
eventEmitter.addListener(Events.MESSAGE_RECEIVED, (event: any) => {
  // Type guard for event structure
  if (event && typeof event === 'object' && 'message' in event) {
    const { message, hasReplyHandler, handlerId } = event;
    console.log(`[WatchConnectivity] Received message from watch:`, JSON.stringify(message));
    
    // Debug log all properties to help diagnose issues
    console.log(`[WatchConnectivity] Message has reply handler:`, hasReplyHandler);
    console.log(`[WatchConnectivity] Message handler ID:`, handlerId);
    
    // Check if this message has a reply handler
    if (hasReplyHandler && handlerId) {
      // Create a wrapper function that will call our replyToMessage method
      const replyHandler = (response: { [key: string]: any }) => {
        console.log(`[WatchConnectivity] Sending reply to watch:`, JSON.stringify(response));
        RNWatchConnectivityPro.replyToMessage(handlerId, response)
          .then(() => console.log(`[WatchConnectivity] Reply sent successfully`))
          .catch((error: Error) => {
            console.error('[WatchConnectivity] Failed to send reply', error);
          });
      };
      
      // Create a modified event with our reply handler attached
      const modifiedEvent = {
        ...event,
        message,  // Ensure message is directly accessible
        replyHandler
      };
      
      // Just emit the event to the regular listeners
      eventEmitter.emit(Events.MESSAGE_RECEIVED, modifiedEvent);
    }
    // For messages without reply handlers, the standard emission already occurred
  }
});

export default {
  /**
   * Initialize the watch session
   */
  initSession(): Promise<WatchState> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    return RNWatchConnectivityPro.initSession();
  },

  /**
   * Send message to watch
   * @param message Object containing data to send
   * @param replyHandler Optional callback for reply from watch
   */
  sendMessage(
    message: { [key: string]: any },
    replyHandler?: (response: { [key: string]: any }) => void
  ): Promise<void> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    
    // Create a message payload without the reply handler
    const messagePayload = { ...message };
    
    // Check if our enhanced method is available
    if (typeof RNWatchConnectivityPro.sendMessageWithReply === 'function') {
      // If there's a reply handler, generate an ID and store it
      let replyId: string | null = null;
      if (replyHandler && typeof replyHandler === 'function') {
        replyId = `reply_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        replyHandlers[replyId] = replyHandler;
        messagePayload.__replyId = replyId;
      }
      
      // Return a promise that will be resolved when the message is sent
      return new Promise((resolve, reject) => {
        RNWatchConnectivityPro.sendMessageWithReply(messagePayload, replyId)
          .then((result: boolean) => {
            resolve();
            console.log('Message sent successfully');
          })
          .catch((error: Error) => {
            // If there was an error, clean up the reply handler
            if (replyId) {
              delete replyHandlers[replyId];
            }
            reject(error);
            console.warn('Message could not be sent');
          });
      });
    } else {
      // Fall back to original method if enhanced method is not available
      console.log('Using fallback sendMessage method');
      return new Promise((resolve, reject) => {
        try {
          RNWatchConnectivityPro.sendMessage(messagePayload, (response: any) => {
            if (replyHandler && typeof replyHandler === 'function') {
              replyHandler(response);
            }
          }, (error: Error) => {
            reject(error);
            console.warn('Message could not be sent');
          });
          resolve();
          console.log('Message sent successfully');
        } catch (error) {
          reject(error);
          console.warn('Message could not be sent');
        }
      });
    }
  },

  /**
   * Update application context
   * @param context Object containing context to update
   */
  updateApplicationContext(context: { [key: string]: any }): Promise<void> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    return RNWatchConnectivityPro.updateApplicationContext(context);
  },

  /**
   * Get current application context
   */
  getApplicationContext(): Promise<{ [key: string]: any }> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    return RNWatchConnectivityPro.getApplicationContext();
  },

  /**
   * Transfer user info
   * @param userInfo Object containing user info to transfer
   */
  transferUserInfo(userInfo: { [key: string]: any }): Promise<UserInfo> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    return RNWatchConnectivityPro.transferUserInfo(userInfo);
  },

  /**
   * Get current user info transfers
   */
  getCurrentUserInfo(): Promise<UserInfo[]> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    return RNWatchConnectivityPro.getCurrentUserInfo();
  },

  /**
   * Transfer file to watch
   * @param file Path to file to transfer
   * @param metadata Optional metadata for the file
   * @returns Promise that resolves to the file transfer object
   */
  transferFile(file: string, metadata?: { [key: string]: any }): Promise<FileTransfer> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    
    console.log(`[WatchConnectivity] Transferring file: ${file}`);
    return RNWatchConnectivityPro.transferFile(file, metadata)
      .then((transfer: FileTransfer) => {
        console.log(`[WatchConnectivity] File transfer started with ID: ${transfer.id}`);
        return transfer;
      })
      .catch((error: Error) => {
        console.error(`[WatchConnectivity] File transfer failed: ${error.message}`);
        throw error;
      });
  },

  /**
   * Get current file transfers
   * @returns Promise that resolves to an array of file transfer objects
   */
  getFileTransfers(): Promise<FileTransfer[]> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    
    console.log(`[WatchConnectivity] Getting file transfers`);
    return RNWatchConnectivityPro.getFileTransfers()
      .then((transfers: FileTransfer[]) => {
        console.log(`[WatchConnectivity] Got ${transfers.length} file transfers`);
        return transfers;
      })
      .catch((error: Error) => {
        console.error(`[WatchConnectivity] Failed to get file transfers: ${error.message}`);
        throw error;
      });
  },
  
  /**
   * Cancel a file transfer
   * @param transferId ID of the file transfer to cancel
   * @returns Promise that resolves when the transfer is canceled
   */
  cancelFileTransfer(transferId: string): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    
    console.log(`[WatchConnectivity] Cancelling file transfer: ${transferId}`);
    return RNWatchConnectivityPro.cancelFileTransfer(transferId)
      .then((result: boolean) => {
        console.log(`[WatchConnectivity] File transfer cancelled: ${transferId}`);
        return result;
      })
      .catch((error: Error) => {
        console.error(`[WatchConnectivity] Failed to cancel file transfer: ${error.message}`);
        throw error;
      });
  },

  /**
   * Reply to a message from the watch
   * @param handlerId Handler ID received with the message
   * @param response Object containing response data
   */
  replyToMessage(handlerId: string, response: { [key: string]: any }): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    return RNWatchConnectivityPro.replyToMessage(handlerId, response);
  },

  /**
   * Get the current message queue status
   * @returns Promise that resolves to the queue status
   */
  getQueueStatus(): Promise<{
    count: number;
    isProcessing: boolean;
    oldestMessage: number;
    newestMessage: number;
  }> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    return RNWatchConnectivityPro.getQueueStatus();
  },

  /**
   * Process the message queue
   * @returns Promise that resolves when the queue is processed
   */
  processMessageQueue(): Promise<{ processed: number }> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    return RNWatchConnectivityPro.processMessageQueue();
  },

  /**
   * Clear the message queue
   * @returns Promise that resolves when the queue is cleared
   */
  clearMessageQueue(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return Promise.reject(new Error('Watch connectivity is only available on iOS'));
    }
    return RNWatchConnectivityPro.clearMessageQueue();
  },

  /**
   * Check if the watch's complication is enabled for this app
   * @returns {Promise<boolean>} Returns true if the app's complication is enabled on the watch face
   */
  isComplicationEnabled(): Promise<boolean> {
    return RNWatchConnectivityPro.isComplicationEnabled();
  },

  /**
   * Get the number of remaining complication user info transfers
   * Apple limits how many times per day you can update complications
   * @returns {Promise<number>} The number of remaining transfers allowed today
   */
  getRemainingComplicationTransfers(): Promise<number> {
    return RNWatchConnectivityPro.getRemainingComplicationTransfers();
  },

  /**
   * Transfer data to update the watch complication
   * This is a high-priority transfer intended specifically for updating
   * the app's complication on the watch face
   * 
   * @param {object} userInfo Data to send to the complication
   * @returns {Promise<ComplicationTransferResult>} Information about the transfer
   */
  transferCurrentComplicationUserInfo(userInfo: Record<string, any>): Promise<ComplicationTransferResult> {
    return RNWatchConnectivityPro.transferCurrentComplicationUserInfo(userInfo);
  },

  /**
   * Add listener for watch connectivity events
   * @param eventName Name of event to listen for
   * @param listener Function to call when event occurs
   */
  addListener(
    eventName: string,
    listener: (
      event:
        | MessageEvent
        | UserInfoEvent
        | FileTransferEvent
        | WatchStateEvent
        | ActivationErrorEvent
        | ReceivedFileEvent
    ) => void
  ) {
    // For message received events, we need to handle reply handlers specially
    if (eventName === Events.MESSAGE_RECEIVED) {
      return eventEmitter.addListener(eventName, (event: any) => {
        // Check if this message has a reply handler
        if (event.hasReplyHandler && event.handlerId) {
          // Create a wrapper function that will call our replyToMessage method
          const replyHandler = (response: { [key: string]: any }) => {
            this.replyToMessage(event.handlerId, response)
              .catch(err => {
                console.error('Failed to send reply', err);
              });
          };
          
          // Attach the reply handler to the event
          const modifiedEvent = {
            ...event,
            replyHandler
          };
          
          // Pass the modified event to the listener
          listener(modifiedEvent);
        } else {
          // No reply handler, just pass the event as is
          listener(event);
        }
      });
    }
    
    // For other event types, just pass through
    return eventEmitter.addListener(eventName, listener);
  },

  /**
   * Remove listener for watch connectivity events
   * @param eventName Name of event to remove listener for
   */
  removeAllListeners(eventName: string) {
    eventEmitter.removeAllListeners(eventName);
  },
};

export * from './types'; 