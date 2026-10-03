export { TRENCH_SIZES, trenchKey, findTrenchConflict } from './trench'
export type { Trench, TrenchSize } from './trench'
export { UNIT_TYPES, INCLUSIONS, stratumThickness, isDepthInverted, isCodeDuplicated } from './stratum'
export type { Stratum, UnitType, Inclusion } from './stratum'
export { ARTIFACT_CATEGORIES, COMPLETENESS } from './artifact'
export type { Artifact, ArtifactCategory, Completeness } from './artifact'
export { RELATION_TYPES, RELATION_BASES } from './relation'
export type { Relation, RelationType, RelationBasis } from './relation'
export {
  OWNERS,
  OWNER_LABELS,
  UNIT_LIFECYCLES,
  LIFECYCLE_LABELS,
  ARTIFACT_STATUSES,
  ARTIFACT_STATUS_LABELS,
  PENDING_REASONS,
  PENDING_REASON_LABELS
} from './ownership'
export type { Owner, UnitLifecycle, ArtifactStatus, PendingReason } from './ownership'
export { MISMATCH_KINDS, MISMATCH_KIND_LABELS } from './reconcile'
export type { ReconcileRun, FieldUnitSnapshot, Mismatch, MismatchKind } from './reconcile'
