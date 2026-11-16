#import "ios_audio.h"
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>
#include <stdatomic.h>

int32_t buddy_ios_microphone_permission(void) {
    switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]) {
        case AVAuthorizationStatusAuthorized: return 1;
        case AVAuthorizationStatusDenied: return 2;
        case AVAuthorizationStatusRestricted: return 3;
        default: return 0;
    }
}
void buddy_ios_request_microphone(void *context, BuddyIOSPermissionCallback callback) {
    // Called on the main thread, only following Record/Allow. No startup prompts.
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
        callback(context, buddy_ios_microphone_permission());
    }];
}
int32_t buddy_ios_open_settings(void) {
    NSURL *url = [NSURL URLWithString:UIApplicationOpenSettingsURLString];
    if (!url) return 0;
    // Fixed application settings URL; never accept a URL from the webview.
    dispatch_async(dispatch_get_main_queue(), ^{
        [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:nil];
    });
    return 1;
}

@interface BuddyIOSAudioSession : NSObject {
@public
    atomic_int event;
}
@property(nonatomic, strong) NSMutableArray *observers;
@end
@implementation BuddyIOSAudioSession
- (instancetype)init {
    if ((self = [super init])) { atomic_init(&event, 0); _observers = [NSMutableArray array]; }
    return self;
}
- (void)dealloc {
    for (id token in _observers) [[NSNotificationCenter defaultCenter] removeObserver:token];
}
@end

void *buddy_ios_audio_begin(void) {
    @autoreleasepool {
        if (buddy_ios_microphone_permission() != 1) return NULL;
        AVAudioSession *session = [AVAudioSession sharedInstance];
        NSError *error = nil;
        if (![session setCategory:AVAudioSessionCategoryPlayAndRecord
                    withOptions:AVAudioSessionCategoryOptionAllowBluetooth | AVAudioSessionCategoryOptionDefaultToSpeaker
                          error:&error]) return NULL;
        if (![session setActive:YES error:&error]) return NULL;
        BuddyIOSAudioSession *guard = [BuddyIOSAudioSession new];
        __weak BuddyIOSAudioSession *weakGuard = guard;
        NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
        // Finalize on interruptions instead of silently resuming over a missing passage.
        [guard.observers addObject:[center addObserverForName:AVAudioSessionInterruptionNotification object:session queue:nil usingBlock:^(NSNotification *n) {
            BuddyIOSAudioSession *strong = weakGuard;
            if (strong && [n.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue] == AVAudioSessionInterruptionTypeBegan)
                atomic_store(&strong->event, 1);
        }]];
        [guard.observers addObject:[center addObserverForName:AVAudioSessionRouteChangeNotification object:session queue:nil usingBlock:^(NSNotification *n) {
            BuddyIOSAudioSession *strong = weakGuard;
            NSUInteger reason = [n.userInfo[AVAudioSessionRouteChangeReasonKey] unsignedIntegerValue];
            if (strong && (reason == AVAudioSessionRouteChangeReasonOldDeviceUnavailable || reason == AVAudioSessionRouteChangeReasonNoSuitableRouteForCategory))
                atomic_store(&strong->event, 2);
        }]];
        for (NSNotificationName name in @[AVAudioSessionMediaServicesWereLostNotification, AVAudioSessionMediaServicesWereResetNotification]) {
            [guard.observers addObject:[center addObserverForName:name object:session queue:nil usingBlock:^(NSNotification *n) {
                BuddyIOSAudioSession *strong = weakGuard;
                if (strong) atomic_store(&strong->event, 3);
            }]];
        }
        return (__bridge_retained void *)guard;
    }
}
int32_t buddy_ios_audio_event(void *handle) {
    BuddyIOSAudioSession *guard = (__bridge BuddyIOSAudioSession *)handle;
    return guard ? atomic_load(&guard->event) : 3;
}
void buddy_ios_audio_end(void *handle) {
    @autoreleasepool {
        BuddyIOSAudioSession *guard = (__bridge_transfer BuddyIOSAudioSession *)handle;
        for (id token in guard.observers) [[NSNotificationCenter defaultCenter] removeObserver:token];
        [guard.observers removeAllObjects];
        [[AVAudioSession sharedInstance] setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
    }
}
int32_t buddy_ios_protect_storage(const char *path) {
    @autoreleasepool {
        NSString *folder = path ? [NSString stringWithUTF8String:path] : nil;
        if (!folder) return 0;
        NSURL *url = [NSURL fileURLWithPath:folder isDirectory:YES];
        NSError *error = nil;
        if (![url setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:&error]) return 0;
        // Lets an explicitly started recording finish while the phone is locked.
        return [[NSFileManager defaultManager] setAttributes:@{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication} ofItemAtPath:folder error:&error] ? 1 : 0;
    }
}
void buddy_ios_share(const uint8_t *bytes, uintptr_t count, const char *filename, void *context, BuddyIOSPermissionCallback callback) {
    @autoreleasepool {
        // Copies caller memory before dispatching. No arbitrary path is accepted.
        NSData *data = [NSData dataWithBytes:bytes length:count];
        NSString *name = filename ? [NSString stringWithUTF8String:filename] : nil;
        if (!data || !name) { callback(context, 0); return; }
        dispatch_async(dispatch_get_main_queue(), ^{
            UIWindow *window = nil;
            for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
                if (scene.activationState != UISceneActivationStateForegroundActive || ![scene isKindOfClass:UIWindowScene.class]) continue;
                for (UIWindow *candidate in ((UIWindowScene *)scene).windows) if (candidate.isKeyWindow) window = candidate;
            }
            UIViewController *root = window.rootViewController;
            while (root.presentedViewController) root = root.presentedViewController;
            if (!root) { callback(context, 0); return; }
            NSURL *folder = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString] isDirectory:YES];
            NSFileManager *files = NSFileManager.defaultManager;
            NSURL *url = [folder URLByAppendingPathComponent:name];
            if (![files createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:@{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication} error:nil] || ![data writeToURL:url options:NSDataWritingAtomic error:nil]) {
                [files removeItemAtURL:folder error:nil]; callback(context, 0); return;
            }
            UIActivityViewController *share = [[UIActivityViewController alloc] initWithActivityItems:@[url] applicationActivities:nil];
            share.completionWithItemsHandler = ^(UIActivityType activity, BOOL completed, NSArray *items, NSError *error) {
                [files removeItemAtURL:folder error:nil];
            };
            share.popoverPresentationController.sourceView = root.view;
            share.popoverPresentationController.sourceRect = CGRectMake(CGRectGetMidX(root.view.bounds), CGRectGetMaxY(root.view.bounds), 1, 1);
            [root presentViewController:share animated:YES completion:^{ callback(context, 1); }];
        });
    }
}
