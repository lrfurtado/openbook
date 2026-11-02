// The web has no keychain; the PIN hash lives in localStorage (it only gates parent screens).
export const secure = {
  get: async (key: string) => localStorage.getItem(key),
  set: async (key: string, value: string) => localStorage.setItem(key, value),
  remove: async (key: string) => localStorage.removeItem(key),
};
