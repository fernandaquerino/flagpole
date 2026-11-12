import { describe, it, expect } from 'vitest';
import { evaluate, matches, murmurhash3 } from '../src/index.js';
import {
  configSchema,
  type Config,
  type Flag,
  type Clause,
} from '@flagpole/shared';
const flag: Flag = {
  key: 'checkout',
  type: 'boolean',
  variations: [false, true],
  description: '',
};
const config: Config = {
  enabled: true,
  offVariation: 0,
  fallthrough: 1,
  rules: [],
  version: 1,
  salt: 'stable',
};
describe('evaluation', () => {
  it.each([
    ['missing', undefined, config, 'FLAG_NOT_FOUND', null],
    [
      'archived',
      { ...flag, archivedAt: '2026-01-01' },
      config,
      'FLAG_NOT_FOUND',
      null,
    ],
    ['missing config', flag, undefined, 'FLAG_NOT_FOUND', null],
    ['off', flag, { ...config, enabled: false }, 'OFF', false],
    ['fallthrough', flag, config, 'FALLTHROUGH', true],
    ['invalid', flag, { ...config, fallthrough: 9 }, 'INVALID_CONFIG', null],
  ] as const)('%s', (_, f, c, reason, value) =>
    expect(evaluate(f, c, { key: 'opaque' })).toMatchObject({ reason, value }),
  );
  it('matches first rule, ANDs clauses, and reports id', () => {
    const rule = {
      id: 'pro',
      clauses: [
        { attribute: 'plan', operator: 'in' as const, values: ['pro'] },
      ],
      serve: 0,
    };
    expect(
      evaluate(
        flag,
        { ...config, rules: [rule, { ...rule, id: 'later', serve: 1 }] },
        { key: 'x', plan: 'pro' },
      ),
    ).toMatchObject({ value: false, reason: 'RULE_MATCH', ruleId: 'pro' });
    expect(
      evaluate(
        flag,
        {
          ...config,
          rules: [
            {
              ...rule,
              clauses: [
                ...rule.clauses,
                { attribute: 'country', operator: 'in', values: ['BR'] },
              ],
            },
          ],
        },
        { key: 'x', plan: 'pro' },
      ).reason,
    ).toBe('FALLTHROUGH');
  });
  it.each([
    ['in', 'pro', ['pro'], true],
    ['not_in', 'free', ['pro'], true],
    ['not_in', undefined, ['pro'], false],
    ['starts_with', 'abacus', ['ab'], true],
    ['ends_with', 'abacus', ['cus'], true],
    ['contains', 'abacus', ['bac'], true],
    ['contains', 10, ['1'], false],
    ['in', 1, ['1'], false],
    ['semver_gte', '2.0.0', ['1.10.0'], true],
    ['semver_lt', '2.0.0-beta.1', ['2.0.0'], true],
    ['semver_gte', 'bad', ['1.0.0'], false],
    ['semver_lt', '1.0.0', ['bad'], false],
  ] as const)('operator %s %s', (operator, actual, values, expected) => {
    expect(
      matches({ attribute: 'a', operator, values: [...values] } as Clause, {
        key: 'k',
        ...(actual === undefined ? {} : { a: actual }),
      }),
    ).toBe(expected);
  });
  it('supports string flags', () =>
    expect(
      evaluate(
        { ...flag, type: 'string', variations: ['old', 'new'] },
        config,
        { key: 'x' },
      ).value,
    ).toBe('new'));
  it('rejects malformed weights', () =>
    expect(
      configSchema.safeParse({
        ...config,
        fallthrough: { buckets: [{ variation: 0, weight: 9999 }] },
      }).success,
    ).toBe(false));
  it('matches published Murmur3 vectors', () => {
    expect(murmurhash3('')).toBe(0);
    expect(murmurhash3('foo')).toBe(0xf6a5c420);
    expect(murmurhash3('hello')).toBe(613153351);
  });
  it('distributes 100,000 seeded random keys within one percentage point and only moves forward', () => {
    let state = 42;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state.toString(36);
    };
    const rollout = (weight: number): Config => ({
      ...config,
      fallthrough: {
        buckets: [
          { variation: 1, weight },
          { variation: 0, weight: 10000 - weight },
        ],
      },
    });
    const a = rollout(2500),
      b = rollout(4000);
    let count = 0;
    for (let i = 0; i < 100000; i++) {
      const ctx = { key: random() + random() };
      const before = evaluate(flag, a, ctx);
      const after = evaluate(flag, b, ctx);
      if (before.value) {
        count++;
        if (!after.value) throw new Error('Non-monotonic rollout');
      }
      if (evaluate(flag, a, ctx).value !== before.value)
        throw new Error('Unstable bucket');
    }
    expect(count / 100000).toBeGreaterThan(0.24);
    expect(count / 100000).toBeLessThan(0.26);
  });
});
