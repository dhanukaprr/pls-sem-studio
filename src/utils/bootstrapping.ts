import { Dataset, Construct, StructuralPath, PLSResults, BootstrappingOptions, PLSAlgorithmOptions } from '../types';
import { runPlsSem } from './plsAlgorithm';
import { getMean, getStdDev } from './math';

// Standard Normal Cumulative Distribution Function approximation
// Used to compute high-accuracy p-values from t-statistics
export function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804; // 1 / sqrt(2*pi)
  const q = d * Math.exp(-0.5 * x * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const val = 1 - q * (a1*t + a2*t*t + a3*t*t*t + a4*t*t*t*t + a5*t*t*t*t*t);
  return x >= 0 ? val : 1 - val;
}

// Compute P-value for two-tailed test from a T-statistic
export function getTwoTailedPValue(t: number): number {
  if (isNaN(t) || !isFinite(t)) return 1.0;
  // Two-tailed p-value
  const p = 2 * (1 - normalCDF(Math.abs(t)));
  return Math.max(0, Math.min(1.0, p));
}

// Compute P-value for one-tailed test from a T-statistic
export function getOneTailedPValue(t: number): number {
  if (isNaN(t) || !isFinite(t)) return 1.0;
  // One-tailed p-value
  const p = 1 - normalCDF(Math.abs(t));
  return Math.max(0, Math.min(1.0, p));
}

// Draw bootstrap sample with replacement
function drawBootstrapSample(dataset: Dataset): Dataset {
  const N = dataset.rows.length;
  const newRows: Record<string, number>[] = Array(N);
  
  for (let i = 0; i < N; i++) {
    const randomIdx = Math.floor(Math.random() * N);
    newRows[i] = dataset.rows[randomIdx];
  }
  
  return {
    name: `Bootstrap Sample (${dataset.name})`,
    columns: dataset.columns,
    rows: newRows
  };
}

export interface BootstrapProgress {
  currentSample: number;
  totalSamples: number;
  percent: number;
}

// Runs the bootstrapping process in asynchronous chunks to avoid blocking the browser UI thread
export async function runBootstrapping(
  dataset: Dataset,
  constructs: Construct[],
  paths: StructuralPath[],
  algoOptions?: PLSAlgorithmOptions,
  bootOptions?: BootstrappingOptions,
  onProgress?: (progress: BootstrapProgress) => void
): Promise<PLSResults> {
  const bootOpt: BootstrappingOptions = bootOptions || {
    samplesCount: 200,
    significanceLevel: 0.05,
    testType: 'two-tailed'
  };

  const algoOpt: PLSAlgorithmOptions = algoOptions || {
    weightingScheme: 'path',
    maxIterations: 300,
    tolerance: 1e-7
  };

  const samplesCount = bootOpt.samplesCount;

  // 1. Calculate original results
  const originalResults = runPlsSem(dataset, constructs, paths, algoOpt);
  
  const N_paths = originalResults.pathCoefficients.length;
  const N_inds = originalResults.indicatorResults.length;
  
  if (N_paths === 0 && N_inds === 0) {
    return originalResults;
  }

  // Structures to hold all bootstrap estimates
  // key format: "fromId->toId"
  const pathEstimates: Record<string, number[]> = {};
  originalResults.pathCoefficients.forEach(p => {
    pathEstimates[`${p.from}->${p.to}`] = [];
  });

  // key format: "constructId->indicator->loading" or "constructId->indicator->weight"
  const loadingEstimates: Record<string, number[]> = {};
  const weightEstimates: Record<string, number[]> = {};
  originalResults.indicatorResults.forEach(ind => {
    loadingEstimates[`${ind.constructId}->${ind.indicator}`] = [];
    weightEstimates[`${ind.constructId}->${ind.indicator}`] = [];
  });

  // Run in chunks of e.g. 10 iterations to keep the UI fluid and allow rendering
  const chunkSize = 15;
  let currentSample = 0;

  const runChunk = (): Promise<void> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const end = Math.min(samplesCount, currentSample + chunkSize);
        for (let b = currentSample; b < end; b++) {
          const bootDataset = drawBootstrapSample(dataset);
          const bootRes = runPlsSem(bootDataset, constructs, paths, algoOpt);

          // Collect path coefficients
          bootRes.pathCoefficients.forEach(p => {
            const key = `${p.from}->${p.to}`;
            if (pathEstimates[key] !== undefined) {
              pathEstimates[key].push(p.coefficient);
            }
          });

          // Collect indicators (loadings and weights)
          bootRes.indicatorResults.forEach(ind => {
            const lKey = `${ind.constructId}->${ind.indicator}`;
            if (loadingEstimates[lKey] !== undefined) {
              loadingEstimates[lKey].push(ind.loading);
            }
            if (weightEstimates[lKey] !== undefined) {
              weightEstimates[lKey].push(ind.weight);
            }
          });
        }
        
        currentSample = end;
        if (onProgress) {
          onProgress({
            currentSample,
            totalSamples: samplesCount,
            percent: Math.round((currentSample / samplesCount) * 100)
          });
        }
        resolve();
      }, 0);
    });
  };

  while (currentSample < samplesCount) {
    await runChunk();
  }

  // Helper to calculate statistics (SE, T-stat, P-value, Percentile Confidence Intervals)
  const computeStats = (
    originalVal: number,
    estimates: number[]
  ) => {
    if (!estimates || estimates.length === 0) {
      return { tValue: 0, pValue: 1, standardError: 0, ciLower: originalVal, ciUpper: originalVal };
    }
    
    const validEstimates = estimates.filter(v => !isNaN(v) && isFinite(v));
    if (validEstimates.length <= 1) {
      return { tValue: 0, pValue: 1, standardError: 0, ciLower: originalVal, ciUpper: originalVal };
    }

    const mean = getMean(validEstimates);
    const standardError = getStdDev(validEstimates, mean);
    
    // Calculate T-statistic
    const tValue = standardError === 0 ? 0 : Math.abs(originalVal / standardError);
    const pValue = bootOpt.testType === 'one-tailed' ? getOneTailedPValue(tValue) : getTwoTailedPValue(tValue);

    // Calculate Percentile Confidence Intervals
    const sorted = [...validEstimates].sort((a, b) => a - b);
    const alpha = bootOpt.significanceLevel;
    const lowerPercent = bootOpt.testType === 'one-tailed' ? alpha : alpha / 2;
    const upperPercent = bootOpt.testType === 'one-tailed' ? (1 - alpha) : (1 - alpha / 2);

    const idxLower = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * lowerPercent)));
    const idxUpper = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * upperPercent)));
    const ciLower = sorted[idxLower] ?? originalVal;
    const ciUpper = sorted[idxUpper] ?? originalVal;

    return {
      standardError,
      tValue,
      pValue,
      ciLower,
      ciUpper
    };
  };

  // 2. Enrich original path coefficients with bootstrap statistics
  const enrichedPathCoefficients = originalResults.pathCoefficients.map(p => {
    const key = `${p.from}->${p.to}`;
    const stats = computeStats(p.coefficient, pathEstimates[key]);
    return {
      ...p,
      ...stats
    };
  });

  // 3. Enrich original indicators with bootstrap statistics
  const enrichedIndicatorResults = originalResults.indicatorResults.map(ind => {
    const lKey = `${ind.constructId}->${ind.indicator}`;
    const loadingStats = computeStats(ind.loading, loadingEstimates[lKey]);
    const weightStats = computeStats(ind.weight, weightEstimates[lKey]);

    return {
      ...ind,
      tValue: loadingStats.tValue,
      pValue: loadingStats.pValue,
      standardError: loadingStats.standardError,
      ciLower: loadingStats.ciLower,
      ciUpper: loadingStats.ciUpper,
      // We can also store the weight-specific bootstrap stats if needed, or stick to standard outer loadings testing which is the default in PLS reporting
      weightTValue: weightStats.tValue,
      weightPValue: weightStats.pValue,
      weightSE: weightStats.standardError,
      weightCiLower: weightStats.ciLower,
      weightCiUpper: weightStats.ciUpper
    };
  });

  return {
    ...originalResults,
    pathCoefficients: enrichedPathCoefficients,
    indicatorResults: enrichedIndicatorResults,
    bootstrappingRun: true,
    bootstrapSamplesCount: samplesCount,
    algorithmOptions: algoOpt,
    bootstrappingOptions: bootOpt
  };
}
