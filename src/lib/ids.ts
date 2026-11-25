/**
 * Identificadores determinísticos (UUID no formato v4-like) gerados a partir de um nome.
 * Mesmo nome → mesmo id, em memória e no banco. Usado para entidades semeadas pelo gerador.
 */
function h32(str: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

export function uuidFromName(name: string): string {
  const parts = [h32(name, 1), h32(name, 2), h32(name, 3), h32(name, 4)].map((n) => n.toString(16).padStart(8, "0"));
  const hex = parts.join("");
  const v = (parseInt(hex[16], 16) & 0x3) | 0x8;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${v.toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const TENANT_ID = uuidFromName("tenant:demo");
export const FARM_ID = uuidFromName("farm:demo");
export const houseIdFor = (code: string) => uuidFromName(`house:${code}`);
export const flockIdFor = (code: string) => uuidFromName(`flock:${code}`);
export const strainIdFor = (code: string) => uuidFromName(`strain:${code}`);
export const deviceIdFor = (code: string) => uuidFromName(`device:${code}`);
export const userIdFor = (email: string) => uuidFromName(`user:${email}`);
export const feedBatchIdFor = (code: string) => uuidFromName(`feed:${code}`);
