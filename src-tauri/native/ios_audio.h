#pragma once
#include <stdint.h>
typedef void (*BuddyIOSPermissionCallback)(void *, int32_t);
int32_t buddy_ios_microphone_permission(void);
void buddy_ios_request_microphone(void *, BuddyIOSPermissionCallback);
int32_t buddy_ios_open_settings(void);
void *buddy_ios_audio_begin(void);
int32_t buddy_ios_audio_event(void *);
void buddy_ios_audio_end(void *);
int32_t buddy_ios_protect_storage(const char *);
void buddy_ios_share(const uint8_t *, uintptr_t, const char *, void *, BuddyIOSPermissionCallback);
