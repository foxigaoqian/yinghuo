type Storage = {
  getStorageInfoSync(): { keys: string[] };
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
};
type Draft = { key: string; value: unknown };
const belongs = (key: string, accountId: string) =>
  key.startsWith('yinghuo.') && key.split('.').includes(accountId);
const isDraft = (key: string) => /^yinghuo\.(profileDraft|memoryDraft|storyDraft)\./.test(key);

export function mergeLocalAccountData(storage: Storage, from: string, to: string) {
  const backupKey = 'yinghuo.mergedDrafts.' + to;
  const previous = storage.getStorageSync(backupKey);
  const backups: Draft[] = Array.isArray(previous) ? [...previous] : [];
  let conflicts = 0;
  for (const key of storage.getStorageInfoSync().keys) {
    if (!belongs(key, from)) continue;
    const value = storage.getStorageSync(key);
    const nextKey = key.replace('.' + from, '.' + to);
    if (key.startsWith('yinghuo.mergedDrafts.') && Array.isArray(value)) {
      backups.push(
        ...value.map((draft: Draft) => ({
          ...draft,
          key: draft.key.replace('.' + from, '.' + to),
        })),
      );
      storage.setStorageSync(backupKey, backups);
    } else if (!storage.getStorageSync(nextKey)) {
      storage.setStorageSync(nextKey, value);
    } else if (isDraft(key)) {
      backups.push({ key: nextKey, value });
      storage.setStorageSync(backupKey, backups);
      conflicts++;
    }
    storage.removeStorageSync(key);
  }
  return conflicts;
}

export function exportLocalDrafts(storage: Storage, accountId: string) {
  return storage
    .getStorageInfoSync()
    .keys.filter(
      (key) => belongs(key, accountId) && (isDraft(key) || key.startsWith('yinghuo.mergedDrafts.')),
    )
    .map((key) => ({ key, value: storage.getStorageSync(key) }));
}

export function clearLocalAccountData(storage: Storage, accountId: string, profileId?: string) {
  for (const key of storage.getStorageInfoSync().keys) {
    if (!belongs(key, accountId)) continue;
    if (!profileId || key.split('.').includes(profileId)) storage.removeStorageSync(key);
    else if (key.startsWith('yinghuo.mergedDrafts.')) {
      const drafts = storage.getStorageSync(key);
      if (Array.isArray(drafts))
        storage.setStorageSync(
          key,
          drafts.filter((draft: Draft) => !draft.key.split('.').includes(profileId)),
        );
    } else if (
      key === 'yinghuo.current.' + accountId &&
      storage.getStorageSync(key) === profileId
    ) {
      storage.removeStorageSync(key);
    }
  }
  if (!profileId && storage.getStorageSync('yinghuo.lastUserId') === accountId)
    storage.removeStorageSync('yinghuo.lastUserId');
}
