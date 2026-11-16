import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { nsisAppHash } from './installer-integrity.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
test('hashes the installed NSIS stamp without changing the loose executable', () => {
  const loose = Buffer.from('app\0__TAURI_BUNDLE_TYPE_VAR_UNK\0resources');
  const original = Buffer.from(loose);
  const installed = Buffer.from('app\0__TAURI_BUNDLE_TYPE_VAR_NSS\0resources');
  assert.equal(nsisAppHash(loose), hash(installed));
  assert.deepEqual(loose, original);
  assert.equal(nsisAppHash(installed), hash(installed));
});
test('rejects missing, duplicate and unsupported bundle stamps', () => {
  for (const bytes of ['app', '__TAURI_BUNDLE_TYPE_VAR_MSI', '__TAURI_BUNDLE_TYPE_VAR_UNK__TAURI_BUNDLE_TYPE_VAR_NSS']) {
    assert.throws(() => nsisAppHash(Buffer.from(bytes)));
  }
});
test('all other installed bytes remain covered by the expected hash', () => {
  const loose = Buffer.from('app\0__TAURI_BUNDLE_TYPE_VAR_UNK\0resources');
  const changed = Buffer.from('app\0__TAURI_BUNDLE_TYPE_VAR_NSS\0resourceX');
  assert.notEqual(nsisAppHash(loose), hash(changed));
});
