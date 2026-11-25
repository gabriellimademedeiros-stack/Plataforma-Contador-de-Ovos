"use client";
/**
 * Fila local do app de campo (Parte 14.21): quando não há internet, o apontamento fica guardado no IndexedDB
 * do aparelho e é reenviado quando a conexão voltar.
 */
const DB = "ovos-campo";
const STORE = "fila";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function enqueue(body: unknown): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ body, at: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pending(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  const db = await open();
  return new Promise((resolve) => {
    const r = db.transaction(STORE).objectStore(STORE).count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(0);
  });
}

/** Reenvia a fila em ordem; para no primeiro erro de rede. Devolve quantos foram enviados. */
export async function flush(): Promise<number> {
  if (typeof indexedDB === "undefined" || !navigator.onLine) return 0;
  const db = await open();
  const items: Array<{ id: number; body: unknown }> = await new Promise((resolve) => {
    const r = db.transaction(STORE).objectStore(STORE).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve([]);
  });
  let sent = 0;
  for (const it of items) {
    try {
      const r = await fetch("/api/campo/registro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(it.body) });
      if (r.status >= 500) break;
    } catch {
      break;
    }
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(it.id);
      tx.oncomplete = () => resolve();
    });
    sent++;
  }
  return sent;
}
