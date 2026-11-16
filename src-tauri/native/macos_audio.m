#import "macos_audio.h"
#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreMedia/CoreMedia.h>
#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <math.h>

// One active or pending system capture. A timed-out Apple callback cannot pile
// up driver starts: the gate reopens only when native teardown has completed.
static atomic_bool captureBusy = false;

int32_t buddy_macos_audio_supported(void) {
    if (@available(macOS 13.0, *)) return 1;
    return 0;
}
int32_t buddy_macos_audio_permission(int32_t source) {
    if (source == 1) return CGPreflightScreenCaptureAccess() ? 1 : 4;
    if (source != 0) return 3;
    switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]) {
        case AVAuthorizationStatusAuthorized: return 1;
        case AVAuthorizationStatusDenied: return 2;
        case AVAuthorizationStatusRestricted: return 3;
        default: return 0;
    }
}
void buddy_macos_request_audio_permission(int32_t source, void *context, BuddyPermissionCallback callback) {
    // The caller dispatches this explicit user action onto the app's main thread.
    if (!callback) return;
    if (source == 1) {
        CGRequestScreenCaptureAccess();
        callback(context, buddy_macos_audio_permission(source));
    } else if (source == 0) {
        if (buddy_macos_audio_permission(source) != 0) {
            callback(context, buddy_macos_audio_permission(source));
        } else {
            [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
                callback(context, granted ? 1 : buddy_macos_audio_permission(0));
            }];
        }
    } else callback(context, 3);
}

@interface BuddySystemAudio : NSObject <SCStreamOutput, SCStreamDelegate>
@property(nonatomic, strong) SCStream *stream;
@property(nonatomic, strong) dispatch_queue_t queue;
@property(nonatomic) void *context;
@property(nonatomic) BuddyAudioCallback audio;
@property(nonatomic) BuddyAudioEvent event;
@property(nonatomic) BOOL closing;
@property(nonatomic) BOOL starting;
@property(nonatomic) BOOL stopping;
@property(nonatomic) BOOL reportedError;
@property(nonatomic) BOOL contentPending;
- (void)begin;
- (void)close;
@end

@implementation BuddySystemAudio
- (void)report:(int32_t)code {
    // Called only on the serial delivery/state queue. No NSError/provider text
    // enters normal logs or Rust events.
    if (self.closing || !self.event) return;
    if (code != 1) {
        if (self.reportedError) return;
        self.reportedError = YES;
    }
    self.event(self.context, code);
}
- (void)stopOnQueue {
    if (self.stopping || self.starting || self.contentPending) return;
    if (!self.stream) { atomic_store(&captureBusy, false); return; }
    self.stopping = YES;
    SCStream *stream = self.stream;
    [stream stopCaptureWithCompletionHandler:^(NSError *error) {
        dispatch_async(self.queue, ^{
            NSError *removeError = nil;
            [stream removeStreamOutput:self type:SCStreamOutputTypeAudio error:&removeError];
            self.stream = nil;
            atomic_store(&captureBusy, false);
        });
    }];
}
- (void)begin {
    dispatch_async(self.queue, ^{
        // This API enumerates content for a filter; no screen output is ever
        // registered, copied or persisted by Buddy.
        [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:YES
            completionHandler:^(SCShareableContent *content, NSError *error) {
                dispatch_async(self.queue, ^{
                    self.contentPending = NO;
                    if (self.closing) { atomic_store(&captureBusy, false); return; }
                    if (error || !content) { [self report:2]; return; }
                    SCDisplay *display = content.displays.firstObject;
                    if (!display) { [self report:3]; return; }
                    NSMutableArray<SCRunningApplication *> *excluded = [NSMutableArray array];
                    NSString *ownBundle = NSBundle.mainBundle.bundleIdentifier;
                    for (SCRunningApplication *application in content.applications) {
                        if (application.processID == NSProcessInfo.processInfo.processIdentifier ||
                            (ownBundle && [application.bundleIdentifier isEqualToString:ownBundle])) {
                            [excluded addObject:application];
                        }
                    }
                    SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:display excludingApplications:excluded exceptingWindows:@[]];
                    SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
                    config.capturesAudio = YES;
                    config.excludesCurrentProcessAudio = YES;
                    config.sampleRate = 48000;
                    config.channelCount = 2;
                    config.width = 2;
                    config.height = 2;
                    config.minimumFrameInterval = CMTimeMake(1, 1);
                    config.queueDepth = 3;
                    config.showsCursor = NO;
                    self.stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:self];
                    NSError *outputError = nil;
                    if (![self.stream addStreamOutput:self type:SCStreamOutputTypeAudio sampleHandlerQueue:self.queue error:&outputError]) {
                        [self report:4]; return;
                    }
                    self.starting = YES;
                    [self.stream startCaptureWithCompletionHandler:^(NSError *startError) {
                        dispatch_async(self.queue, ^{
                            self.starting = NO;
                            if (self.closing) { [self stopOnQueue]; return; }
                            [self report:startError ? 4 : 1];
                        });
                    }];
                });
            }];
    });
}
- (void)close {
    // The Rust capture thread never calls this from our delivery queue.
    // Barrier completion proves no borrowed Rust context remains in a callback.
    dispatch_sync(self.queue, ^{
        self.closing = YES;
        self.audio = NULL;
        self.event = NULL;
        self.context = NULL;
        [self stopOnQueue];
    });
}
- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
    dispatch_async(self.queue, ^{ [self report:5]; });
}
- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)buffer ofType:(SCStreamOutputType)type {
    if (self.closing || self.reportedError || !self.audio || type != SCStreamOutputTypeAudio) return;
    if (!CMSampleBufferDataIsReady(buffer)) return;
    CMAudioFormatDescriptionRef desc = CMSampleBufferGetFormatDescription(buffer);
    const AudioStreamBasicDescription *format = desc ? CMAudioFormatDescriptionGetStreamBasicDescription(desc) : NULL;
    CMItemCount frames = CMSampleBufferGetNumSamples(buffer);
    // ScreenCaptureKit supplies native-endian float32 LPCM. Reject an unexpected
    // format instead of interpreting bytes as sound or inventing silence.
    if (!format || format->mFormatID != kAudioFormatLinearPCM ||
        !(format->mFormatFlags & kAudioFormatFlagIsFloat) ||
        (format->mFormatFlags & kAudioFormatFlagIsBigEndian) || format->mBitsPerChannel != 32 ||
        !isfinite(format->mSampleRate) || format->mSampleRate < 8000 || format->mSampleRate > 192000 ||
        fabs(format->mSampleRate - round(format->mSampleRate)) > 0.01 ||
        frames <= 0 || frames > 192000 || format->mChannelsPerFrame < 1 || format->mChannelsPerFrame > 8) {
        [self report:6]; return;
    }
    struct { AudioBufferList list; AudioBuffer extra[7]; } storage = {0};
    CMBlockBufferRef block = NULL;
    OSStatus status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(buffer, NULL,
        &storage.list, sizeof(storage), kCFAllocatorDefault, kCFAllocatorDefault,
        kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment, &block);
    if (status != noErr || storage.list.mNumberBuffers < 1 || storage.list.mNumberBuffers > 8) {
        if (block) CFRelease(block);
        [self report:6]; return;
    }
    BuddyAudioPlane planes[8] = {0};
    for (uint32_t i = 0; i < storage.list.mNumberBuffers; i++) {
        AudioBuffer source = storage.list.mBuffers[i];
        planes[i] = (BuddyAudioPlane){source.mData, source.mDataByteSize, source.mNumberChannels};
    }
    double age = CMTimeGetSeconds(CMClockGetTime(CMClockGetHostTimeClock())) - CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(buffer));
    self.audio(self.context, planes, storage.list.mNumberBuffers, (uint32_t)frames,
        format->mChannelsPerFrame, (uint32_t)round(format->mSampleRate), age);
    if (block) CFRelease(block);
}
@end

void *buddy_macos_audio_create(void *context, BuddyAudioCallback audio, BuddyAudioEvent event) {
    if (!context || !audio || !event || !buddy_macos_audio_supported()) return NULL;
    bool expected = false;
    if (!atomic_compare_exchange_strong(&captureBusy, &expected, true)) return NULL;
    @autoreleasepool {
        BuddySystemAudio *capture = [[BuddySystemAudio alloc] init];
        capture.context = context;
        capture.contentPending = YES;
        capture.audio = audio;
        capture.event = event;
        capture.queue = dispatch_queue_create("com.buddy.meeting.system-audio", DISPATCH_QUEUE_SERIAL);
        [capture begin];
        return (__bridge_retained void *)capture;
    }
}
void buddy_macos_audio_destroy(void *handle) {
    if (!handle) return;
    @autoreleasepool {
        BuddySystemAudio *capture = (__bridge_transfer BuddySystemAudio *)handle;
        [capture close];
    }
}
