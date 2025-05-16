#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(RNWatchConnectivityPro, RCTEventEmitter)

RCT_EXTERN_METHOD(initSession:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sendMessage:(NSDictionary *)message
                  replyHandler:(RCTResponseSenderBlock)replyHandler
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sendMessageWithReply:(NSDictionary *)message
                  replyId:(NSString *)replyId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateApplicationContext:(NSDictionary *)context
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getApplicationContext:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(transferUserInfo:(NSDictionary *)userInfo
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getCurrentUserInfo:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(transferFile:(NSString *)file
                  metadata:(NSDictionary *)metadata
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getFileTransfers:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancelFileTransfer:(NSString *)transferId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(replyToMessage:(NSString *)handlerId
                  withResponse:(NSDictionary *)response
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(supportedEvents)

RCT_EXTERN_METHOD(checkWatchConnectivityStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// New API methods for message queue
RCT_EXTERN_METHOD(getQueueStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearMessageQueue:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(processMessageQueue:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Complication Support
RCT_EXTERN_METHOD(isComplicationEnabled:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getRemainingComplicationTransfers:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(transferCurrentComplicationUserInfo:(NSDictionary *)userInfo
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// File Transfer
RCT_EXTERN_METHOD(transferFile:(NSString *)filePath
                  metadata:(NSDictionary *)metadata
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end 