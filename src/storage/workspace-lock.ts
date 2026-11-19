/** Hold ownership before reading a snapshot, until its worker exits or initialization fails. */
export function acquireWorkspaceLock(): Promise<() => void> {
  if (!navigator.locks) return Promise.reject(new Error(
    'This browser cannot safely lock the workspace. Use a browser with Web Locks support over HTTPS or localhost.',
  ));
  return new Promise((resolve, reject) => {
    void navigator.locks.request('buddy-local:sqlite', { mode: 'exclusive', ifAvailable: true }, lock => {
      if (!lock) {
        reject(new Error('This workspace is already open in another tab. Close that tab, then reload this one.'));
        return;
      }
      return new Promise<void>(release => resolve(release));
    }).catch(reject);
  });
}
