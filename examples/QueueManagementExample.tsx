import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  NativeModules,
  NativeEventEmitter,
  ScrollView,
  Alert,
} from 'react-native';

// Import the WatchConnectivity service
const RNWatchConnectivityPro = NativeModules.RNWatchConnectivityPro;
const eventEmitter = new NativeEventEmitter(RNWatchConnectivityPro);

/**
 * QueueManagementExample - A comprehensive example demonstrating the queue management
 * capabilities of the react-native-watch-connectivity-pro library.
 */
const QueueManagementExample = () => {
  const [isWatchReachable, setIsWatchReachable] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [queueStatus, setQueueStatus] = useState({
    count: 0,
    isProcessing: false,
    oldestMessage: null,
    newestMessage: null,
  });
  const [history, setHistory] = useState<string[]>([]);

  // Add a log entry to the history
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setHistory((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  };

  // Initialize watch connectivity and set up event listeners
  useEffect(() => {
    const initWatchConnectivity = async () => {
      try {
        // Initialize session and get initial status
        const sessionState = await RNWatchConnectivityPro.initSession();
        setIsWatchReachable(sessionState.isReachable);
        setIsPaired(sessionState.isPaired);
        
        addLog(`Watch connectivity initialized: ` +
          `isPaired=${sessionState.isPaired}, ` + 
          `isReachable=${sessionState.isReachable}`);
        
        // Check queue status on startup
        await checkQueueStatus();
      } catch (error) {
        addLog(`Error initializing watch connectivity: ${error}`);
      }
    };

    initWatchConnectivity();

    // Set up listener for watch state changes
    const watchStateSubscription = eventEmitter.addListener(
      'watchStateUpdated',
      (event) => {
        setIsWatchReachable(event.isReachable);
        setIsPaired(event.isPaired);
        
        addLog(`Watch state changed: isPaired=${event.isPaired}, isReachable=${event.isReachable}`);
        
        // If watch becomes reachable, check queue status
        if (event.isReachable) {
          checkQueueStatus();
        }
      }
    );

    // Set up listener for message reception
    const messageSubscription = eventEmitter.addListener(
      'messageReceived',
      (event) => {
        addLog(`Received message from watch: ${JSON.stringify(event.message)}`);
      }
    );

    // Set up listener for queue updates
    const queueUpdateSubscription = eventEmitter.addListener(
      'queueProcessingUpdate',
      (event) => {
        const { status, processed } = event;
        
        if (status === 'started') {
          addLog('Queue processing started');
        } else if (status === 'completed') {
          addLog(`Queue processing completed. Processed ${processed} messages`);
          // Refresh queue status after processing
          checkQueueStatus();
        }
      }
    );

    return () => {
      watchStateSubscription.remove();
      messageSubscription.remove();
      queueUpdateSubscription.remove();
    };
  }, []);

  // Send a test message to the watch
  const sendTestMessage = async () => {
    try {
      const result = await RNWatchConnectivityPro.sendMessage({
        type: 'TEST_MESSAGE',
        message: `Test message sent at ${new Date().toLocaleTimeString()}`,
        timestamp: Date.now() / 1000,
      });
      
      if (result && result.queued) {
        addLog(`Message queued for later delivery. Reason: ${result.reason}`);
      } else {
        addLog('Message sent successfully to watch');
      }
      
      // Refresh queue status after sending
      await checkQueueStatus();
    } catch (error) {
      addLog(`Error sending message: ${error}`);
    }
  };

  // Check the status of the message queue
  const checkQueueStatus = async () => {
    try {
      const status = await RNWatchConnectivityPro.getQueueStatus();
      setQueueStatus(status);
      
      if (status.count > 0) {
        addLog(`Queue status: ${status.count} messages queued`);
        
        if (status.oldestMessage) {
          const oldestTime = new Date(status.oldestMessage.timestamp * 1000).toLocaleTimeString();
          addLog(`Oldest message queued at: ${oldestTime}`);
        }
      } else {
        addLog('Queue is empty');
      }
      
      return status;
    } catch (error) {
      addLog(`Error checking queue status: ${error}`);
      return null;
    }
  };

  // Process the message queue
  const processQueue = async () => {
    try {
      // First check if there's anything to process
      const status = await checkQueueStatus();
      
      if (!status || status.count === 0) {
        Alert.alert('No Messages', 'There are no messages in the queue to process.');
        return;
      }
      
      if (!isWatchReachable) {
        Alert.alert(
          'Watch Not Reachable', 
          'The watch is not reachable. Messages cannot be processed until the watch is available.'
        );
        return;
      }
      
      const result = await RNWatchConnectivityPro.processMessageQueue();
      addLog(`Processed ${result.processed} queued messages`);
      
      // Refresh queue status after processing
      await checkQueueStatus();
    } catch (error) {
      addLog(`Error processing queue: ${error}`);
    }
  };

  // Clear the message queue
  const clearQueue = async () => {
    try {
      // First check if there's anything to clear
      const status = await checkQueueStatus();
      
      if (!status || status.count === 0) {
        Alert.alert('No Messages', 'There are no messages in the queue to clear.');
        return;
      }
      
      // Ask for confirmation before clearing
      Alert.alert(
        'Clear Queue',
        `Are you sure you want to clear ${status.count} queued messages?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Clear',
            onPress: async () => {
              const result = await RNWatchConnectivityPro.clearMessageQueue();
              addLog(`Message queue cleared. Removed ${result.cleared || 0} messages`);
              
              // Refresh queue status after clearing
              await checkQueueStatus();
            },
          },
        ]
      );
    } catch (error) {
      addLog(`Error clearing queue: ${error}`);
    }
  };

  // Send 5 test messages in rapid succession
  const sendMultipleMessages = async () => {
    try {
      addLog('Sending 5 messages in rapid succession...');
      
      for (let i = 1; i <= 5; i++) {
        await RNWatchConnectivityPro.sendMessage({
          type: 'BULK_TEST',
          message: `Bulk test message ${i} of 5`,
          timestamp: Date.now() / 1000,
          index: i,
        });
      }
      
      addLog('5 messages sent/queued');
      
      // Refresh queue status after sending
      await checkQueueStatus();
    } catch (error) {
      addLog(`Error sending multiple messages: ${error}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Queue Management Example</Text>
      
      {/* Watch Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Watch Status: {isPaired ? 'Paired' : 'Not Paired'} 
          {isPaired ? ` / ${isWatchReachable ? 'Reachable' : 'Not Reachable'}` : ''}
        </Text>
        <Text style={styles.queueText}>
          Queue: {queueStatus.count} {queueStatus.count === 1 ? 'message' : 'messages'}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={sendTestMessage}>
          <Text style={styles.buttonText}>Send Test Message</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={sendMultipleMessages}>
          <Text style={styles.buttonText}>Send 5 Messages</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.secondaryButton]}
          onPress={checkQueueStatus}
        >
          <Text style={styles.buttonText}>Check Queue Status</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.secondaryButton]}
          onPress={processQueue}
          disabled={!isWatchReachable || queueStatus.count === 0}
        >
          <Text style={[
            styles.buttonText,
            (!isWatchReachable || queueStatus.count === 0) && styles.disabledText
          ]}>
            Process Queue
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.warningButton]}
          onPress={clearQueue}
          disabled={queueStatus.count === 0}
        >
          <Text style={[
            styles.buttonText,
            queueStatus.count === 0 && styles.disabledText
          ]}>
            Clear Queue
          </Text>
        </TouchableOpacity>
      </View>

      {/* Log History */}
      <View style={styles.logContainer}>
        <Text style={styles.logTitle}>Event Log:</Text>
        <ScrollView style={styles.logScrollView}>
          {history.map((log, index) => (
            <Text key={index} style={styles.logText}>
              {log}
            </Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F5F5F5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  statusContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  queueText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    width: '48%',
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#5AC8FA',
  },
  warningButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  disabledText: {
    opacity: 0.5,
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  logTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  logScrollView: {
    flex: 1,
  },
  logText: {
    fontSize: 12,
    fontFamily: 'Menlo',
    marginBottom: 4,
  },
});

export default QueueManagementExample; 