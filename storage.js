// Drop-in replacement for Claude's window.storage API, backed by localStorage.
// NOTE: localStorage is per-device. The `shared` parameter is accepted for API
// compatibility but does nothing — every player will only see their own data
// unless you wire this up to a real backend (Firebase, Supabase, etc.).

const keyFor = (key, shared) => `wrencoria:${shared ? 'shared' : 'local'}:${key}`;

export const storage = {
  async get(key, shared = false) {
    const raw = localStorage.getItem(keyFor(key, shared));
    if (raw === null) return null;
    return { key, value: raw, shared };
  },

  async set(key, value, shared = false) {
    localStorage.setItem(keyFor(key, shared), value);
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    localStorage.removeItem(keyFor(key, shared));
    return { key, deleted: true, shared };
  },

  async list(prefix = '', shared = false) {
    const fullPrefix = keyFor(prefix, shared);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) {
        keys.push(k.replace(`wrencoria:${shared ? 'shared' : 'local'}:`, ''));
      }
    }
    return { keys, prefix, shared };
  },
};
