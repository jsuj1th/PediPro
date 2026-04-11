export function setLocal(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function removeLocal(key: string): void {
  localStorage.removeItem(key);
}
