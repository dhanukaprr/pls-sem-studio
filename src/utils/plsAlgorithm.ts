import { Dataset, Construct, StructuralPath, PLSResults, PathCoefficientResult, IndicatorResult, ConstructValidity, DiscriminantValidityRow, CollinearityVif } from '../types';
import { getMean, getStdDev, standardize, correlation, runMultipleRegression, calculateVif, calculateHtmtRatio, transpose, multiplyMatrices } from './math';

export function runPlsSem(
  dataset: Dataset,
  constructs: Construct[],
  paths: StructuralPath[]
): PLSResults {
  const N = dataset.rows.length;
  const numConstructs = constructs.length;

  if (N === 0 || numConstructs === 0) {
    return {
      pathCoefficients: [],
      indicatorResults: [],
      constructValidity: [],
      rSquare: {},
      fSquare: {},
      correlations: {},
      htmt: {},
      vif: [],
      iterationsRun: 0,
      converged: false,
      srmr: 0
    };
  }

  // 1. Extract and standardize all indicators used in any construct
  const usedIndicators = Array.from(
    new Set(constructs.flatMap(c => c.indicators))
  ).filter(ind => dataset.columns.includes(ind));

  const standardizedData: Record<string, number[]> = {};
  for (const ind of usedIndicators) {
    const rawValues = dataset.rows.map(r => r[ind] ?? 0);
    standardizedData[ind] = standardize(rawValues);
  }

  // Filter constructs to only those with valid indicators
  const activeConstructs = constructs.filter(
    c => c.indicators.length > 0 && c.indicators.every(ind => standardizedData[ind] !== undefined)
  );

  const activeConstructsMap = new Map(activeConstructs.map(c => [c.id, c]));

  // Build structural connections
  const predecessors: Record<string, string[]> = {};
  const successors: Record<string, string[]> = {};
  const adjacent: Record<string, string[]> = {};

  for (const c of activeConstructs) {
    predecessors[c.id] = [];
    successors[c.id] = [];
    adjacent[c.id] = [];
  }

  for (const path of paths) {
    if (activeConstructsMap.has(path.from) && activeConstructsMap.has(path.to)) {
      predecessors[path.to].push(path.from);
      successors[path.from].push(path.to);
      adjacent[path.from].push(path.to);
      adjacent[path.to].push(path.from);
    }
  }

  // 2. Initialize latent scores (Y_c) as average of indicators, then standardized
  let Y: Record<string, number[]> = {};
  for (const c of activeConstructs) {
    const sumVec = Array(N).fill(0);
    for (const ind of c.indicators) {
      const vec = standardizedData[ind];
      for (let i = 0; i < N; i++) {
        sumVec[i] += vec[i];
      }
    }
    const avgVec = sumVec.map(v => v / c.indicators.length);
    Y[c.id] = standardize(avgVec);
  }

  // 3. Iterative PLS Algorithm
  let converged = false;
  let iterationsRun = 0;
  const maxIterations = 300;
  const tolerance = 1e-7;

  // Track outer weights: constructId -> indicator -> weight
  let weights: Record<string, Record<string, number>> = {};
  for (const c of activeConstructs) {
    weights[c.id] = {};
    for (const ind of c.indicators) {
      weights[c.id][ind] = 1 / Math.sqrt(c.indicators.length); // Equal initialization
    }
  }

  while (iterationsRun < maxIterations && !converged) {
    iterationsRun++;
    
    // Save previous weights for convergence check
    const prevWeights = JSON.parse(JSON.stringify(weights));

    // A. Inner Estimation: Compute inner scores (Y_tilde)
    const Y_tilde: Record<string, number[]> = {};
    for (const c of activeConstructs) {
      const adjIds = adjacent[c.id];
      if (adjIds.length === 0) {
        // No structural connections: use previous scores
        Y_tilde[c.id] = [...Y[c.id]];
        continue;
      }

      const innerScoreVec = Array(N).fill(0);
      for (const adjId of adjIds) {
        // Factor scheme: weight is correlation
        const r = correlation(Y[c.id], Y[adjId]);
        const adjScore = Y[adjId];
        for (let i = 0; i < N; i++) {
          innerScoreVec[i] += r * adjScore[i];
        }
      }
      Y_tilde[c.id] = standardize(innerScoreVec);
    }

    // B. Outer Estimation: Compute new outer weights
    for (const c of activeConstructs) {
      const innerScore = Y_tilde[c.id];
      
      if (c.type === 'reflective' || c.indicators.length === 1) {
        // Mode A: weights are covariance/correlation of indicators with inner score
        for (const ind of c.indicators) {
          weights[c.id][ind] = correlation(standardizedData[ind], innerScore);
        }
      } else {
        // Mode B (Formative): multiple regression of Y_tilde on indicators
        const X_mat = standardizedData[c.indicators[0]].map((_, rowIdx) => 
          c.indicators.map(ind => standardizedData[ind][rowIdx])
        );
        const regression = runMultipleRegression(innerScore, X_mat);
        c.indicators.forEach((ind, idx) => {
          weights[c.id][ind] = regression.coefficients[idx] ?? 0;
        });
      }
    }

    // C. Update Latent Scores: Y = X * w
    for (const c of activeConstructs) {
      const outerScoreVec = Array(N).fill(0);
      for (const ind of c.indicators) {
        const w = weights[c.id][ind];
        const vec = standardizedData[ind];
        for (let i = 0; i < N; i++) {
          outerScoreVec[i] += w * vec[i];
        }
      }
      Y[c.id] = standardize(outerScoreVec);
    }

    // D. Check Convergence (on outer weights)
    let maxDiff = 0;
    for (const c of activeConstructs) {
      for (const ind of c.indicators) {
        const diff = Math.abs(weights[c.id][ind] - prevWeights[c.id][ind]);
        if (diff > maxDiff) maxDiff = diff;
      }
    }

    if (maxDiff < tolerance) {
      converged = true;
    }
  }

  // 4. Calculate Final Results

  // Outer Loadings and Final Outer Weights
  const indicatorResults: IndicatorResult[] = [];
  for (const c of activeConstructs) {
    for (const ind of c.indicators) {
      const loading = correlation(standardizedData[ind], Y[c.id]);
      const weight = weights[c.id][ind];
      indicatorResults.push({
        constructId: c.id,
        indicator: ind,
        loading,
        weight
      });
    }
  }

  // Path Coefficients and R-Squared
  const pathCoefficients: PathCoefficientResult[] = [];
  const rSquare: Record<string, number> = {};

  for (const c of activeConstructs) {
    const predIds = predecessors[c.id];
    if (predIds.length === 0) {
      continue; // Exogenous construct: no R-squared
    }

    // Independent variables: latent scores of predecessors
    const X_mat = Y[predIds[0]].map((_, rowIdx) => 
      predIds.map(pId => Y[pId][rowIdx])
    );
    
    // Dependent variable: latent score of this construct
    const targetY = Y[c.id];
    const regression = runMultipleRegression(targetY, X_mat);
    
    rSquare[c.id] = regression.rSquared;

    predIds.forEach((pId, idx) => {
      pathCoefficients.push({
        from: pId,
        to: c.id,
        coefficient: regression.coefficients[idx] ?? 0
      });
    });
  }

  // F-squared Effect Sizes
  // f2 = (R2_incl - R2_excl) / (1 - R2_incl)
  const fSquare: Record<string, Record<string, number>> = {};
  for (const c of activeConstructs) {
    const predIds = predecessors[c.id];
    if (predIds.length === 0) continue;

    fSquare[c.id] = {};
    const r2Incl = rSquare[c.id] ?? 0;

    for (const pId of predIds) {
      // Regress Y[c.id] on predIds EXCLUDING pId
      const otherPredIds = predIds.filter(id => id !== pId);
      if (otherPredIds.length === 0) {
        // Excluding the only predictor leaves R2 = 0
        const f2 = r2Incl / (1 - r2Incl);
        fSquare[c.id][pId] = isNaN(f2) ? 0 : f2;
      } else {
        const X_mat = Y[otherPredIds[0]].map((_, rowIdx) => 
          otherPredIds.map(id => Y[id][rowIdx])
        );
        const regExcl = runMultipleRegression(Y[c.id], X_mat);
        const r2Excl = regExcl.rSquared;
        const f2 = (r2Incl - r2Excl) / (1 - r2Incl);
        fSquare[c.id][pId] = isNaN(f2) ? 0 : Math.max(0, f2);
      }
    }
  }

  // Latent Construct Correlations
  const correlations: Record<string, Record<string, number>> = {};
  for (const c1 of activeConstructs) {
    correlations[c1.id] = {};
    for (const c2 of activeConstructs) {
      correlations[c1.id][c2.id] = correlation(Y[c1.id], Y[c2.id]);
    }
  }

  // Construct Reliability & Validity (Cronbach Alpha, CR, rho_A, AVE)
  const constructValidity: ConstructValidity[] = [];
  for (const c of activeConstructs) {
    const K_ind = c.indicators.length;
    if (K_ind === 0) continue;

    let cronbachAlpha: number | null = null;
    let compositeReliability: number | null = null;
    let rhoA: number | null = null;
    let ave: number | null = null;

    // Loadings for indicators in this construct
    const loadings = c.indicators.map(ind => 
      indicatorResults.find(r => r.constructId === c.id && r.indicator === ind)?.loading ?? 0
    );

    if (c.type === 'reflective') {
      // AVE
      const sumSqLoadings = loadings.reduce((sum, l) => sum + l * l, 0);
      ave = sumSqLoadings / K_ind;

      // Composite Reliability (rho_C)
      const sumLoadings = loadings.reduce((sum, l) => sum + l, 0);
      const sumUniqueness = loadings.reduce((sum, l) => sum + (1 - l * l), 0);
      compositeReliability = (sumLoadings * sumLoadings) / ((sumLoadings * sumLoadings) + sumUniqueness);

      // Cronbach's Alpha (standardized)
      if (K_ind > 1) {
        let sumCorr = 0;
        let countCorr = 0;
        for (let i = 0; i < K_ind; i++) {
          for (let j = i + 1; j < K_ind; j++) {
            sumCorr += correlation(standardizedData[c.indicators[i]], standardizedData[c.indicators[j]]);
            countCorr++;
          }
        }
        const meanCorr = sumCorr / countCorr;
        cronbachAlpha = (K_ind * meanCorr) / (1 + (K_ind - 1) * meanCorr);
      } else {
        cronbachAlpha = 1.0;
      }

      // Dijkstra-Henseler rho_A
      if (K_ind > 1) {
        // w is weights vector
        const w = c.indicators.map(ind => weights[c.id][ind]);
        // Compute w^T * w
        const wT_w = w.reduce((sum, val) => sum + val * val, 0);
        
        // Build indicator correlation matrix R
        const R: number[][] = Array(K_ind).fill(0).map(() => Array(K_ind).fill(0));
        for (let i = 0; i < K_ind; i++) {
          for (let j = 0; j < K_ind; j++) {
            R[i][j] = correlation(standardizedData[c.indicators[i]], standardizedData[c.indicators[j]]);
          }
        }
        
        // Compute w^T * R * w
        let wT_R_w = 0;
        for (let i = 0; i < K_ind; i++) {
          for (let j = 0; j < K_ind; j++) {
            wT_R_w += w[i] * R[i][j] * w[j];
          }
        }
        
        const num = (wT_w * wT_w) * (wT_R_w - wT_w);
        const den = (wT_w * wT_R_w) - wT_w;
        const computedRhoA = num / den;
        rhoA = isNaN(computedRhoA) || !isFinite(computedRhoA) ? cronbachAlpha : Math.max(0, Math.min(1.0, computedRhoA));
      } else {
        rhoA = 1.0;
      }
    } else {
      // Formative constructs don't use standard reflective reliability metrics
      cronbachAlpha = null;
      compositeReliability = null;
      rhoA = null;
      ave = null;
    }

    constructValidity.push({
      id: c.id,
      name: c.name,
      cronbachAlpha,
      compositeReliability,
      rhoA,
      ave
    });
  }

  // HTMT Ratio Matrix
  const htmt: Record<string, Record<string, number>> = {};
  for (const c1 of activeConstructs) {
    htmt[c1.id] = {};
    for (const c2 of activeConstructs) {
      if (c1.id === c2.id) {
        htmt[c1.id][c2.id] = 1.0;
      } else {
        const blockA = c1.indicators.map(ind => standardizedData[ind]);
        const blockB = c2.indicators.map(ind => standardizedData[ind]);
        htmt[c1.id][c2.id] = calculateHtmtRatio(blockA, blockB);
      }
    }
  }

  // Collinearity diagnostics (VIF)
  const vif: CollinearityVif[] = [];
  
  // Inner VIF (collinearity of structural predictors)
  for (const c of activeConstructs) {
    const predIds = predecessors[c.id];
    if (predIds.length > 1) {
      // Get matrix of predecessor score vectors
      const predMatrix = Y[predIds[0]].map((_, rowIdx) => 
        predIds.map(id => Y[id][rowIdx])
      );
      predIds.forEach((pId, idx) => {
        vif.push({
          type: 'inner',
          targetId: c.id,
          targetName: c.name,
          predictor: activeConstructsMap.get(pId)?.name ?? pId,
          vif: calculateVif(predMatrix, idx)
        });
      });
    }
  }

  // Outer VIF (collinearity of formative indicators)
  for (const c of activeConstructs) {
    if (c.type === 'formative' && c.indicators.length > 1) {
      // Matrix of indicator standardized data
      const indMatrix = standardizedData[c.indicators[0]].map((_, rowIdx) => 
        c.indicators.map(ind => standardizedData[ind][rowIdx])
      );
      c.indicators.forEach((ind, idx) => {
        vif.push({
          type: 'outer',
          targetId: c.id,
          targetName: c.name,
          predictor: ind,
          vif: calculateVif(indMatrix, idx)
        });
      });
    }
  }

  // Standardized Root Mean Square Residual (SRMR)
  let srmr = 0;
  let srmrCount = 0;
  let sumSqDiff = 0;

  // Empirical correlation matrix of all model indicators
  const totalIndicators = activeConstructs.flatMap(c => c.indicators);
  const K_total = totalIndicators.length;
  
  if (K_total > 1) {
    for (let i = 0; i < K_total; i++) {
      for (let j = i + 1; j < K_total; j++) {
        const indI = totalIndicators[i];
        const indJ = totalIndicators[j];
        
        // Find respective constructs
        const cI = activeConstructs.find(c => c.indicators.includes(indI))!;
        const cJ = activeConstructs.find(c => c.indicators.includes(indJ))!;
        
        // Empirical correlation
        const s_ij = correlation(standardizedData[indI], standardizedData[indJ]);
        
        // Model-implied correlation: loading_i * corr(LV_I, LV_J) * loading_j
        const loadingI = indicatorResults.find(r => r.constructId === cI.id && r.indicator === indI)?.loading ?? 0;
        const loadingJ = indicatorResults.find(r => r.constructId === cJ.id && r.indicator === indJ)?.loading ?? 0;
        const corrLV = correlations[cI.id][cJ.id] ?? 0;
        const sigma_ij = loadingI * corrLV * loadingJ;
        
        const diff = s_ij - sigma_ij;
        sumSqDiff += diff * diff;
        srmrCount++;
      }
    }
    srmr = srmrCount > 0 ? Math.sqrt(sumSqDiff / srmrCount) : 0;
  }

  return {
    pathCoefficients,
    indicatorResults,
    constructValidity,
    rSquare,
    fSquare,
    correlations,
    htmt,
    vif,
    iterationsRun,
    converged,
    srmr
  };
}
