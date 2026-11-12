/** MurmurHash3 x86 32-bit, seed 0, UTF-8 input; unsigned result. */
export function murmurhash3(input: string): number {
  const bytes = new TextEncoder().encode(input);
  let h = 0;
  let i = 0;
  const mix = (k: number) => {
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    return Math.imul(k, 0x1b873593);
  };
  for (; i + 4 <= bytes.length; i += 4) {
    const k =
      (bytes[i] ?? 0) |
      ((bytes[i + 1] ?? 0) << 8) |
      ((bytes[i + 2] ?? 0) << 16) |
      ((bytes[i + 3] ?? 0) << 24);
    h ^= mix(k);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  let tail = 0;
  for (let j = 0; i + j < bytes.length; j++)
    tail |= (bytes[i + j] ?? 0) << (8 * j);
  if (i < bytes.length) h ^= mix(tail);
  h ^= bytes.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
