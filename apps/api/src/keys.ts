import { createHash, randomBytes } from 'node:crypto';
export const hashKey = (key: string) =>
  createHash('sha256').update(key).digest('hex');
export const newKey = (kind: 'client' | 'server') =>
  `fp_${kind}_${randomBytes(32).toString('hex')}`;
