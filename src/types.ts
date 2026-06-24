export type ConstructType = 'reflective' | 'formative';
export type IndicatorAlignment = 'left' | 'right' | 'top' | 'bottom';

export interface Construct {
  id: string;
  name: string;
  type: ConstructType;
  x: number;
  y: number;
  indicators: string[];
  indicatorAlignment: IndicatorAlignment;
}

export interface StructuralPath {
  id: string;
  from: string; // Construct ID
  to: string;   // Construct ID
}

export interface Dataset {
  name: string;
  columns: string[];
  rows: Record<string, number>[];
}

export interface NormalityResult {
  column: string;
  mean: number;
  stdDev: number;
  skewness: number;
  kurtosis: number; // excess kurtosis
  jbStat: number;
  pValue: number;
  isNormal: boolean;
}

// Results of PLS-SEM Algorithm
export interface PathCoefficientResult {
  from: string;
  to: string;
  coefficient: number;
  tValue?: number;
  pValue?: number;
  standardError?: number;
  ciLower?: number;
  ciUpper?: number;
}

export interface IndicatorResult {
  constructId: string;
  indicator: string;
  loading: number; // Correlation with latent score (reflective indicator)
  weight: number;  // Converged outer weight (formative indicator or Mode B weight)
  tValue?: number;
  pValue?: number;
  standardError?: number;
  ciLower?: number;
  ciUpper?: number;
}

export interface ConstructValidity {
  id: string;
  name: string;
  cronbachAlpha: number | null; // Null if formative or < 2 indicators
  compositeReliability: number | null; // rho_C
  rhoA: number | null; // rho_A Dijkstra-Henseler
  ave: number | null; // Average Variance Extracted
}

export interface DiscriminantValidityRow {
  constructId: string;
  constructName: string;
  // Map of otherConstructId -> correlation or HTMT ratio
  values: Record<string, number>;
  sqrtAve: number | null;
}

export interface CollinearityVif {
  type: 'inner' | 'outer';
  targetId: string; // Endogenous construct id (inner) or Construct id (outer)
  targetName: string;
  predictor: string; // Predictor construct name (inner) or Indicator name (outer)
  vif: number;
}

export interface PLSResults {
  pathCoefficients: PathCoefficientResult[];
  indicatorResults: IndicatorResult[];
  constructValidity: ConstructValidity[];
  rSquare: Record<string, number>; // constructId -> R-squared
  rSquareAdj: Record<string, number>; // constructId -> Adjusted R-squared
  normality: NormalityResult[]; // Column-level normality test results
  fSquare: Record<string, Record<string, number>>; // targetConstructId -> sourceConstructId -> f-squared
  correlations: Record<string, Record<string, number>>; // constructId -> constructId -> correlation
  htmt: Record<string, Record<string, number>>; // constructId -> constructId -> HTMT ratio
  vif: CollinearityVif[];
  iterationsRun: number;
  converged: boolean;
  srmr: number;
  // Bootstrapping options if run
  bootstrappingRun?: boolean;
  bootstrapSamplesCount?: number;
}
