/**
 * Deterministic (UUIDv5) ids for records that exist at most once per day.
 *
 * If two devices — or one device, offline, twice — create "the Exercise log for
 * 2026-09-29", they independently compute the same id, so sync merges them instead of
 * creating duplicates. The user id is part of the name so ids never collide across users.
 *
 * Pure JS (no crypto module) so it runs identically in Node and React Native.
 */

/** Fixed namespace for this app's v5 ids. Never change it: existing ids depend on it. */
const APP_NAMESPACE = '4d2c6f0e-8f3a-5b7d-9c1e-2a6b8d0f4e13';

export const dailyRoutineId = (userId: string, localDate: string) =>
  uuidv5(`${userId}:routine:${localDate}`, APP_NAMESPACE);

export const habitLogId = (userId: string, habitId: string, localDate: string) =>
  uuidv5(`${userId}:habit-log:${habitId}:${localDate}`, APP_NAMESPACE);

export const journalAnswerId = (userId: string, localDate: string, questionId: string) =>
  uuidv5(`${userId}:answer:${localDate}:${questionId}`, APP_NAMESPACE);

/** Id for a built-in emotion option, identical on every device for the same user. */
export const defaultEmotionId = (userId: string, name: string) =>
  uuidv5(`${userId}:emotion:${name.toLowerCase()}`, APP_NAMESPACE);

/** Id for the one weekly or monthly review of a period. */
export const planReviewId = (userId: string, level: 'week' | 'month', periodStart: string) =>
  uuidv5(`${userId}:plan-review:${level}:${periodStart}`, APP_NAMESPACE);

/** The occurrence of a repeating block or task on one day: the same id on every device. */
export const seriesInstanceId = (userId: string, seriesId: string, localDate: string) =>
  uuidv5(`${userId}:series:${seriesId}:${localDate}`, APP_NAMESPACE);

export function uuidv5(name: string, namespace: string): string {
  const ns = parseUuid(namespace);
  const nameBytes = utf8(name);
  const input = new Uint8Array(ns.length + nameBytes.length);
  input.set(ns);
  input.set(nameBytes, ns.length);
  const hash = sha1(input);
  const b = hash.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  return formatUuid(b);
}

function parseUuid(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('Invalid UUID');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function formatUuid(b: Uint8Array): string {
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

/** SHA-1 (FIPS 180-4). Used only for UUIDv5 name hashing, not for security. */
export function sha1(msg: Uint8Array): Uint8Array {
  const bitLen = msg.length * 8;
  const total = Math.ceil((msg.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(total - 4, bitLen >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let off = 0; off < total; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3]! ^ w[t - 8]! ^ w[t - 14]! ^ w[t - 16]!;
      w[t] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      let fn: number;
      let k: number;
      if (t < 20) {
        fn = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        fn = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        fn = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        fn = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + fn + e + k + w[t]!) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
  return out;
}
