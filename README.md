# React Native Watch Connectivity Pro

[![npm](https://img.shields.io/npm/v/react-native-watch-connectivity-pro.svg)](https://www.npmjs.com/package/react-native-watch-connectivity-pro)
[![npm](https://img.shields.io/npm/dm/react-native-watch-connectivity-pro.svg)](https://www.npmjs.com/package/react-native-watch-connectivity-pro)

A React Native library for seamless communication between iOS apps and Apple Watch applications.

## Features

- Two-way messaging between iPhone and Apple Watch
- Application context synchronization
- Reliable file transfers with progress tracking
- Complication data updates
- Session state monitoring (reachability, etc.)
- Automatic message queuing when watch is unavailable
- Support for handling responses from the watch
- Robust error handling & recovery
- Comprehensive TypeScript definitions
- Queue management API for monitoring and controlling message delivery

## Current Status

This package works for basic messaging between React Native iOS apps and Apple Watch. The following features are currently working:

- ✅ Session initialization and activation
- ✅ Sending messages from phone to watch 
- ✅ Receiving messages from watch to phone
- ✅ Application context synchronization
- ✅ Session state monitoring
- ✅ Message queueing when watch is unavailable
- ✅ Automatic queue processing when watch becomes available
- ✅ Queue management (status checking, manual processing, clearing)

See [TODO.md](./TODO.md) for a complete overview of implemented and planned features.

## Installation

```sh
npm install react-native-watch-connectivity-pro
# or
yarn add react-native-watch-connectivity-pro
```

### iOS

```sh
cd ios && pod install
```

## Setup Requirements

1. **Create a watchOS App Extension**
   Your iOS app must include a watchOS app extension. See Apple's documentation on [Creating a watchOS App](https://developer.apple.com/documentation/watchkit/creating_a_watchos_app).

2. **App Groups**
   Configure app groups for your main app and watch extension to share data. See [Configuring App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups).

3. **Initialize Early in App Lifecycle**
   For best results, initialize the connectivity service early in your app's lifecycle, ideally in your main App.js/App.tsx file.

4. **Use NativeEventEmitter**
   Always use React Native's NativeEventEmitter to set up event listeners.

## Usage

### Initializing the Watch Connectivity Service

```tsx
import React, { useEffect } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import WatchConnectivity from 'react-native-watch-connectivity-pro';

function App() {
  useEffect(() => {
    // Initialize watch connectivity early in the app lifecycle
    const initWatchConnectivity = async () => {
      try {
        const status = await WatchConnectivity.initSession();
        console.log('Watch connectivity initialized:', status);
      } catch (error) {
        console.error('Failed to initialize watch connectivity:', error);
      }
    };
    
    initWatchConnectivity();
    
    // Set up event listeners using NativeEventEmitter
    const eventEmitter = new NativeEventEmitter(NativeModules.RNWatchConnectivityPro);
    
    const messageSubscription = eventEmitter.addListener(
      'messageReceived',
      (event) => {
        console.log('Received message from watch:', event.message);
      }
    );
    
    // Listen for queue updates
    const queueUpdateSubscription = eventEmitter.addListener(
      'messageQueueUpdated',
      (queueStatus) => {
        console.log('Message queue updated:', queueStatus);
      }
    );
    
    return () => {
      // Clean up subscriptions
      messageSubscription.remove();
      queueUpdateSubscription.remove();
    };
  }, []);
  
  // Rest of your app
  return (
    // ...
  );
}
```

### Sending Messages to Watch

```tsx
// Send a simple message to the watch
const sendMessageToWatch = async () => {
  try {
    const result = await WatchConnectivity.sendMessage(
      { 
        type: 'test',
        message: 'Hello from React Native!',
        timestamp: Date.now() / 1000
      },
      (response) => {
        console.log('Watch replied:', response);
      }
    );
    
    // Check if the message was queued (watch unavailable)
    if (result && result.queued) {
      console.log(`Message queued for later delivery. Reason: ${result.reason}`);
    } else {
      console.log('Message sent successfully');
    }
  } catch (error) {
    console.error('Failed to send message:', error);
  }
};
```

### Receiving Messages from Watch

```tsx
// Using the NativeEventEmitter
const eventEmitter = new NativeEventEmitter(NativeModules.RNWatchConnectivityPro);

// Listen for messages from the watch
const messageSubscription = eventEmitter.addListener(
  'messageReceived',
  (event) => {
    // Check if the message has a reply handler
    if (event.hasReplyHandler && event.handlerId) {
      // Get the message content
      const message = event.message;
      console.log('Received message from watch:', message);
      
      // Reply to the watch if needed
      WatchConnectivity.replyToMessage(
        event.handlerId,
        { 
          acknowledged: true,
          message: 'Message received!',
          timestamp: Date.now() / 1000
        }
      ).then(() => {
        console.log('Reply sent successfully');
      }).catch(error => {
        console.error('Failed to send reply:', error);
      });
    } else {
      // Process message without reply handler
      console.log('Received message from watch (no reply):', event.message);
    }
  }
);

// Don't forget to remove the listener when not needed
// messageSubscription.remove();
```

### Managing the Message Queue

When the watch is not reachable, messages are automatically queued for later delivery. The queue is automatically processed when the watch becomes reachable again, but you can also manually manage this queue and monitor its status:

```tsx
// Get the current queue status
const checkQueueStatus = async () => {
  try {
    const status = await WatchConnectivity.getQueueStatus();
    console.log('Queue status:', status);
    // status contains: { count, isProcessing, oldestMessage, newestMessage }
    // Example: { count: 3, isProcessing: false, oldestMessage: {...}, newestMessage: {...} }
    
    if (status.count > 0) {
      // There are messages queued waiting to be delivered
      console.log(`${status.count} messages waiting for watch to become available`);
      console.log(`Oldest message queued at: ${new Date(status.oldestMessage.timestamp * 1000)}`);
    }
  } catch (error) {
    console.error('Failed to get queue status:', error);
  }
};

// Manually process the queue (normally happens automatically when watch becomes available)
const processQueue = async () => {
  try {
    const result = await WatchConnectivity.processMessageQueue();
    console.log(`Processed ${result.processed} queued messages`);
    
    if (result.processed === 0 && result.reason) {
      // Check why no messages were processed
      console.log(`No messages processed. Reason: ${result.reason}`);
      // Possible reasons: "WATCH_NOT_REACHABLE", "NO_MESSAGES_QUEUED", etc.
    }
  } catch (error) {
    console.error('Failed to process queue:', error);
  }
};

// Clear the message queue
const clearQueue = async () => {
  try {
    const result = await WatchConnectivity.clearMessageQueue();
    console.log(`Message queue cleared. Removed ${result.cleared || 0} messages`);
  } catch (error) {
    console.error('Failed to clear queue:', error);
  }
};
```

### Detecting Watch Reachability and Queue Processing

You can monitor watch reachability and queue processing status to update your UI accordingly:

```tsx
useEffect(() => {
  // Initialize the watch connectivity service
  const initWatchConnectivity = async () => {
    try {
      const isReachable = await WatchConnectivity.initSession();
      setIsWatchReachable(isReachable);
      
      // If watch is reachable, check if there are queued messages to process
      if (isReachable) {
        const queueStatus = await WatchConnectivity.getQueueStatus();
        if (queueStatus.count > 0) {
          console.log(`Found ${queueStatus.count} queued messages, processing...`);
          await WatchConnectivity.processMessageQueue();
        }
      }
    } catch (error) {
      console.error('Failed to initialize watch connectivity:', error);
    }
  };
  
  initWatchConnectivity();
  
  // Listen for watch reachability changes
  const eventEmitter = new NativeEventEmitter(NativeModules.RNWatchConnectivityPro);
  
  const watchStateSubscription = eventEmitter.addListener(
    'watchStateUpdated',
    (event) => {
      const { isReachable, isPaired, isComplicationEnabled } = event;
      setIsWatchReachable(isReachable);
      
      // Watch just became reachable - the library will automatically
      // process any queued messages, but you can also handle it yourself
      if (isReachable) {
        console.log('Watch is now reachable, messages will be delivered');
      } else {
        console.log('Watch is not reachable, messages will be queued');
      }
    }
  );
  
  // Listen for queue processing events
  const queueProcessingSubscription = eventEmitter.addListener(
    'queueProcessingUpdate',
    (event) => {
      const { status, processed } = event;
      
      if (status === 'started') {
        console.log('Queue processing started');
        setIsProcessingQueue(true);
      } else if (status === 'completed') {
        console.log(`Queue processing completed. Processed ${processed} messages`);
        setIsProcessingQueue(false);
      } else if (status === 'failed') {
        console.log(`Queue processing failed: ${event.error}`);
        setIsProcessingQueue(false);
      }
    }
  );
  
  return () => {
    watchStateSubscription.remove();
    queueProcessingSubscription.remove();
  };
}, []);
```

### Best Practices for Message Queueing

1. **Message Format**: When sending messages, always include a timestamp and message type for easier management:

```tsx
await WatchConnectivity.sendMessage({
  type: 'DATA_UPDATE', 
  payload: yourData,
  timestamp: Date.now() / 1000
});
```

2. **Prioritize Important Messages**: While all messages are queued in order, you can clear the queue and send only the most recent/important message when reconnecting:

```tsx
// When sending a new critical message that supersedes previous ones
const sendCriticalUpdate = async (data) => {
  try {
    // Get queue status first
    const status = await WatchConnectivity.getQueueStatus();
    
    // If there are queued messages of the same type, clear them
    if (status.count > 0) {
      // Optional: inspect the queue to see if there are old messages of same type
      const shouldClear = status.oldestMessage?.type === 'CRITICAL_UPDATE';
      
      if (shouldClear) {
        await WatchConnectivity.clearMessageQueue();
        console.log('Cleared outdated messages from queue');
      }
    }
    
    // Now send the latest critical update
    const result = await WatchConnectivity.sendMessage({
      type: 'CRITICAL_UPDATE',
      payload: data,
      timestamp: Date.now() / 1000
    });
    
    console.log('Critical update sent or queued:', result);
  } catch (error) {
    console.error('Failed to send critical update:', error);
  }
};
```

3. **Handling Long-Disconnected Watches**: If your app needs to handle scenarios where the watch might be disconnected for extended periods:

```tsx
const syncWithWatch = async () => {
  try {
    // Check watch state first
    const watchState = await WatchConnectivity.getSessionState();
    
    if (!watchState.isPaired) {
      // Watch is not paired at all - nothing to do
      console.log('No watch paired with this iPhone');
      return;
    }
    
    if (!watchState.isReachable) {
      // Watch is paired but not reachable
      console.log('Watch is paired but not reachable');
      
      // Check queue status
      const queueStatus = await WatchConnectivity.getQueueStatus();
      
      if (queueStatus.count > 10) {
        // Too many queued messages, consider clearing old ones
        console.log('Queue has too many messages, clearing old messages');
        await WatchConnectivity.clearMessageQueue();
        
        // Send only the latest app state instead
        await WatchConnectivity.updateApplicationContext({
          lastSyncTime: Date.now() / 1000,
          criticalData: getLatestAppData(),
          syncStatus: 'QUEUE_CLEARED_RESYNCING'
        });
        
        console.log('Updated application context with latest state');
      }
    } else {
      // Watch is reachable, we can send messages normally
      console.log('Watch is reachable, sending updates');
      // Regular message sending...
    }
  } catch (error) {
    console.error('Error during watch sync:', error);
  }
};
```

### Application Context

```tsx
// Update application context
const updateContext = async () => {
  try {
    await WatchConnectivity.updateApplicationContext({
  currentScreen: 'home',
  lastUpdated: Date.now(),
  userSettings: { theme: 'dark', notifications: true }
    });
    console.log('Context updated successfully');
  } catch (error) {
    console.error('Failed to update context:', error);
  }
};

// Get current application context
const getContext = async () => {
  try {
    const context = await WatchConnectivity.getApplicationContext();
    console.log('Current context:', context);
  } catch (error) {
    console.error('Failed to get context:', error);
  }
};
```

### Watch Complications

Complications allow your app to display information directly on the Apple Watch face. The WatchConnectivity framework provides methods to update complications with high-priority transfers.

```javascript
// Check if your app's complication is enabled on any watch face
const isEnabled = await WatchConnectivity.isComplicationEnabled();

// Check how many updates you have left for the day
// Apple limits the number of updates per day to preserve battery life
const remainingTransfers = await WatchConnectivity.getRemainingComplicationTransfers();

// Update the complication with new data
// This is delivered with higher priority than regular messages
const result = await WatchConnectivity.transferCurrentComplicationUserInfo({
  value: 75,           // Display value
  unit: 'kW',          // Display unit
  trend: 'up',         // Trend direction
  timestamp: Date.now() // When the data was updated
});

// The result contains:
// {
//   id: '1234-5678-...',              // Unique transfer ID
//   timestamp: 1234567890,            // When the transfer was initiated
//   isCurrentComplicationInfo: true,  // Confirmation this is a complication update
//   userInfo: {...}                   // The data you sent
// }
```

Your WatchKit app will need to implement the proper delegate methods to receive these updates and refresh the complication:

```swift
// In your ComplicationController.swift (watchOS app)
func getComplicationDescriptors(handler: @escaping ([CLKComplicationDescriptor]) -> Void) {
    // List all your complications here
    let descriptors = [
        CLKComplicationDescriptor(identifier: "com.yourapp.complication", 
                                 displayName: "YourApp", 
                                 supportedFamilies: [.modularSmall, .graphicCircular])
    ]
    handler(descriptors)
}

// In your ExtensionDelegate.swift (watchOS app)
func didReceiveComplicationUserInfo(_ userInfo: [String : Any]) {
    // Request an update for all complications
    let server = CLKComplicationServer.sharedInstance()
    for complication in server.activeComplications ?? [] {
        server.reloadTimeline(for: complication)
    }
}
```

## API Reference

### Watch Connectivity Service

```javascript
import { WatchConnectivity } from 'react-native-watch-connectivity-pro';

// Initialize connection
const isAvailable = await WatchConnectivity.isAvailable();

// Send a message
await WatchConnectivity.sendMessage({ 
  command: 'update',
  value: 42
});

// Update application context
await WatchConnectivity.updateApplicationContext({
  lastUpdated: Date.now(),
  settings: { ... }
});

// Transfer file
const fileTransfer = await WatchConnectivity.transferFile(
  '/path/to/file.jpg',
  { type: 'image', timestamp: Date.now() }
);

// Watch complications
const isEnabled = await WatchConnectivity.isComplicationEnabled();
const remaining = await WatchConnectivity.getRemainingComplicationTransfers();
await WatchConnectivity.transferCurrentComplicationUserInfo({
  value: 75,
  unit: 'kW', 
  timestamp: Date.now()
});
```

## Common Issues & Troubleshooting

### Messages not being received

If you're sending messages from the watch but not receiving them in your React Native app:

1. Ensure you're using the `NativeEventEmitter` and not directly calling `addListener` on the module
2. Initialize the watch connectivity early in your app lifecycle
3. Make sure the delegate methods are properly implemented in the native module (they are in this package)
4. Check that your watch app is properly sending messages

### Handling Intermittent Connectivity

This library handles intermittent connectivity automatically by:

1. Queueing messages when the watch is not reachable
2. Automatically sending queued messages when the watch becomes reachable
3. Providing APIs to monitor and manage the queue

To handle watch connectivity changes in your UI:

```tsx
// Listen for watch state changes
const watchStateSubscription = eventEmitter.addListener(
  'watchStateUpdated',
  (event) => {
    const { watchState } = event;
    console.log('Watch state changed:', watchState);
    
    // Update UI based on watch state
    if (watchState.isReachable) {
      // Show "Connected" status
    } else {
      // Show "Disconnected" status
    }
    
    // Check if there are queued messages
    if (watchState.queuedMessages > 0) {
      console.log(`${watchState.queuedMessages} messages queued`);
    }
  }
);
```

### Session not activating

If the session isn't activating properly:

1. Make sure both the iOS app and Watch app are installed and paired
2. The Watch app must be installed from the app running on the phone
3. Check watch reachability status before sending messages

## License

MIT 