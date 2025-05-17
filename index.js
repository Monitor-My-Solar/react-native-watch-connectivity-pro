import { NativeModules, NativeEventEmitter } from 'react-native';

const { RNWatchConnectivityPro } = NativeModules;

// Event types
export const Events = {
  MESSAGE_RECEIVED: 'messageReceived',
  WATCH_STATE_UPDATED: 'watchStateUpdated',
  FILE_TRANSFER_PROGRESS: 'fileTransferProgress',
  FILE_TRANSFER_FINISHED: 'fileTransferFinished',
  FILE_TRANSFER_ERROR: 'fileTransferError',
  USER_INFO_RECEIVED: 'userInfoReceived',
  USER_INFO_TRANSFER_FINISHED: 'userInfoTransferFinished',
  ACTIVATION_ERROR: 'activationError',
  MESSAGE_QUEUE_UPDATED: 'messageQueueUpdated', // New event for queue updates
};

// Create event emitter
const eventEmitter = new NativeEventEmitter(RNWatchConnectivityPro);

export default {
  /**
   * Initialize the watch connectivity session.
   * @returns {Promise} A promise that resolves with the session state.
   */
  initSession() {
    return RNWatchConnectivityPro.initSession();
  },

  /**
   * Send a message to the watch.
   * @param {Object} message - The message to send.
   * @param {Function} replyHandler - Optional callback for handling replies.
   * @returns {Promise} A promise that resolves when the message is sent or queued.
   */
  sendMessage(message, replyHandler) {
    return RNWatchConnectivityPro.sendMessage(message, replyHandler || (() => {}))
      .catch(error => {
        // Check for explicit queued message code
        if (error && error.code === 'QUEUED') {
          console.log(`Message queued: ${error.message}`);
          // Return a successful result with queued flag
          return { 
            queued: true, 
            reason: error.message.includes('not activated') ? 'session_not_activated' : 'watch_not_reachable'
          };
        }
        
        // Also check for common error messages that indicate the message should be queued
        if (error && error.message) {
          if (error.message.includes('not reachable') || 
              error.message.includes('not activated')) {
            
            console.log(`Message queued from error handler: ${error.message}`);
            return {
              queued: true,
              reason: error.message.includes('not activated') ? 'session_not_activated' : 'watch_not_reachable'
            };
          }
        }
        
        // For real errors, re-throw so they can be handled by the caller
        throw error;
      });
  },

  /**
   * Update the application context.
   * @param {Object} context - The context to update.
   * @returns {Promise} A promise that resolves when the context is updated.
   */
  updateApplicationContext(context) {
    return RNWatchConnectivityPro.updateApplicationContext(context);
  },

  /**
   * Get the current application context.
   * @returns {Promise} A promise that resolves with the current context.
   */
  getApplicationContext() {
    return RNWatchConnectivityPro.getApplicationContext();
  },

  /**
   * Transfer user info to the watch.
   * @param {Object} userInfo - The user info to transfer.
   * @returns {Promise} A promise that resolves with the transfer details.
   */
  transferUserInfo(userInfo) {
    return RNWatchConnectivityPro.transferUserInfo(userInfo);
  },

  /**
   * Get current user info transfers.
   * @returns {Promise} A promise that resolves with the current transfers.
   */
  getCurrentUserInfo() {
    return RNWatchConnectivityPro.getCurrentUserInfo();
  },

  /**
   * Transfer a file to the watch.
   * @param {string} file - The path to the file.
   * @param {Object} metadata - Optional metadata for the file.
   * @returns {Promise} A promise that resolves with the transfer details.
   */
  transferFile(file, metadata) {
    return RNWatchConnectivityPro.transferFile(file, metadata);
  },

  /**
   * Get current file transfers.
   * @returns {Promise} A promise that resolves with the current transfers.
   */
  getFileTransfers() {
    return RNWatchConnectivityPro.getFileTransfers();
  },

  /**
   * Reply to a message received from the watch.
   * @param {string} handlerId - The handler ID.
   * @param {Object} response - The response.
   * @returns {Promise} A promise that resolves when the reply is sent.
   */
  replyToMessage(handlerId, response) {
    return RNWatchConnectivityPro.replyToMessage(handlerId, response);
  },

  /**
   * Check the watch connectivity status.
   * This will also emit a test event to verify event reception.
   * @returns {Promise} A promise that resolves with the watch state.
   */
  checkWatchConnectivityStatus() {
    return RNWatchConnectivityPro.checkWatchConnectivityStatus();
  },

  /**
   * Add a listener for watch connectivity events.
   * @param {string} eventName - The event name.
   * @param {Function} callback - The callback function.
   * @returns {Object} A subscription object with a remove method.
   */
  addListener(eventName, callback) {
    if (!Object.values(Events).includes(eventName)) {
      console.warn(`Invalid event name: ${eventName}`);
    }
    return eventEmitter.addListener(eventName, callback);
  },

  /**
   * Remove all listeners for a specific event.
   * @param {string} eventName - The event name.
   */
  removeAllListeners(eventName) {
    eventEmitter.removeAllListeners(eventName);
  },

  /**
   * Get the status of the message queue.
   * @returns {Promise<QueueStatus>} A promise that resolves with the queue status.
   */
  getQueueStatus() {
    return RNWatchConnectivityPro.getQueueStatus();
  },

  /**
   * Clear the message queue.
   * @returns {Promise<boolean>} A promise that resolves when the queue is cleared.
   */
  clearMessageQueue() {
    return RNWatchConnectivityPro.clearMessageQueue();
  },

  /**
   * Force process the message queue.
   * @returns {Promise<{processed: number}>} A promise that resolves with the number of processed messages.
   */
  processMessageQueue() {
    return RNWatchConnectivityPro.processMessageQueue();
  },

  /**
   * Check if the watch is currently reachable.
   * @returns {Promise<{isReachable: boolean, isPaired: boolean, isWatchAppInstalled: boolean}>} A promise that resolves with the reachability status.
   */
  getReachability() {
    return RNWatchConnectivityPro.getReachability();
  },

  /**
   * Add a listener for message queue update events.
   * @param {Function} callback - The callback function.
   * @returns {Object} A subscription object with a remove method.
   */
  subscribeToQueueUpdates(callback) {
    return this.addListener(Events.MESSAGE_QUEUE_UPDATED, callback);
  }
}; 