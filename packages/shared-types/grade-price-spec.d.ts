export type CargoSpec = 'FRAGMENT' | 'RUN_OF_MINE';
export type SpecPricingMode = 'UNIFIED' | 'BY_SPEC';
export interface GradeSpecRule { selectedSpec?: CargoSpec | ''; applicableSpecs?: CargoSpec[]; specPricingMode?: SpecPricingMode }
export const CARGO_SPECS: CargoSpec[];
export const SPEC_LABELS: Record<CargoSpec, string>;
export function applicableGradeSpecs(rule: GradeSpecRule | null | undefined): CargoSpec[];
export function resolveGradeSpec(rule: GradeSpecRule | null | undefined, actualSpec?: CargoSpec | null): { spec: CargoSpec; error?: undefined } | { error: string; spec?: undefined };
