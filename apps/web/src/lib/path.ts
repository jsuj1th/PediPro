export function getByPath(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function setByPath(obj: Record<string, any>, path: string, value: any): Record<string, any> {
  const out = structuredClone(obj);
  const keys = path.split('.');
  let current: Record<string, any> = out;

  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return out;
}
