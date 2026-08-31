/**
 * Nested AND/OR/NOT condition tree for the no-code policy rule builder (brief §21).
 * Deliberately a small, closed grammar (not an embedded scripting language) so that
 * every condition a tenant can author is representable in the admin dashboard's
 * rule builder UI and is trivially serializable to/from JSON for storage in
 * `rules.condition` (see apps/api/src/db/schema.ts).
 */

export type ComparisonOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin';

export interface FactCondition {
  fact: string;
  op: ComparisonOperator;
  value: unknown;
}

export interface AndCondition {
  and: RuleCondition[];
}

export interface OrCondition {
  or: RuleCondition[];
}

export interface NotCondition {
  not: RuleCondition;
}

export type RuleCondition = FactCondition | AndCondition | OrCondition | NotCondition;

export type FactMap = Record<string, unknown>;

export function isFactCondition(c: RuleCondition): c is FactCondition {
  return (c as FactCondition).fact !== undefined;
}

export function isAndCondition(c: RuleCondition): c is AndCondition {
  return Array.isArray((c as AndCondition).and);
}

export function isOrCondition(c: RuleCondition): c is OrCondition {
  return Array.isArray((c as OrCondition).or);
}

export function isNotCondition(c: RuleCondition): c is NotCondition {
  return (c as NotCondition).not !== undefined;
}
