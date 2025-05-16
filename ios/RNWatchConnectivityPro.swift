import Foundation
import WatchConnectivity
import React

// Define the missing enum for log levels
enum LogLevel {
    case debug
    case info
    case warning
    case error
}

// Define error types
enum RNWCError: Error {
    case sessionNotActive
    case notSupported
    case fileNotFound
    
    var code: String {
        switch self {
        case .sessionNotActive:
            return "SESSION_NOT_ACTIVE"
        case .notSupported:
            return "NOT_SUPPORTED"
        case .fileNotFound:
            return "FILE_NOT_FOUND"
        }
    }
    
    var localizedDescription: String {
        switch self {
        case .sessionNotActive:
            return "Watch session is not activated"
        case .notSupported:
            return "This feature is not supported on this device"
        case .fileNotFound:
            return "File not found"
        }
    }
}

@objc(RNWatchConnectivityPro)
class RNWatchConnectivityPro: RCTEventEmitter {
    
    private var session: WCSession?
    private var hasListeners = false
    private var transferIds = [String: String]() // Map to store transfer IDs
    private var replyHandlers = [String: RCTResponseSenderBlock]() // Map to store reply handlers
    private let logFileName = "watch_connectivity.log"
    
    // Message queue for background and offline messaging
    private var messageQueue: [[String: Any]] = [] // Queue of messages waiting to be sent
    private var isProcessingQueue = false // Flag to prevent concurrent queue processing
    private var lastWatchStateChange = Date().timeIntervalSince1970
    
    // New property for file transfers
    private var fileTransfers = [String: WCSessionFileTransfer]()
    private var progressObservations = [String: NSKeyValueObservation]()
    
    // Add missing log function
    private func log(_ level: LogLevel, _ message: String) {
        // Prefix based on log level
        let prefix = switch level {
        case .debug:
            "🔍 DEBUG: "
        case .info:
            "ℹ️ INFO: "
        case .warning:
            "⚠️ WARNING: "
        case .error:
            "❌ ERROR: "
        }
        
        // Use our existing logToFile function
        logToFile(prefix + message)
    }
    
    override init() {
        super.init()
        if WCSession.isSupported() {
            session = WCSession.default
            session?.delegate = self
            // Activate the session immediately instead of waiting for JS to call initSession
            session?.activate()
            logToFile("📱 [RNWatchConnectivityPro] WCSession activated during initialization")
        }
    }
    
    // MARK: - React Native Event Emitter Requirements
    
    @objc
    override func supportedEvents() -> [String] {
        return [
            "messageReceived",
            "watchStateUpdated",
            "fileTransferProgress",
            "fileTransferFinished",
            "fileTransferError",
            "userInfoReceived",
            "userInfoTransferFinished",
            "activationError",
            "internal_messageReply",
            "messageQueueUpdated", // New event for queue updates
            "fileReceived" // New event for file received
        ]
    }
    
    @objc
    override func startObserving() {
        hasListeners = true
    }
    
    @objc
    override func stopObserving() {
        hasListeners = false
    }
    
    // MARK: - Module Methods
    
    @objc(initSession:reject:)
    func initSession(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard WCSession.isSupported() else {
            reject("ERR_WATCH_CONNECTIVITY_NOT_SUPPORTED", "Watch connectivity is not supported on this device", nil)
            return
        }
        
        guard let session = session else {
            reject("ERR_WATCH_SESSION_NULL", "Watch session is null", nil)
            return
        }
        
        if session.activationState != .activated {
            session.activate()
        }
        
        resolve(getSessionState())
    }
    
    @objc(sendMessage:replyHandler:reject:)
    func sendMessage(_ message: [String: Any], replyHandler: @escaping RCTResponseSenderBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let session = session, session.activationState == .activated else {
            logToFile("📱 [RNWatchConnectivityPro] Cannot send message - session not activated, queueing")
            queueMessage(message, withReplyHandler: replyHandler)
            // Return a special error code that can be handled by the JS layer
            reject("QUEUED", "Watch session is not activated, message queued", nil)
            return
        }
        
        guard session.isReachable else {
            logToFile("📱 [RNWatchConnectivityPro] Watch not reachable, queueing message")
            queueMessage(message, withReplyHandler: replyHandler)
            // Return a special error code that can be handled by the JS layer
            reject("QUEUED", "Apple Watch is not reachable, message queued", nil)
            return
        }
        
        // Generate a unique ID for this message
        let messageId = UUID().uuidString
        
        // Store the replyHandler with the messageId
        replyHandlers[messageId] = replyHandler
        
        logToFile("📱 [RNWatchConnectivityPro] Sending message: \(message)")
        
        // Send the message without including the actual replyHandler function
        session.sendMessage(message, replyHandler: { [weak self] reply in
            guard let self = self else { return }
            
            self.logToFile("📱 [RNWatchConnectivityPro] Received reply for message: \(reply)")
            
            // Retrieve the reply handler using the messageId
            if let handler = self.replyHandlers[messageId] {
                handler([reply])
                // Remove the handler after use
                self.replyHandlers.removeValue(forKey: messageId)
            }
        }, errorHandler: { [weak self] error in
            // Clean up stored handler if there's an error
            self?.replyHandlers.removeValue(forKey: messageId)
            self?.logToFile("❌ [RNWatchConnectivityPro] Error sending message: \(error.localizedDescription)")
            reject("ERR_WATCH_MESSAGE_FAILED", error.localizedDescription, error)
        })
    }
    
    // New API: Get queue status
    @objc(getQueueStatus:reject:)
    func getQueueStatus(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let status: [String: Any] = [
            "count": messageQueue.count,
            "isProcessing": isProcessingQueue,
            "oldestMessage": messageQueue.first?["__queuedAt"] as? TimeInterval ?? 0,
            "newestMessage": messageQueue.last?["__queuedAt"] as? TimeInterval ?? 0
        ]
        
        logToFile("📱 [RNWatchConnectivityPro] Queue status: \(status)")
        resolve(status)
    }
    
    // New API: Clear message queue
    @objc(clearMessageQueue:reject:)
    func clearMessageQueue(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        // Clean up any stored reply handlers for queued messages
        for message in messageQueue {
            if let handlerId = message["__handlerId"] as? String {
                replyHandlers.removeValue(forKey: handlerId)
            }
        }
        
        let count = messageQueue.count
        messageQueue.removeAll()
        logToFile("📱 [RNWatchConnectivityPro] Cleared message queue (\(count) messages)")
        
        sendQueueUpdateEvent()
        resolve(true)
    }
    
    // New API: Force process queue
    @objc(processMessageQueue:reject:)
    func processMessageQueue(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        logToFile("📱 [RNWatchConnectivityPro] Manually triggering queue processing")
        let processed = processMessageQueueInternal()
        resolve(["processed": processed])
    }
    
    @objc(updateApplicationContext:reject:)
    func updateApplicationContext(_ context: [String: Any], reject: @escaping RCTPromiseRejectBlock) {
        guard let session = session, session.activationState == .activated else {
            reject("ERR_WATCH_SESSION_NOT_ACTIVATED", "Watch session is not activated", nil)
            return
        }
        
        do {
            try session.updateApplicationContext(context)
        } catch {
            reject("ERR_UPDATE_CONTEXT_FAILED", error.localizedDescription, error)
        }
    }
    
    @objc(getApplicationContext:reject:)
    func getApplicationContext(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let session = session, session.activationState == .activated else {
            reject("ERR_WATCH_SESSION_NOT_ACTIVATED", "Watch session is not activated", nil)
            return
        }
        
        resolve(session.applicationContext)
    }
    
    @objc(transferUserInfo:resolver:rejecter:)
    func transferUserInfo(_ userInfo: [String: Any], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let session = session, session.activationState == .activated else {
            reject("ERR_WATCH_SESSION_NOT_ACTIVATED", "Watch session is not activated", nil)
            return
        }
        
        let transfer = session.transferUserInfo(userInfo)
        let transferId = UUID().uuidString
        transferIds[transferId] = transferId
        
        resolve([
            "id": transferId,
            "data": userInfo
        ])
    }
    
    @objc(getCurrentUserInfo:reject:)
    func getCurrentUserInfo(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let session = session, session.activationState == .activated else {
            reject("ERR_WATCH_SESSION_NOT_ACTIVATED", "Watch session is not activated", nil)
            return
        }
        
        let currentUserInfo = session.outstandingUserInfoTransfers.map { transfer -> [String: Any] in
            let transferId = UUID().uuidString
            transferIds[transferId] = transferId
            return [
                "id": transferId,
                "data": transfer.userInfo
            ]
        }
        
        resolve(currentUserInfo)
    }
    
    @objc(transferFile:metadata:resolver:rejecter:)
    func transferFile(_ file: String, metadata: [String: Any]?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let session = session, session.activationState == .activated else {
            reject("ERR_WATCH_SESSION_NOT_ACTIVATED", "Watch session is not activated", nil)
            return
        }
        
        // Validate the file path
        let fileURL = URL(fileURLWithPath: file)
        
        // Check if file exists
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            reject("ERR_FILE_NOT_FOUND", "File does not exist: \(file)", nil)
            return
        }
        
        // Check file size
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
            if let fileSize = attributes[.size] as? NSNumber {
                // Log the file size
                let fileSizeBytes = fileSize.int64Value
                logToFile("📱 [RNWatchConnectivityPro] Transferring file: \(fileURL.lastPathComponent) (\(fileSizeBytes) bytes)")
                
                // Warn about large files
                if fileSizeBytes > 5 * 1024 * 1024 { // 5 MB
                    logToFile("⚠️ [RNWatchConnectivityPro] Warning: Large file being transferred (\(fileSizeBytes / 1024 / 1024) MB)")
                }
            }
        } catch {
            logToFile("⚠️ [RNWatchConnectivityPro] Could not get file size: \(error.localizedDescription)")
        }
        
        // Create metadata with file information if none was provided
        var completeMetadata = metadata ?? [:]
        
        // Add file information to metadata if not already present
        if completeMetadata["fileName"] == nil {
            completeMetadata["fileName"] = fileURL.lastPathComponent
        }
        
        if completeMetadata["fileType"] == nil {
            completeMetadata["fileType"] = fileURL.pathExtension
        }
        
        if completeMetadata["timestamp"] == nil {
            completeMetadata["timestamp"] = Date().timeIntervalSince1970
        }
        
        // Start the file transfer
        let transfer = session.transferFile(fileURL, metadata: completeMetadata)
        let transferId = UUID().uuidString
        
        // Store the transfer for tracking
        fileTransfers[transferId] = transfer
        
        // Log the transfer
        logToFile("📱 [RNWatchConnectivityPro] File transfer started with ID: \(transferId)")
        
        // Initiate progress tracking
        observeFileTransferProgress(transfer, transferId: transferId)
        
        // Return transfer information
        resolve([
            "id": transferId,
            "file": file,
            "fileName": fileURL.lastPathComponent,
            "fileSize": try? FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? Int64 ?? 0,
            "metadata": completeMetadata,
            "progress": 0,
            "timestamp": Date().timeIntervalSince1970
        ])
    }
    
    @objc(getFileTransfers:reject:)
    func getFileTransfers(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let session = session, session.activationState == .activated else {
            reject("ERR_WATCH_SESSION_NOT_ACTIVATED", "Watch session is not activated", nil)
            return
        }
        
        // Get all ongoing transfers
        let transfers = session.outstandingFileTransfers.map { transfer -> [String: Any] in
            let transferId = UUID().uuidString
            fileTransfers[transferId] = transfer
            
            // Start observing progress for newly tracked transfers
            observeFileTransferProgress(transfer, transferId: transferId)
            
            var dict: [String: Any] = [
                "id": transferId,
                "file": transfer.file.fileURL.path,
                "fileName": transfer.file.fileURL.lastPathComponent,
                "progress": transfer.progress.fractionCompleted,
                "timestamp": Date().timeIntervalSince1970
            ]
            
            if let metadata = transfer.file.metadata {
                dict["metadata"] = metadata
            }
            
            return dict
        }
        
        logToFile("📱 [RNWatchConnectivityPro] Retrieved \(transfers.count) active file transfers")
        resolve(transfers)
    }
    
    @objc(cancelFileTransfer:resolver:rejecter:)
    func cancelFileTransfer(_ transferId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let transfer = fileTransfers[transferId] else {
            reject("ERR_TRANSFER_NOT_FOUND", "No file transfer found with ID: \(transferId)", nil)
            return
        }
        
        // Cancel the transfer
        transfer.cancel()
        
        // Remove from tracked transfers
        fileTransfers.removeValue(forKey: transferId)
        
        logToFile("📱 [RNWatchConnectivityPro] Cancelled file transfer with ID: \(transferId)")
        resolve(true)
    }
    
    @objc(replyToMessage:withResponse:resolver:rejecter:)
    func replyToMessage(_ handlerId: String, withResponse response: [String: Any], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let handler = replyHandlers[handlerId] {
            // RCTResponseSenderBlock takes an optional array of Any
            handler([response])
            replyHandlers.removeValue(forKey: handlerId)
            resolve(true)
        } else {
            reject("ERR_INVALID_HANDLER", "No reply handler found for this ID", nil)
        }
    }
    
    @objc(sendMessageWithReply:replyId:resolver:rejecter:)
    func sendMessageWithReply(_ message: [String: Any], replyId: String?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let session = session, session.activationState == .activated else {
            logToFile("📱 [RNWatchConnectivityPro] Cannot send message with reply - session not activated, queueing")
            // Queue the message
            var messageCopy = message
            if let replyId = replyId {
                messageCopy["__replyId"] = replyId
            }
            queueMessage(messageCopy, withReplyHandler: nil)
            reject("QUEUED", "Watch session is not activated, message queued", nil)
            return
        }
        
        guard session.isReachable else {
            logToFile("📱 [RNWatchConnectivityPro] Cannot send message with reply - watch not reachable, queueing")
            // Queue the message
            var messageCopy = message
            if let replyId = replyId {
                messageCopy["__replyId"] = replyId
            }
            queueMessage(messageCopy, withReplyHandler: nil)
            reject("QUEUED", "Apple Watch is not reachable, message queued", nil)
            return
        }
        
        // Create a mutable copy of the message without the replyId
        var messageCopy = message
        messageCopy.removeValue(forKey: "__replyId")
        
        // Only set up reply handling if we have a replyId
        if let replyId = replyId {
            session.sendMessage(messageCopy, replyHandler: { [weak self] reply in
                guard let self = self else { return }
                
                // Send an event to JavaScript with the reply
                if self.hasListeners {
                    DispatchQueue.main.async {
                        self.sendEvent(
                            withName: "internal_messageReply",
                            body: [
                                "replyId": replyId,
                                "response": reply
                            ] as [String: Any]
                        )
                    }
                }
                
                // Resolve the promise
                resolve(true)
            }, errorHandler: { error in
                reject("ERR_WATCH_MESSAGE_FAILED", error.localizedDescription, error)
            })
        } else {
            // No reply handler, just send the message
            session.sendMessage(messageCopy, replyHandler: { _ in
                // Empty handler, just resolve the promise
                resolve(true)
            }, errorHandler: { error in
                reject("ERR_WATCH_MESSAGE_FAILED", error.localizedDescription, error)
            })
        }
    }
    
    @objc(checkWatchConnectivityStatus:reject:)
    func checkWatchConnectivityStatus(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard WCSession.isSupported() else {
            let message = "Watch connectivity is not supported on this device"
            logToFile("❌ [RNWatchConnectivityPro] \(message)")
            reject("ERR_WATCH_CONNECTIVITY_NOT_SUPPORTED", message, nil)
            return
        }
        
        guard let session = session else {
            let message = "Watch session is null"
            logToFile("❌ [RNWatchConnectivityPro] \(message)")
            reject("ERR_WATCH_SESSION_NULL", message, nil)
            return
        }
        
        // Log detailed connectivity status
        let stateString = session.activationState == .activated ? "Activated" : 
                         (session.activationState == .inactive ? "Inactive" : "Not Activated")
        
        logToFile("📱 [RNWatchConnectivityPro] Detailed watch connectivity status:")
        logToFile("- Activation State: \(stateString) (\(session.activationState.rawValue))")
        logToFile("- Is Paired: \(session.isPaired)")
        logToFile("- Is Reachable: \(session.isReachable)")
        logToFile("- Is Watch App Installed: \(session.isWatchAppInstalled)")
        logToFile("- Is Complication Enabled: \(session.isComplicationEnabled)")
        logToFile("- Message Queue Count: \(messageQueue.count)")
        
        // If the session isn't activated yet, activate it
        if session.activationState != .activated {
            logToFile("📱 [RNWatchConnectivityPro] Session not activated, activating now")
            session.activate()
        }
        
        // If watch is reachable and we have queued messages, process the queue
        if session.isReachable && !messageQueue.isEmpty {
            logToFile("📱 [RNWatchConnectivityPro] Watch is reachable and queue has \(messageQueue.count) messages, processing queue")
            processMessageQueueInternal()
        }
        
        // Send a test event to verify that events are being received by JS
        DispatchQueue.main.async {
            self.logToFile("📱 [RNWatchConnectivityPro] Sending test event to JS")
            
            // Create test message
            let testMessage: [String: Any] = [
                "type": "test",
                "message": "Test message from Swift",
                "timestamp": Date().timeIntervalSince1970,
                "sender": "swift",
                "isTest": true
            ]
            
            // Log the event we're about to send
            let messageJson = try? JSONSerialization.data(withJSONObject: testMessage, options: [])
            let jsonString = messageJson != nil ? String(data: messageJson!, encoding: .utf8) ?? "unable to serialize" : "unable to serialize"
            self.logToFile("📱 [RNWatchConnectivityPro] Test message content: \(jsonString)")
            
            // Send event
            self.sendEvent(
                withName: "messageReceived",
                body: ["message": testMessage]
            )
            
            self.logToFile("📱 [RNWatchConnectivityPro] Test event sent to JS")
        }
        
        // Return detailed status
        resolve(getSessionState())
    }
    
    // MARK: - Message Queue Methods
    
    // Queue a message for later sending
    private func queueMessage(_ message: [String: Any], withReplyHandler replyHandler: RCTResponseSenderBlock?) {
        // Add timestamp and metadata for queuing
        var messageToQueue = message
        let timestamp = Date().timeIntervalSince1970
        messageToQueue["__queuedAt"] = timestamp
        messageToQueue["__hasReplyHandler"] = replyHandler != nil
        
        // Special handling for test messages without proper format
        if messageToQueue["type"] == nil && messageToQueue["message"] == nil {
            // This is likely a raw non-formatted message, convert it to a standard format
            messageToQueue = [
                "type": "generic",
                "message": message,
                "timestamp": timestamp
            ]
            logToFile("📱 [RNWatchConnectivityPro] Reformatted non-standard message for queue")
        }
        
        // Store reply handler if present
        if let replyHandler = replyHandler {
            let handlerId = UUID().uuidString
            replyHandlers[handlerId] = replyHandler
            messageToQueue["__handlerId"] = handlerId
            logToFile("📱 [RNWatchConnectivityPro] Stored reply handler with ID \(handlerId) for queued message")
        }
        
        // Add to queue
        messageQueue.append(messageToQueue)
        logToFile("📱 [RNWatchConnectivityPro] Message queued at \(timestamp), queue length: \(messageQueue.count)")
        
        // Notify JS about queue update
        sendQueueUpdateEvent()
    }
    
    // Process the message queue
    private func processMessageQueueInternal() -> Int {
        guard !isProcessingQueue else {
            logToFile("📱 [RNWatchConnectivityPro] Already processing queue, skipping")
            return 0
        }
        
        guard let session = session, session.activationState == .activated else {
            logToFile("📱 [RNWatchConnectivityPro] Cannot process queue - session not activated")
            return 0
        }
        
        // Check reachability just to be sure - but proceed anyway with a warning if unreachable
        if !session.isReachable {
            logToFile("📱 [RNWatchConnectivityPro] ⚠️ Warning: Processing queue with unreachable watch - messages may fail")
        }
        
        isProcessingQueue = true
        let queueCount = messageQueue.count
        logToFile("📱 [RNWatchConnectivityPro] Processing message queue (\(queueCount) messages)")
        
        // Process queue in batches to avoid overwhelming the system
        let batchSize = 5
        var processed = 0
        var failures = 0
        var remainingQueue: [[String: Any]] = []
        
        // Create a copy of the messages to process
        let messagesToProcess = Array(messageQueue.prefix(batchSize))
        
        // Clear processed messages from the queue before sending
        // This prevents the same message from being sent multiple times if the session state
        // changes before we finish processing
        messageQueue = Array(messageQueue.dropFirst(min(batchSize, messageQueue.count)))
        
        for message in messagesToProcess {
            // Extract metadata
            var messageCopy = message
            messageCopy.removeValue(forKey: "__queuedAt")
            let hasReplyHandler = messageCopy.removeValue(forKey: "__hasReplyHandler") as? Bool ?? false
            let handlerId = messageCopy.removeValue(forKey: "__handlerId") as? String
            
            // Log the attempt
            logToFile("📱 [RNWatchConnectivityPro] Sending queued message: \(messageCopy)")
            
            // Send the message
            session.sendMessage(messageCopy, replyHandler: { [weak self] reply in
                guard let self = self else { return }
                
                self.logToFile("📱 [RNWatchConnectivityPro] Received reply for queued message: \(reply)")
                
                if let handlerId = handlerId, let handler = self.replyHandlers[handlerId] {
                    handler([reply])
                    self.replyHandlers.removeValue(forKey: handlerId)
                }
            }, errorHandler: { [weak self] error in
                guard let self = self else { return }
                
                self.logToFile("❌ [RNWatchConnectivityPro] Error sending queued message: \(error.localizedDescription)")
                failures += 1
                
                // Keep the message in the queue for retry if it's a temporary error
                if error.localizedDescription.contains("not reachable") || 
                   error.localizedDescription.contains("session inactive") {
                    // Only requeue if it's a connectivity issue
                    remainingQueue.append(message)
                } else {
                    // For other errors, don't requeue to avoid infinite retries
                    self.logToFile("📱 [RNWatchConnectivityPro] Not requeuing message due to non-connectivity error")
                }
            })
            
            processed += 1
        }
        
        // Add failed messages back to the front of the queue
        if !remainingQueue.isEmpty {
            messageQueue = remainingQueue + messageQueue
        }
        
        isProcessingQueue = false
        
        // If there are remaining messages and watch is reachable, schedule another processing
        if !messageQueue.isEmpty && session.isReachable {
            logToFile("📱 [RNWatchConnectivityPro] Still have \(messageQueue.count) messages, scheduling another batch")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.processMessageQueueInternal()
            }
        }
        
        // Notify JS about queue update
        sendQueueUpdateEvent()
        
        logToFile("📱 [RNWatchConnectivityPro] Queue processing complete - processed: \(processed), failures: \(failures), remaining: \(messageQueue.count)")
        return processed
    }
    
    // Send event about queue status
    private func sendQueueUpdateEvent() {
        if hasListeners {
            sendEvent(
                withName: "messageQueueUpdated",
                body: [
                    "count": messageQueue.count,
                    "isProcessing": isProcessingQueue,
                    "oldestMessage": messageQueue.first?["__queuedAt"] as? TimeInterval ?? 0,
                    "newestMessage": messageQueue.last?["__queuedAt"] as? TimeInterval ?? 0
                ]
            )
        }
    }
    
    // MARK: - Private Helper Methods
    
    private func getSessionState() -> [String: Any] {
        guard let session = session else {
            return [
                "isPaired": false,
                "isReachable": false,
                "isWatchAppInstalled": false,
                "sessionState": "NotActivated",
                "lastStateChange": lastWatchStateChange,
                "queuedMessages": 0
            ]
        }
        
        var sessionStateString = "NotActivated"
        
        switch session.activationState {
        case .notActivated:
            sessionStateString = "NotActivated"
        case .inactive:
            sessionStateString = "Inactive"
        case .activated:
            sessionStateString = "Activated"
        @unknown default:
            sessionStateString = "Unknown"
        }
        
        return [
            "isPaired": session.isPaired,
            "isReachable": session.isReachable,
            "isComplicationEnabled": session.isComplicationEnabled,
            "isWatchAppInstalled": session.isWatchAppInstalled,
            "sessionState": sessionStateString,
            "lastStateChange": lastWatchStateChange,
            "queuedMessages": messageQueue.count
        ]
    }
    
    // Helper method to log to file for debugging
    private func logToFile(_ message: String) {
        // Print to console
        print(message)
        
        // Get documents directory
        let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let fileURL = documentsDirectory.appendingPathComponent(logFileName)
        
        // Format message with timestamp
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        let timestamp = dateFormatter.string(from: Date())
        let logEntry = "\(timestamp) \(message)\n"
        
        do {
            // Append to file if it exists, create if it doesn't
            if FileManager.default.fileExists(atPath: fileURL.path) {
                let fileHandle = try FileHandle(forWritingTo: fileURL)
                fileHandle.seekToEndOfFile()
                if let data = logEntry.data(using: .utf8) {
                    fileHandle.write(data)
                }
                fileHandle.closeFile()
            } else {
                try logEntry.write(to: fileURL, atomically: true, encoding: .utf8)
            }
        } catch {
            print("Error writing to log file: \(error)")
        }
    }
    
    // Helper method to observe file transfer progress
    private func observeFileTransferProgress(_ transfer: WCSessionFileTransfer, transferId: String) {
        // Use KVO to observe progress changes
        let observation = transfer.progress.observe(\.fractionCompleted) { [weak self] (progress, _) in
            guard let self = self else { return }
            
            // Calculate percentage (0-100)
            let percentage = Int(progress.fractionCompleted * 100)
            
            // Only send updates at reasonable intervals to avoid flooding events
            if percentage % 10 == 0 || percentage == 100 {
                self.logToFile("📱 [RNWatchConnectivityPro] File transfer progress: \(percentage)% for ID: \(transferId)")
                
                // Notify JS of progress if we have listeners
                if self.hasListeners {
                    DispatchQueue.main.async {
                        self.sendEvent(
                            withName: "fileTransferProgress",
                            body: [
                                "id": transferId,
                                "progress": progress.fractionCompleted,
                                "fileName": transfer.file.fileURL.lastPathComponent,
                                "metadata": transfer.file.metadata ?? [:]
                            ]
                        )
                    }
                }
            }
        }
        
        // Store the observation to keep it alive (prevent automatic invalidation)
        // This is a simplified approach - a real implementation would need to manage these observations
        // and invalidate them when transfers complete or are cancelled
        progressObservations[transferId] = observation
    }
    
    // MARK: - Complication Support
    
    @objc(isComplicationEnabled:reject:)
    func isComplicationEnabled(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard WCSession.default.activationState == .activated else {
            log(.warning, "Session not activated, complications not available")
            resolve(false)
            return
        }
        
        log(.debug, "Checking if complication is enabled: \(WCSession.default.isComplicationEnabled)")
        resolve(WCSession.default.isComplicationEnabled)
    }
    
    @objc(getRemainingComplicationTransfers:reject:)
    func getRemainingComplicationTransfers(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard WCSession.default.activationState == .activated else {
            log(.warning, "Session not activated, complication transfers not available")
            resolve(0)
            return
        }
        
        let remaining = WCSession.default.remainingComplicationUserInfoTransfers
        log(.debug, "Remaining complication transfers: \(remaining)")
        resolve(remaining)
    }
    
    @objc(transferCurrentComplicationUserInfo:resolve:reject:)
    func transferCurrentComplicationUserInfo(_ userInfo: [String: Any], 
                                            resolve: @escaping RCTPromiseResolveBlock, 
                                            reject: @escaping RCTPromiseRejectBlock) {
        guard WCSession.default.activationState == .activated else {
            let error = RNWCError.sessionNotActive
            log(.error, error.localizedDescription)
            reject(error.code, error.localizedDescription, error)
            return
        }
        
        guard WCSession.default.isComplicationEnabled else {
            let error = NSError(domain: "RNWatchConnectivityPro", code: 9003, 
                               userInfo: [NSLocalizedDescriptionKey: "Complication is not enabled on the watch face"])
            log(.error, error.localizedDescription)
            reject("COMPLICATION_NOT_ENABLED", error.localizedDescription, error)
            return
        }
        
        do {
            // Create a mutable copy of userInfo to add timestamp if needed
            var complicationInfo = userInfo
            
            // Add timestamp if not present
            if complicationInfo["timestamp"] == nil {
                complicationInfo["timestamp"] = Date().timeIntervalSince1970
            }
            
            let transfer = WCSession.default.transferCurrentComplicationUserInfo(complicationInfo)
            // WCSessionUserInfoTransfer doesn't have 'identifier' property, generate a UUID instead
            let transferId = UUID().uuidString
            log(.debug, "Transferred complication data with ID: \(transferId)")
            
            let result: [String: Any] = [
                "id": transferId,
                "timestamp": Date().timeIntervalSince1970,
                // Since this is a complication transfer, we know it's for a complication
                "isCurrentComplicationInfo": true,
                "userInfo": complicationInfo
            ]
            
            resolve(result)
        } catch {
            log(.error, "Failed to transfer complication user info: \(error.localizedDescription)")
            reject("TRANSFER_FAILED", "Failed to transfer complication data: \(error.localizedDescription)", error)
        }
    }
}

// MARK: - WCSessionDelegate

extension RNWatchConnectivityPro: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        lastWatchStateChange = Date().timeIntervalSince1970
        
        if let error = error {
            logToFile("❌ [RNWatchConnectivityPro] WCSession activation failed: \(error.localizedDescription)")
            
            if hasListeners {
                sendEvent(
                    withName: "activationError",
                    body: [
                        "error": [
                            "domain": (error as NSError).domain,
                            "code": (error as NSError).code,
                            "localizedDescription": error.localizedDescription
                        ]
                    ]
                )
            }
        } else {
            logToFile("✅ [RNWatchConnectivityPro] WCSession activated with state: \(activationState.rawValue)")
            
            // If we have queued messages and watch is reachable, process queue
            if activationState == .activated && session.isReachable && !messageQueue.isEmpty {
                logToFile("📱 [RNWatchConnectivityPro] Processing message queue after activation")
                processMessageQueueInternal()
            }
        }
        
        if hasListeners {
            sendEvent(
                withName: "watchStateUpdated",
                body: ["watchState": getSessionState()]
            )
        }
    }
    
    func sessionDidBecomeInactive(_ session: WCSession) {
        lastWatchStateChange = Date().timeIntervalSince1970
        logToFile("📱 [RNWatchConnectivityPro] Session became inactive")
        
        if hasListeners {
            sendEvent(
                withName: "watchStateUpdated",
                body: ["watchState": getSessionState()]
            )
        }
    }
    
    func sessionDidDeactivate(_ session: WCSession) {
        lastWatchStateChange = Date().timeIntervalSince1970
        logToFile("📱 [RNWatchConnectivityPro] Session deactivated")
        
        if hasListeners {
            sendEvent(
                withName: "watchStateUpdated",
                body: ["watchState": getSessionState()]
            )
        }
    }
    
    func sessionWatchStateDidChange(_ session: WCSession) {
        lastWatchStateChange = Date().timeIntervalSince1970
        logToFile("📱 [RNWatchConnectivityPro] Watch state changed - Reachable: \(session.isReachable), Paired: \(session.isPaired), App installed: \(session.isWatchAppInstalled)")
        
        // If watch became reachable and we have queued messages, process the queue
        if session.isReachable && !messageQueue.isEmpty {
            logToFile("📱 [RNWatchConnectivityPro] Watch became reachable, processing message queue (\(messageQueue.count) messages)")
            // First clear any watch state update events in the event queue
            DispatchQueue.main.async {
                // Then process the queue
                self.processMessageQueueInternal()
            }
        }
        
        if hasListeners {
            sendEvent(
                withName: "watchStateUpdated",
                body: ["watchState": getSessionState()]
            )
        }
    }
    
    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        let messageJson = try? JSONSerialization.data(withJSONObject: message, options: [])
        let jsonString = messageJson != nil ? String(data: messageJson!, encoding: .utf8) ?? "unable to serialize" : "unable to serialize"
        
        logToFile("📱 [RNWatchConnectivityPro] Received message from watch: \(jsonString)")
        
        // Always emit the event, even if no listeners are registered yet
        // React Native's event system will queue it until listeners are added
        DispatchQueue.main.async {
            let eventBody: [String: Any] = ["message": message]
            self.logToFile("📱 [RNWatchConnectivityPro] Emitting event with body: \(eventBody)")
            
            self.sendEvent(
                withName: "messageReceived",
                body: eventBody
            )
            
            if !self.hasListeners {
                self.logToFile("📱 [RNWatchConnectivityPro] No JS listeners registered yet, but message was sent to event system")
            }
        }
    }
    
    func session(_ session: WCSession, didReceiveMessage message: [String : Any], replyHandler: @escaping ([String : Any]) -> Void) {
        let messageJson = try? JSONSerialization.data(withJSONObject: message, options: [])
        let jsonString = messageJson != nil ? String(data: messageJson!, encoding: .utf8) ?? "unable to serialize" : "unable to serialize"
        
        logToFile("📱 [RNWatchConnectivityPro] Received message with reply handler from watch: \(jsonString)")
        
        // Generate a unique ID for this message's reply handler
        let handlerId = UUID().uuidString
        
        // Store a closure that will invoke the actual replyHandler
        self.replyHandlers[handlerId] = { args in
            // Here args is [Any]? (optional array)
            if let args = args, let replyData = args.first as? [String: Any] {
                self.logToFile("📱 [RNWatchConnectivityPro] Sending reply to watch: \(replyData)")
                replyHandler(replyData)
            } else {
                // If we can't get valid data, send a default response
                let defaultReply: [String: Any] = ["error": "Invalid reply data from JavaScript", "acknowledged": true]
                self.logToFile("📱 [RNWatchConnectivityPro] Sending default reply to watch: \(defaultReply)")
                replyHandler(defaultReply)
            }
        }
        
        // Create a modified message with a handler ID instead of the actual handler
        let messageWithHandlerId: [String: Any] = [
            "message": message,
            "hasReplyHandler": true,
            "handlerId": handlerId
        ]
        
        // Log the serialized body for debugging
        let bodyJson = try? JSONSerialization.data(withJSONObject: messageWithHandlerId, options: [])
        let bodyString = bodyJson != nil ? String(data: bodyJson!, encoding: .utf8) ?? "unable to serialize" : "unable to serialize"
        self.logToFile("📱 [RNWatchConnectivityPro] Emitting event with body: \(bodyString)")
        
        // Always send the event regardless of hasListeners
        DispatchQueue.main.async {
            self.sendEvent(
                withName: "messageReceived",
                body: messageWithHandlerId
            )
            
            if !self.hasListeners {
                self.logToFile("📱 [RNWatchConnectivityPro] No JS listeners registered yet, but message with reply handler was sent to event system")
                
                // If this is a message that needs immediate acknowledgment, send a default reply
                if let type = message["type"] as? String, (type == "test" || type == "requestData") {
                    // For test messages, send an immediate acknowledgment
                    let defaultReply: [String: Any] = [
                        "acknowledged": true, 
                        "message": "Message received by phone, app not ready yet",
                        "timestamp": Date().timeIntervalSince1970
                    ]
                    self.logToFile("📱 [RNWatchConnectivityPro] Sending immediate acknowledgment for \(type) message")
                    replyHandler(defaultReply)
                    // Remove the handler since we've already replied
                    self.replyHandlers.removeValue(forKey: handlerId)
                }
            }
        }
    }
    
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any] = [:]) {
        logToFile("📱 [RNWatchConnectivityPro] Received user info from watch: \(userInfo)")
        
        // Process user info as a message as well for consistency
        DispatchQueue.main.async {
            // First emit as userInfoReceived event
            if self.hasListeners {
                self.sendEvent(
                    withName: "userInfoReceived",
                    body: [
                        "userInfo": [
                            "id": UUID().uuidString,
                            "data": userInfo,
                            "transferTime": Date().timeIntervalSince1970 * 1000
                        ]
                    ]
                )
            }
            
            // Also send as a message for consistent handling
            let eventBody: [String: Any] = ["message": userInfo]
            self.logToFile("📱 [RNWatchConnectivityPro] Emitting user info as message event")
            
            self.sendEvent(
                withName: "messageReceived",
                body: eventBody
            )
        }
    }
    
    func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
        if hasListeners {
            let transferId = UUID().uuidString
            var body: [String: Any] = [
                "userInfo": [
                    "id": transferId,
                    "data": userInfoTransfer.userInfo
                ]
            ]
            
            if let error = error {
                body["error"] = [
                    "domain": (error as NSError).domain,
                    "code": (error as NSError).code,
                    "localizedDescription": error.localizedDescription
                ]
            }
            
            sendEvent(
                withName: "userInfoTransferFinished",
                body: body
            )
        }
    }
    
    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        let fileURL = file.fileURL
        let metadata = file.metadata ?? [:]
        
        logToFile("📱 [RNWatchConnectivityPro] Received file from watch: \(fileURL.lastPathComponent)")
        
        // Generate a unique ID for this received file
        let receivedFileId = UUID().uuidString
        
        // Move file to a more permanent location
        let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let destinationURL = documentsDir.appendingPathComponent(fileURL.lastPathComponent)
        
        do {
            // Remove existing file if it exists
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.removeItem(at: destinationURL)
            }
            
            // Move file from temporary location to permanent location
            try FileManager.default.moveItem(at: fileURL, to: destinationURL)
            
            logToFile("📱 [RNWatchConnectivityPro] File moved to permanent location: \(destinationURL.path)")
            
            // Notify JavaScript
            if hasListeners {
                // Gather file information
                let fileSize = (try? FileManager.default.attributesOfItem(atPath: destinationURL.path)[.size] as? Int64) ?? 0
                
                var fileInfo: [String: Any] = [
                    "id": receivedFileId,
                    "file": destinationURL.path,
                    "fileName": destinationURL.lastPathComponent,
                    "fileSize": fileSize,
                    "timestamp": Date().timeIntervalSince1970
                ]
                
                // Add metadata if available
                if !metadata.isEmpty {
                    fileInfo["metadata"] = metadata
                }
                
                // Send event
                DispatchQueue.main.async {
                    self.sendEvent(
                        withName: "fileReceived",
                        body: fileInfo
                    )
                }
            }
        } catch {
            logToFile("❌ [RNWatchConnectivityPro] Error moving received file: \(error.localizedDescription)")
        }
    }
    
    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        // Find the transferId for this fileTransfer
        let transferId = fileTransfers.first(where: { $0.value === fileTransfer })?.key ?? UUID().uuidString
        
        if let error = error {
            logToFile("❌ [RNWatchConnectivityPro] File transfer failed for ID \(transferId): \(error.localizedDescription)")
            
            if hasListeners {
                let body: [String: Any] = [
                    "id": transferId,
                    "file": fileTransfer.file.fileURL.path,
                    "fileName": fileTransfer.file.fileURL.lastPathComponent,
                    "metadata": fileTransfer.file.metadata ?? [:],
                    "error": [
                        "domain": (error as NSError).domain,
                        "code": (error as NSError).code,
                        "message": error.localizedDescription
                    ],
                    "timestamp": Date().timeIntervalSince1970
                ]
                
                DispatchQueue.main.async {
                    self.sendEvent(
                        withName: "fileTransferError",
                        body: body
                    )
                }
            }
        } else {
            logToFile("✅ [RNWatchConnectivityPro] File transfer completed successfully for ID \(transferId)")
            
            if hasListeners {
                let body: [String: Any] = [
                    "id": transferId,
                    "file": fileTransfer.file.fileURL.path,
                    "fileName": fileTransfer.file.fileURL.lastPathComponent,
                    "metadata": fileTransfer.file.metadata ?? [:],
                    "progress": 1.0,
                    "timestamp": Date().timeIntervalSince1970
                ]
                
                DispatchQueue.main.async {
                    self.sendEvent(
                        withName: "fileTransferFinished",
                        body: body
                    )
                }
            }
        }
        
        // Remove from tracked transfers and observations
        fileTransfers.removeValue(forKey: transferId)
        progressObservations.removeValue(forKey: transferId)
    }
    
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        logToFile("📱 [RNWatchConnectivityPro] Received application context from watch: \(applicationContext)")
        
        // Always emit the event, even if no listeners are registered yet
        DispatchQueue.main.async {
            let eventBody: [String: Any] = ["message": applicationContext]
            self.logToFile("📱 [RNWatchConnectivityPro] Emitting application context as message event")
            
            self.sendEvent(
                withName: "messageReceived",
                body: eventBody
            )
            
            if !self.hasListeners {
                self.logToFile("📱 [RNWatchConnectivityPro] No JS listeners registered yet, but application context was sent to event system")
            }
        }
    }
} 