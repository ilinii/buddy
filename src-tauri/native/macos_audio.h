#pragma once
#include <stdint.h>
#include <stddef.h>

// All pointers passed to audio are borrowed only for the synchronous callback.
typedef struct {
    const uint8_t *data;
    uint32_t bytes;
    uint32_t channels;
} BuddyAudioPlane;
typedef void (*BuddyAudioCallback)(void *, const BuddyAudioPlane *, uint32_t, uint32_t, uint32_t, uint32_t, double);
typedef void (*BuddyAudioEvent)(void *, int32_t);
typedef void (*BuddyPermissionCallback)(void *, int32_t);

int32_t buddy_macos_audio_supported(void);
// source: 0 microphone, 1 system. State: 0 undetermined, 1 granted, 2 denied,
// 3 restricted, 4 required (screen preflight cannot distinguish denied/unasked).
int32_t buddy_macos_audio_permission(int32_t source);
void buddy_macos_request_audio_permission(int32_t source, void *, BuddyPermissionCallback);
void *buddy_macos_audio_create(void *, BuddyAudioCallback, BuddyAudioEvent);
// Synchronously detaches callbacks before returning, including pending startup.
// Native async teardown retains its own state and gates subsequent captures.
void buddy_macos_audio_destroy(void *);
