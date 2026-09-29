type Handler<T> = (payload: T) => void;

/** Minimal typed event bus. */
export class Emitter<M extends Record<string, unknown>> {
  private map = new Map<keyof M, Set<Handler<any>>>();
  on<K extends keyof M>(key: K, fn: Handler<M[K]>) {
    let set = this.map.get(key);
    if (!set) this.map.set(key, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }
  emit<K extends keyof M>(key: K, payload: M[K]) {
    const set = this.map.get(key);
    if (!set) return;
    for (const fn of set) fn(payload);
  }
  clear() {
    this.map.clear();
  }
}
