import crypto from 'node:crypto';

// Tauri temporarily stamps this reserved marker before NSIS embeds the app,
// then restores the loose build executable. Verify the bytes users receive.
export function nsisAppHash(executable) {
  const bytes = Buffer.from(executable);
  const marker = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_');
  const offset = bytes.indexOf(marker);
  if (offset < 0 || bytes.indexOf(marker, offset + marker.length) !== -1) {
    throw new Error('Expected exactly one Tauri bundle marker in buddy.exe');
  }
  const tagOffset = offset + marker.length;
  const tag = bytes.toString('ascii', tagOffset, tagOffset + 3);
  if (tag !== 'UNK' && tag !== 'NSS') {
    throw new Error(`Unsupported Tauri bundle marker: ${tag}`);
  }
  bytes.write('NSS', tagOffset, 3, 'ascii');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
