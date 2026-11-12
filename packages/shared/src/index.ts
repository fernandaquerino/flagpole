import { z } from 'zod';
export const keySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
export const valueSchema = z.union([z.boolean(), z.string().max(1000)]);
export const contextSchema = z
  .object({ key: z.string().min(1).max(200) })
  .catchall(z.union([z.string().max(1000), z.number().finite(), z.boolean()]));
export const operatorSchema = z.enum([
  'in',
  'not_in',
  'starts_with',
  'ends_with',
  'contains',
  'semver_gte',
  'semver_lt',
]);
export const rolloutSchema = z
  .object({
    buckets: z
      .array(
        z.object({
          variation: z.number().int().nonnegative(),
          weight: z.number().int().min(0).max(10000),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((r, ctx) => {
    if (r.buckets.reduce((s, b) => s + b.weight, 0) !== 10000)
      ctx.addIssue({ code: 'custom', message: 'INVALID_ROLLOUT_WEIGHTS' });
  });
export const serveSchema = z.union([
  z.number().int().nonnegative(),
  rolloutSchema,
]);
export const clauseSchema = z.object({
  attribute: z.string().min(1).max(100),
  operator: operatorSchema,
  values: z
    .array(z.union([z.string().max(1000), z.number().finite(), z.boolean()]))
    .min(1)
    .max(100),
});
export const ruleSchema = z.object({
  id: z.string().min(1).max(100),
  clauses: z.array(clauseSchema).min(1).max(20),
  serve: serveSchema,
});
export const configSchema = z
  .object({
    enabled: z.boolean(),
    offVariation: z.number().int().nonnegative(),
    fallthrough: serveSchema,
    rules: z.array(ruleSchema).max(100),
    version: z.number().int().positive(),
    salt: z.string().min(1).max(200),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.rules.map((r) => r.id)).size !== c.rules.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate rule ids' });
  });
export const flagSchema = z
  .object({
    key: keySchema,
    type: z.enum(['boolean', 'string']),
    variations: z.array(valueSchema).min(2).max(100),
    description: z.string().max(2000).default(''),
    archivedAt: z.string().nullable().optional(),
  })
  .superRefine((f, ctx) => {
    if (f.variations.some((v) => typeof v !== f.type))
      ctx.addIssue({
        code: 'custom',
        message: 'Variations must match flag type',
      });
  });
export type Context = z.infer<typeof contextSchema>;
export type Flag = z.infer<typeof flagSchema>;
export type Config = z.infer<typeof configSchema>;
export type Clause = z.infer<typeof clauseSchema>;
export type Serve = z.infer<typeof serveSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type FlagValue = z.infer<typeof valueSchema>;
export type Evaluation =
  | {
      value: FlagValue;
      variationIndex: number;
      reason: 'OFF' | 'RULE_MATCH' | 'FALLTHROUGH';
      ruleId?: string;
    }
  | {
      value: null;
      variationIndex: null;
      reason: 'FLAG_NOT_FOUND' | 'INVALID_CONFIG';
    };
export type EvaluatedFlags = Record<string, Evaluation>;
export type FlagDefinition = { flag: Flag; config: Config };
export function validConfigReferences(flag: Flag, config: Config): boolean {
  const valid = (s: Serve) =>
    typeof s === 'number'
      ? s < flag.variations.length
      : s.buckets.every((b) => b.variation < flag.variations.length);
  return (
    config.offVariation < flag.variations.length &&
    valid(config.fallthrough) &&
    config.rules.every((r) => valid(r.serve))
  );
}
