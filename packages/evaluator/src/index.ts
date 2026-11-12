import semver from 'semver';
import {
  configSchema,
  validConfigReferences,
  type Clause,
  type Config,
  type Context,
  type Evaluation,
  type Flag,
  type Serve,
} from '@flagpole/shared';
import { murmurhash3 } from './hash.js';
export { murmurhash3 } from './hash.js';
export function matches(clause: Clause, context: Context): boolean {
  if (!Object.prototype.hasOwnProperty.call(context, clause.attribute))
    return false;
  const actual = context[clause.attribute];
  if (clause.operator === 'in') return clause.values.includes(actual!);
  if (clause.operator === 'not_in') return !clause.values.includes(actual!);
  if (typeof actual !== 'string') return false;
  return clause.values.some((value) => {
    if (typeof value !== 'string') return false;
    switch (clause.operator) {
      case 'starts_with':
        return actual.startsWith(value);
      case 'ends_with':
        return actual.endsWith(value);
      case 'contains':
        return actual.includes(value);
      case 'semver_gte':
        return (
          !!semver.valid(actual) &&
          !!semver.valid(value) &&
          semver.gte(actual, value)
        );
      case 'semver_lt':
        return (
          !!semver.valid(actual) &&
          !!semver.valid(value) &&
          semver.lt(actual, value)
        );
      default:
        return false;
    }
  });
}
function variation(
  serve: Serve,
  flagKey: string,
  salt: string,
  key: string,
): number {
  if (typeof serve === 'number') return serve;
  const bucket = murmurhash3(`${flagKey}.${salt}.${key}`) % 10000;
  let end = 0;
  for (const b of serve.buckets) {
    end += b.weight;
    if (bucket < end) return b.variation;
  }
  return -1;
}
export function evaluate(
  flag: Flag | undefined,
  config: Config | undefined,
  context: Context,
): Evaluation {
  if (!flag || flag.archivedAt || !config)
    return { value: null, variationIndex: null, reason: 'FLAG_NOT_FOUND' };
  if (
    !configSchema.safeParse(config).success ||
    !validConfigReferences(flag, config)
  )
    return { value: null, variationIndex: null, reason: 'INVALID_CONFIG' };
  const rule = config.enabled
    ? config.rules.find((r) => r.clauses.every((c) => matches(c, context)))
    : undefined;
  const reason = !config.enabled ? 'OFF' : rule ? 'RULE_MATCH' : 'FALLTHROUGH';
  const index = !config.enabled
    ? config.offVariation
    : variation(
        rule?.serve ?? config.fallthrough,
        flag.key,
        config.salt,
        context.key,
      );
  const value = flag.variations[index];
  if (value === undefined)
    return { value: null, variationIndex: null, reason: 'INVALID_CONFIG' };
  return {
    value,
    variationIndex: index,
    reason,
    ...(rule ? { ruleId: rule.id } : {}),
  };
}
