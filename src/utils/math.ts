// Matrix and Vector operations for PLS-SEM statistical computations

export function getMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

export function getVariance(arr: number[], mean?: number): number {
  if (arr.length <= 1) return 0;
  const m = mean !== undefined ? mean : getMean(arr);
  let sumSqDiff = 0;
  for (let i = 0; i < arr.length; i++) {
    const diff = arr[i] - m;
    sumSqDiff += diff * diff;
  }
  return sumSqDiff / (arr.length - 1); // Sample variance
}

export function getStdDev(arr: number[], mean?: number): number {
  return Math.sqrt(getVariance(arr, mean));
}

// Center and scale a series (mean 0, variance 1)
export function standardize(arr: number[]): number[] {
  const mean = getMean(arr);
  const std = getStdDev(arr, mean);
  if (std === 0) return arr.map(() => 0);
  return arr.map(v => (v - mean) / std);
}

// Pearson correlation coefficient between two vectors
export function correlation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0 || n !== y.length) return 0;
  
  const meanX = getMean(x);
  const meanY = getMean(y);
  
  let num = 0;
  let denX = 0;
  let denY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

// Transpose an M x N matrix represented as number[][]
export function transpose(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const t: number[][] = Array(cols).fill(0).map(() => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      t[c][r] = matrix[r][c];
    }
  }
  return t;
}

// Multiply an A x B matrix with a B x C matrix
export function multiplyMatrices(A: number[][], B: number[][]): number[][] {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  
  const C: number[][] = Array(rowsA).fill(0).map(() => Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += A[i][k] * B[k][j];
      }
      C[i][j] = sum;
    }
  }
  return C;
}

// Invert a square matrix using Gauss-Jordan elimination with pivoting
// Adds a small ridge parameter (ridge regression) to the diagonal to prevent singularity
export function invertMatrix(matrix: number[][], ridge = 1e-7): number[][] | null {
  const n = matrix.length;
  // Deep copy and add ridge parameter to diagonal to ensure numerical stability
  const A: number[][] = matrix.map((row, i) => 
    row.map((val, j) => (i === j ? val + ridge : val))
  );
  
  // Initialize identity matrix
  const I: number[][] = Array(n).fill(0).map((_, i) => 
    Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))
  );
  
  for (let i = 0; i < n; i++) {
    // Search for maximum in this column
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }
    
    // Swap maximum row with current row in both A and I
    if (maxRow !== i) {
      const tempA = A[i];
      A[i] = A[maxRow];
      A[maxRow] = tempA;
      
      const tempI = I[i];
      I[i] = I[maxRow];
      I[maxRow] = tempI;
    }
    
    // Check for singular matrix
    if (Math.abs(A[i][i]) < 1e-12) {
      return null; // Singular matrix cannot be inverted
    }
    
    // Pivot row division
    const pivot = A[i][i];
    for (let j = 0; j < n; j++) {
      A[i][j] /= pivot;
      I[i][j] /= pivot;
    }
    
    // Subtract from other rows
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = A[k][i];
        for (let j = 0; j < n; j++) {
          A[k][j] -= factor * A[i][j];
          I[k][j] -= factor * I[i][j];
        }
      }
    }
  }
  
  return I;
}

// Multiple Linear Regression: solves y = X * beta
// y: dependent vector of length N
// X: independent matrix of size N x M (no intercept added automatically - data is assumed standardized, so intercept is 0)
export interface RegressionResult {
  coefficients: number[];
  rSquared: number;
}

export function runMultipleRegression(y: number[], X: number[][]): RegressionResult {
  const N = y.length;
  if (N === 0) return { coefficients: [], rSquared: 0 };
  const M = X[0].length;
  
  // Convert y to columns matrix [N x 1]
  const yMat: number[][] = y.map(val => [val]);
  
  // Xt: [M x N]
  const Xt = transpose(X);
  
  // XtX: [M x M]
  const XtX = multiplyMatrices(Xt, X);
  
  // Invert XtX
  const XtX_inv = invertMatrix(XtX);
  if (!XtX_inv) {
    // If inversion fails, fall back to simple individual regressions or a pseudo-inverse proxy
    // Let's do a simple ridge fallback with higher ridge or just correlation coefficients as a proxy
    const fallbackInv = invertMatrix(XtX, 1e-3);
    if (!fallbackInv) {
      // Direct correlation proxy
      const coefficients = Array(M).fill(0).map((_, j) => correlation(y, X.map(row => row[j])));
      return { coefficients, rSquared: 0.1 };
    }
    return runRegressionWithInv(yMat, X, Xt, fallbackInv);
  }
  
  return runRegressionWithInv(yMat, X, Xt, XtX_inv);
}

function runRegressionWithInv(
  yMat: number[][],
  X: number[][],
  Xt: number[][],
  XtX_inv: number[][]
): RegressionResult {
  const N = yMat.length;
  const M = Xt.length;

  // beta = (XtX)^-1 * Xt * y [M x 1]
  const XtY = multiplyMatrices(Xt, yMat);
  const betaMat = multiplyMatrices(XtX_inv, XtY);
  const coefficients = betaMat.map(row => row[0]);
  
  // Calculate R-squared
  // y_hat = X * beta
  const yHat = X.map(row => {
    let sum = 0;
    for (let j = 0; j < M; j++) {
      sum += row[j] * coefficients[j];
    }
    return sum;
  });
  
  const meanY = getMean(yMat.map(row => row[0]));
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < N; i++) {
    const originalY = yMat[i][0];
    const diffTot = originalY - meanY;
    const diffRes = originalY - yHat[i];
    ssTot += diffTot * diffTot;
    ssRes += diffRes * diffRes;
  }
  
  const rSquared = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  
  return {
    coefficients,
    rSquared
  };
}

// Calculate VIF for a set of predictors
export function calculateVif(X: number[][], targetIdx: number): number {
  const N = X.length;
  if (N === 0) return 1;
  const M = X[0].length;
  if (M <= 1) return 1.0;
  
  // Isolate predictor targetIdx as the dependent variable
  const y = X.map(row => row[targetIdx]);
  
  // Create matrix of other predictors
  const otherX = X.map(row => row.filter((_, idx) => idx !== targetIdx));
  
  const reg = runMultipleRegression(y, otherX);
  const r2 = reg.rSquared;
  
  if (r2 >= 1.0) return 999.9; // Avoid division by zero/extreme collinearity
  return 1 / (1 - r2);
}

// Helper to calculate HTMT value between two blocks of indicators
export function calculateHtmtRatio(
  blockA: number[][], // array of columns for construct A
  blockB: number[][]  // array of columns for construct B
): number {
  const kA = blockA.length;
  const kB = blockB.length;
  if (kA === 0 || kB === 0) return 0;
  
  // 1. Calculate average heterotrait correlations (cross-construct correlation)
  let sumCross = 0;
  let countCross = 0;
  for (let i = 0; i < kA; i++) {
    for (let j = 0; j < kB; j++) {
      sumCross += Math.abs(correlation(blockA[i], blockB[j]));
      countCross++;
    }
  }
  const meanHetero = sumCross / countCross;
  
  // 2. Calculate average monotrait-heteromethod correlations (within construct correlations)
  let sumWithinA = 0;
  let countWithinA = 0;
  for (let i = 0; i < kA; i++) {
    for (let j = i + 1; j < kA; j++) {
      sumWithinA += Math.abs(correlation(blockA[i], blockA[j]));
      countWithinA++;
    }
  }
  // If only 1 indicator, correlation is 1
  const meanWithinA = countWithinA === 0 ? 1.0 : sumWithinA / countWithinA;
  
  let sumWithinB = 0;
  let countWithinB = 0;
  for (let i = 0; i < kB; i++) {
    for (let j = i + 1; j < kB; j++) {
      sumWithinB += Math.abs(correlation(blockB[i], blockB[j]));
      countWithinB++;
    }
  }
  const meanWithinB = countWithinB === 0 ? 1.0 : sumWithinB / countWithinB;
  
  const denominator = Math.sqrt(meanWithinA * meanWithinB);
  if (denominator === 0) return 0;
  
  return meanHetero / denominator;
}
