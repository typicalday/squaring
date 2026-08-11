// Frontmatter schemas for Square and Change — SPEC §6, §7, §9.
// Strictness rule (§6): unknown fields outside `extensions` are errors,
// enforced with z.strictObject at every level.

import * as z from 'zod';
import { ID_RE } from './ids.ts';

const id = z.string().regex(ID_RE, 'ids are lowercase kebab: [a-z0-9][a-z0-9-]*');

const squareUriSchema = z
  .string()
  .regex(/^square:\/\/[a-z0-9][a-z0-9-]*$/, 'expected a square://<id> URI');

const claimUriSchema = z
  .string()
  .regex(
    /^square:\/\/[a-z0-9][a-z0-9-]*#(commitment|contract|decision|scenario|unresolved)\/[a-z0-9][a-z0-9-]*$/,
    'expected a square://<id>#<facet>/<claim-id> URI'
  );

const relationshipTargetSchema = z
  .string()
  .regex(/^(square|external):\/\/[a-z0-9][a-z0-9-]*$/, 'expected square://<id> or external://<name>');

// Extension keys must be reverse-DNS namespaced (§6).
const extensionsSchema = z.record(
  z.string().regex(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/, 'extension keys must be namespaced, e.g. com.example.security'),
  z.unknown()
);

export const COMMITMENT_KINDS = ['invariant', 'boundary', 'constraint', 'preference', 'assumption'] as const;
export const STRENGTHS = ['must', 'must-not', 'should', 'should-not'] as const;
export const EVIDENCE_CLASSES = ['static-analysis', 'schema', 'test', 'runtime', 'model-judgment', 'none'] as const;
export const ARCHETYPES = ['capability', 'domain', 'platform', 'boundary', 'policy'] as const;
export const CHANGE_TYPES = ['evolution', 'refactor', 'repair', 'adoption'] as const;
export const CHANGE_PHASES = ['draft', 'active', 'blocked', 'done', 'abandoned'] as const;

const commitmentSchema = z.strictObject({
  id,
  kind: z.enum(COMMITMENT_KINDS),
  strength: z.enum(STRENGTHS),
  statement: z.string().min(1),
  evidenceClass: z.enum(EVIDENCE_CLASSES).optional(),
  // Only meaningful on archetype: policy squares (§7); validated in validate.ts.
  appliesTo: z.union([z.literal('*'), z.array(squareUriSchema).min(1)]).optional()
});

const providedContractSchema = z.strictObject({
  id,
  statement: z.string().min(1),
  schemaRef: z.string().optional()
});

const consumedContractSchema = z.strictObject({
  id,
  from: squareUriSchema,
  statement: z.string().min(1)
});

const relationshipSchema = z.strictObject({
  type: z.enum(['dependsOn', 'usesExternal']),
  target: relationshipTargetSchema,
  // Contract id declared under the target square's contracts.provides (§6).
  through: id.optional()
});

const decisionSchema = z.strictObject({
  id,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date is YYYY-MM-DD')
    .optional(),
  choice: z.string().min(1),
  rationale: z.string().optional(),
  // Provenance: the Change that promoted this decision (§9). Validation
  // errors when that Change is missing or not done — promotion happens only
  // at completion.
  from: z.string().regex(/^change:\/\/[a-z0-9][a-z0-9-]*$/, 'expected a change://<id> URI').optional(),
  supersededBy: id.nullable().optional()
});

const scenarioSchema = z.strictObject({
  id,
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.array(z.string().min(1)).min(1),
  evidenceClass: z.enum(EVIDENCE_CLASSES).optional()
});

const unresolvedSchema = z.strictObject({
  id,
  question: z.string().min(1),
  affects: z.array(z.string()).optional()
});

const authoritySchema = z.strictObject({
  owns: z.array(z.string()).optional(),
  constrains: z.array(z.string()).optional(),
  delegates: z.array(z.string()).optional()
});

export const SquareSchema = z.strictObject({
  apiVersion: z.literal('squaring/v0'),
  kind: z.literal('Square'),
  id,
  name: z.string().min(1),
  archetype: z.enum(ARCHETYPES).optional(),
  partOf: id.optional(),
  purpose: z.string().min(1),
  nonGoals: z.array(z.string()).optional(),
  owns: z
    .strictObject({
      concepts: z.array(z.string()).optional(),
      state: z.array(z.string()).optional()
    })
    .optional(),
  contracts: z
    .strictObject({
      provides: z.array(providedContractSchema).optional(),
      consumes: z.array(consumedContractSchema).optional()
    })
    .optional(),
  commitments: z.array(commitmentSchema).optional(),
  relationships: z.array(relationshipSchema).optional(),
  decisions: z.array(decisionSchema).optional(),
  scenarios: z.array(scenarioSchema).optional(),
  unresolved: z.array(unresolvedSchema).optional(),
  authority: authoritySchema.optional(),
  bindings: z.array(z.string()).optional(),
  extensions: extensionsSchema.optional()
});

export type Square = z.infer<typeof SquareSchema>;
export type Commitment = z.infer<typeof commitmentSchema>;

export const ChangeSchema = z.strictObject({
  apiVersion: z.literal('squaring/v0'),
  kind: z.literal('Change'),
  id,
  name: z.string().min(1),
  type: z.enum(CHANGE_TYPES),
  intent: z.string().min(1),
  targets: z.array(squareUriSchema).min(1),
  base: z
    .strictObject({
      codeRevision: z.string().optional()
    })
    .optional(),
  constraints: z.array(z.string()).optional(),
  proposedDecisions: z
    .array(
      z.strictObject({
        id,
        choice: z.string().min(1),
        rationale: z.string().optional()
      })
    )
    .optional(),
  // Required even when empty: an empty list is the explicit statement that
  // no meaning changes (§9); emptiness rules per type live in validate.ts.
  semanticDiff: z.array(z.string()),
  phase: z.enum(CHANGE_PHASES),
  status: z
    .strictObject({
      done: z.array(z.string()).optional(),
      inProgress: z.array(z.string()).optional(),
      blocked: z
        .array(
          z.strictObject({
            reason: z.string().min(1),
            affects: z.array(z.string()).optional()
          })
        )
        .optional(),
      next: z.array(z.string()).optional()
    })
    .optional(),
  suspensions: z
    .array(
      z.strictObject({
        claim: claimUriSchema,
        reason: z.string().min(1),
        until: z.string().min(1)
      })
    )
    .optional(),
  extensions: extensionsSchema.optional()
});

export type Change = z.infer<typeof ChangeSchema>;
