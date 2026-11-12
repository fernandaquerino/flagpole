'use client';
import { useState } from 'react';
import { Plus, Trash, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import {
  operatorSchema,
  type Clause,
  type FlagValue,
  type Rule,
  type Serve,
} from '@flagpole/shared';
export function VariationSelect({
  values,
  value,
  onChange,
  label = 'Variation',
}: {
  values: FlagValue[];
  value: number;
  onChange: (v: number) => void;
  label?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {values.map((v, i) => (
        <option value={i} key={i}>
          {String(v)} · variation {i + 1}
        </option>
      ))}
    </select>
  );
}
export function ServeEditor({
  value,
  values,
  onChange,
  label,
}: {
  value: Serve;
  values: FlagValue[];
  onChange: (v: Serve) => void;
  label: string;
}) {
  const rollout = typeof value !== 'number';
  return (
    <div className="serve-editor">
      <div className="serve-select">
        <label>
          {label}
          <select
            value={rollout ? 'rollout' : 'variation'}
            onChange={(e) =>
              onChange(
                e.target.value === 'variation'
                  ? 0
                  : {
                      buckets: values.map((_, i) => ({
                        variation: i,
                        weight:
                          i === values.length - 1
                            ? 10000 -
                              Math.floor(10000 / values.length) *
                                (values.length - 1)
                            : Math.floor(10000 / values.length),
                      })),
                    },
              )
            }
          >
            <option value="variation">Serve one variation</option>
            <option value="rollout">Percentage rollout</option>
          </select>
        </label>
        {!rollout && (
          <label>
            Variation
            <VariationSelect
              values={values}
              value={value}
              onChange={onChange}
              label={`${label} variation`}
            />
          </label>
        )}
      </div>
      {rollout && (
        <div className="rollout">
          {value.buckets.map((bucket, i) => (
            <div className="rollout-row" key={i}>
              <span>{String(values[bucket.variation])}</span>
              <input
                aria-label={`${label} ${String(values[bucket.variation])} percentage`}
                type="range"
                min={0}
                max={10000}
                step={1}
                disabled={i === value.buckets.length - 1}
                value={bucket.weight}
                onChange={(e) => {
                  const buckets = value.buckets.map((b, n) =>
                    n === i ? { ...b, weight: Number(e.target.value) } : b,
                  );
                  const last = buckets.at(-1)!;
                  last.weight = Math.max(
                    0,
                    10000 -
                      buckets.slice(0, -1).reduce((s, b) => s + b.weight, 0),
                  );
                  onChange({ buckets });
                }}
              />
              <output>{(bucket.weight / 100).toFixed(2)}%</output>
            </div>
          ))}
          <small
            className={
              value.buckets.reduce((s, b) => s + b.weight, 0) !== 10000
                ? 'error-text'
                : ''
            }
          >
            Total:{' '}
            {(value.buckets.reduce((s, b) => s + b.weight, 0) / 100).toFixed(2)}
            % · The last variation receives the remainder.
          </small>
        </div>
      )}
    </div>
  );
}
function ClauseEditor({
  clause,
  onChange,
  onRemove,
}: {
  clause: Clause;
  onChange: (c: Clause) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(JSON.stringify(clause.values));
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="clause">
      <label>
        Attribute
        <input
          value={clause.attribute}
          placeholder="plan"
          onChange={(e) => onChange({ ...clause, attribute: e.target.value })}
        />
      </label>
      <label>
        Operator
        <select
          value={clause.operator}
          onChange={(e) =>
            onChange({
              ...clause,
              operator: e.target.value as Clause['operator'],
            })
          }
        >
          {operatorSchema.options.map((o) => (
            <option key={o} value={o}>
              {o.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Values (JSON array)
        <input
          aria-invalid={invalid}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            try {
              const parsed: unknown = JSON.parse(e.target.value);
              if (
                !Array.isArray(parsed) ||
                !parsed.length ||
                parsed.some(
                  (v) => !['string', 'number', 'boolean'].includes(typeof v),
                )
              )
                throw new Error();
              setInvalid(false);
              onChange({ ...clause, values: parsed });
            } catch {
              setInvalid(true);
              onChange({ ...clause, values: [] });
            }
          }}
        />
        {invalid && (
          <small className="error-text">Use an array, e.g. ["pro"]</small>
        )}
      </label>
      <button
        className="icon-button"
        type="button"
        aria-label="Remove condition"
        onClick={onRemove}
      >
        <Trash size={17} />
      </button>
    </div>
  );
}
export function RulesBuilder({
  rules,
  values,
  onChange,
}: {
  rules: Rule[];
  values: FlagValue[];
  onChange: (rules: Rule[]) => void;
}) {
  function update(index: number, rule: Rule) {
    onChange(rules.map((r, i) => (i === index ? rule : r)));
  }
  function move(index: number, delta: number) {
    const next = [...rules];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    onChange(next);
  }
  return (
    <section className="editor-section">
      <div className="section-heading">
        <div>
          <h2>Targeting rules</h2>
          <p>Rules run in order. The first match wins.</p>
        </div>
        <button
          onClick={() =>
            onChange([
              ...rules,
              {
                id: crypto.randomUUID(),
                clauses: [
                  { attribute: 'plan', operator: 'in', values: ['pro'] },
                ],
                serve: 1,
              },
            ])
          }
        >
          <Plus size={16} />
          Add rule
        </button>
      </div>
      {rules.length === 0 ? (
        <div className="rules-empty">
          No targeting rules. Everyone receives the default below.
        </div>
      ) : (
        rules.map((r, i) => (
          <div className="rule" key={r.id}>
            <div className="rule-heading">
              <strong>
                <span className="rule-number">{i + 1}</span>When all conditions
                match
              </strong>
              <div>
                <button
                  className="icon-button"
                  aria-label={`Move rule ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move rule ${i + 1} down`}
                  disabled={i === rules.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete rule ${i + 1}`}
                  onClick={() => onChange(rules.filter((_, n) => i !== n))}
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
            {r.clauses.map((c, n) => (
              <ClauseEditor
                key={n}
                clause={c}
                onRemove={() =>
                  update(i, {
                    ...r,
                    clauses: r.clauses.filter((_, x) => x !== n),
                  })
                }
                onChange={(c) =>
                  update(i, {
                    ...r,
                    clauses: r.clauses.map((old, x) => (x === n ? c : old)),
                  })
                }
              />
            ))}
            <button
              className="text-button"
              onClick={() =>
                update(i, {
                  ...r,
                  clauses: [
                    ...r.clauses,
                    { attribute: 'country', operator: 'in', values: ['BR'] },
                  ],
                })
              }
            >
              <Plus size={14} />
              Add condition
            </button>
            <ServeEditor
              value={r.serve}
              values={values}
              label={`Rule ${i + 1} serves`}
              onChange={(serve) => update(i, { ...r, serve })}
            />
          </div>
        ))
      )}
    </section>
  );
}
