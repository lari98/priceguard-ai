import { Injectable, BadRequestException } from '@nestjs/common';
import {
  FactMap,
  RuleCondition,
  isAndCondition,
  isFactCondition,
  isNotCondition,
  isOrCondition,
} from './rule-engine.types';

/**
 * Pure, side-effect-free evaluator for the nested AND/OR/NOT rule grammar (brief §21).
 * Kept dependency-free and framework-agnostic on purpose: it is unit-testable without
 * NestJS's DI container or a database, and is the single place "what does a rule mean"
 * is defined, so the admin dashboard's rule builder and the runtime evaluator can never
 * silently disagree.
 */
@Injectable()
export class RuleEngineService {
  evaluate(condition: RuleCondition, facts: FactMap): boolean {
    if (isAndCondition(condition)) {
      return condition.and.every((c) => this.evaluate(c, facts));
    }
    if (isOrCondition(condition)) {
      return condition.or.some((c) => this.evaluate(c, facts));
    }
    if (isNotCondition(condition)) {
      return !this.evaluate(condition.not, facts);
    }
    if (isFactCondition(condition)) {
      return this.evaluateFact(condition.fact, condition.op, condition.value, facts);
    }
    throw new BadRequestException(`Unrecognised rule condition shape: ${JSON.stringify(condition)}`);
  }

  private evaluateFact(
    factName: string,
    op: string,
    expected: unknown,
    facts: FactMap,
  ): boolean {
    const actual = facts[factName];

    // A fact the engine has never heard of is a configuration error, not a silent
    // false — surfacing it loudly is safer than letting a typo'd fact name quietly
    // make a rule permanently non-matching (brief §50: no placeholder behaviour).
    if (!(factName in facts)) {
      throw new BadRequestException(
        `Unknown fact "${factName}" referenced in a policy rule. Known facts: ${Object.keys(facts).join(', ')}`,
      );
    }

    switch (op) {
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'gt':
        return this.asNumber(actual, factName) > this.asNumber(expected, factName);
      case 'gte':
        return this.asNumber(actual, factName) >= this.asNumber(expected, factName);
      case 'lt':
        return this.asNumber(actual, factName) < this.asNumber(expected, factName);
      case 'lte':
        return this.asNumber(actual, factName) <= this.asNumber(expected, factName);
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'nin':
        return Array.isArray(expected) && !expected.includes(actual);
      default:
        throw new BadRequestException(`Unsupported comparison operator "${op}"`);
    }
  }

  private asNumber(value: unknown, factName: string): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new BadRequestException(`Fact "${factName}" is not numeric (got ${JSON.stringify(value)})`);
    }
    return value;
  }
}
