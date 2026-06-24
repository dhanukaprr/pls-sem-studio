import React, { useState } from 'react';
import { PLSResults, Construct, Dataset } from '../types';
import { ArrowRight, CheckCircle, AlertTriangle, XCircle, BarChart3, ShieldCheck, Layers, Award, Info, RefreshCw, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ResultsDashboardProps {
  results: PLSResults;
  constructs: Construct[];
  dataset: Dataset;
  onRunBootstrapping: () => void;
  bootstrappingProgress: number | null;
}

export default function ResultsDashboard({
  results,
  constructs,
  dataset,
  onRunBootstrapping,
  bootstrappingProgress
}: ResultsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'paths' | 'loadings' | 'effects' | 'reliability' | 'discriminant' | 'vif' | 'fit' | 'normality'>('paths');
  const [discTab, setDiscTab] = useState<'fornell' | 'htmt'>('fornell');

  const constructsMap = new Map(constructs.map(c => [c.id, c]));

  // 1. Recursive calculation of direct, indirect, and total effects
  const computeAllEffects = () => {
    const nodeIds = constructs.map(c => c.id);
    const pathsData = results.pathCoefficients.map(p => ({
      from: p.from,
      to: p.to,
      coeff: p.coefficient
    }));

    // Build adjacency list
    const adj: Record<string, { to: string; coeff: number }[]> = {};
    nodeIds.forEach(id => {
      adj[id] = [];
    });
    pathsData.forEach(p => {
      if (adj[p.from]) adj[p.from].push({ to: p.to, coeff: p.coeff });
    });

    const totalEffects: Record<string, Record<string, number>> = {};
    const indirectEffects: Record<string, Record<string, number>> = {};

    nodeIds.forEach(src => {
      totalEffects[src] = {};
      indirectEffects[src] = {};
      nodeIds.forEach(dst => {
        totalEffects[src][dst] = 0;
        indirectEffects[src][dst] = 0;
      });
    });

    // Simple DFS path search (since structural model is typically a DAG)
    const dfs = (current: string, target: string, product: number, visited: string[]): number => {
      if (current === target) {
        return product;
      }
      let pathSum = 0;
      const neighbors = adj[current] || [];
      for (const edge of neighbors) {
        if (!visited.includes(edge.to)) {
          pathSum += dfs(edge.to, target, product * edge.coeff, [...visited, edge.to]);
        }
      }
      return pathSum;
    };

    nodeIds.forEach(src => {
      nodeIds.forEach(dst => {
        if (src !== dst) {
          const total = dfs(src, dst, 1.0, [src]);
          const direct = pathsData.find(p => p.from === src && p.to === dst)?.coeff ?? 0;
          totalEffects[src][dst] = total;
          indirectEffects[src][dst] = total - direct;
        }
      });
    });

    return { totalEffects, indirectEffects };
  };

  const { totalEffects, indirectEffects } = computeAllEffects();

  const handleExportExcel = () => {
    // 1. Sheet 1: Path Coefficients
    const pathRows = results.pathCoefficients.map(p => {
      const fromName = constructsMap.get(p.from)?.name ?? p.from;
      const toName = constructsMap.get(p.to)?.name ?? p.to;
      return {
        'Source Construct': fromName,
        'Target Construct': toName,
        'Original Estimate (Beta)': p.coefficient,
        'Standard Error (SE)': p.standardError !== undefined ? p.standardError : 'N/A',
        'T-Statistic': p.tValue !== undefined ? p.tValue : 'N/A',
        'P-Value': p.pValue !== undefined ? p.pValue : 'N/A',
        '95% CI Lower': p.ciLower !== undefined ? p.ciLower : 'N/A',
        '95% CI Upper': p.ciUpper !== undefined ? p.ciUpper : 'N/A',
        'Significance Status': p.pValue !== undefined ? (p.pValue < 0.05 ? 'Significant' : 'Not Significant') : 'N/A'
      };
    });

    // 2. Sheet 2: Total & Indirect Effects
    const effectRows: any[] = [];
    const nodeIds = constructs.map(c => c.id);
    nodeIds.forEach(src => {
      nodeIds.forEach(dst => {
        const total = totalEffects[src]?.[dst] ?? 0;
        const direct = results.pathCoefficients.find(p => p.from === src && p.to === dst)?.coefficient ?? 0;
        const indirect = indirectEffects[src]?.[dst] ?? 0;
        if (total !== 0) {
          const fromName = constructsMap.get(src)?.name ?? src;
          const toName = constructsMap.get(dst)?.name ?? dst;
          effectRows.push({
            'Source Construct': fromName,
            'Target Construct': toName,
            'Direct Effect': direct,
            'Indirect Effect': indirect,
            'Total Effect': total,
            'Mediation Type': indirect !== 0 && direct !== 0 ? 'Partially Mediated' : indirect !== 0 ? 'Fully Mediated' : 'Direct Only'
          });
        }
      });
    });

    // 3. Sheet 3: Construct Validity
    const validityRows = results.constructValidity.map(v => {
      const cNode = constructsMap.get(v.id);
      const isFormative = cNode?.type === 'formative';
      return {
        'Construct Name': v.name,
        'Model Type': isFormative ? 'Formative (Mode B)' : 'Reflective (Mode A)',
        'Cronbach\'s Alpha (Alpha)': isFormative ? 'Formative' : (v.cronbachAlpha !== null ? v.cronbachAlpha : 'N/A'),
        'Dijkstra-Henseler (rho_A)': isFormative ? 'Formative' : (v.rhoA !== null ? v.rhoA : 'N/A'),
        'Composite Reliability (rho_C)': isFormative ? 'Formative' : (v.compositeReliability !== null ? v.compositeReliability : 'N/A'),
        'Average Variance Extracted (AVE)': isFormative ? 'Formative' : (v.ave !== null ? v.ave : 'N/A'),
        'Convergent Validity Status': isFormative ? 'N/A' : (v.ave !== null && v.ave >= 0.5 ? 'OK (>= 0.5)' : 'Violated (< 0.5)')
      };
    });

    // 4. Sheet 4: Indicator Loadings & Weights
    const indicatorRows = results.indicatorResults.map(r => {
      const cNode = constructsMap.get(r.constructId);
      const isFormative = cNode?.type === 'formative';
      return {
        'Construct': cNode?.name ?? r.constructId,
        'Indicator Column': r.indicator,
        'Indicator Type': isFormative ? 'Formative (Weight)' : 'Reflective (Loading)',
        'Estimate Value': isFormative ? r.weight : r.loading,
        'Standard Error (SE)': r.standardError !== undefined ? r.standardError : 'N/A',
        'T-Statistic': r.tValue !== undefined ? r.tValue : 'N/A',
        'P-Value': r.pValue !== undefined ? r.pValue : 'N/A',
        '95% CI Lower': r.ciLower !== undefined ? r.ciLower : 'N/A',
        '95% CI Upper': r.ciUpper !== undefined ? r.ciUpper : 'N/A'
      };
    });

    // 5. Sheet 5: Discriminant Validity (HTMT)
    const htmtRows: any[] = [];
    constructs.forEach(c1 => {
      const rowVal: any = { 'Construct Name': c1.name };
      constructs.forEach(c2 => {
        if (c1.id === c2.id) {
          rowVal[c2.name] = '-';
        } else {
          const htmtVal = results.htmt[c1.id]?.[c2.id] || results.htmt[c2.id]?.[c1.id];
          rowVal[c2.name] = htmtVal !== undefined ? htmtVal.toFixed(3) : 'N/A';
        }
      });
      htmtRows.push(rowVal);
    });

    // 6. Sheet 6: Collinearity VIF
    const vifRows = results.vif.map(v => ({
      'Analysis Type': v.type === 'inner' ? 'Inner (Construct Level)' : 'Outer (Indicator Level)',
      'Target Latent Node / Endogenous': v.targetName,
      'Predictor Column / Construct': v.predictor,
      'Variance Inflation Factor (VIF)': v.vif,
      'Collinearity Hazard': v.vif > 5 ? 'High Critical (>5)' : v.vif > 3.3 ? 'Warning (>3.3)' : 'OK (<3.3)'
    }));

    // 7. Sheet 7: Model Fit & R-squared
    const fitRows = [
      { 'Metric Name': 'Standardized Root Mean Res. (SRMR)', 'Value': results.srmr, 'Threshold/Info': '< 0.08 is recommended' },
      { 'Metric Name': 'Converged Successfully', 'Value': results.converged ? 'Yes' : 'No', 'Threshold/Info': '-' },
      { 'Metric Name': 'Total Iterations Run', 'Value': results.iterationsRun, 'Threshold/Info': '< 300' }
    ];

    Object.entries(results.rSquare).forEach(([cId, val]) => {
      const cName = constructsMap.get(cId)?.name ?? cId;
      const adjVal = results.rSquareAdj?.[cId] ?? val;
      fitRows.push({
        'Metric Name': `R-squared (R2) - ${cName}`,
        'Value': val,
        'Threshold/Info': 'Explanatory Power: >=0.67 Substantial, >=0.33 Moderate, >=0.19 Weak'
      });
      fitRows.push({
        'Metric Name': `Adjusted R-squared (R2 adj) - ${cName}`,
        'Value': adjVal,
        'Threshold/Info': 'Adjusted for number of predictors'
      });
    });

    // 8. Sheet 8: Normality Diagnostics
    const normalityRows = (results.normality || []).map(n => ({
      'Indicator/Column Name': n.column,
      'Sample Size (N)': dataset.rows.length,
      'Mean': n.mean,
      'Standard Deviation (SD)': n.stdDev,
      'Skewness': n.skewness,
      'Excess Kurtosis': n.kurtosis,
      'Jarque-Bera Statistic': n.jbStat,
      'JB p-value': n.pValue,
      'Normal Distribution (p >= 0.05)': n.pValue >= 0.05 ? 'Yes' : 'No'
    }));

    // Create workbook using XLSX library
    const wb = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pathRows), "Path Coefficients");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(effectRows), "Effects");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(validityRows), "Construct Validity");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(indicatorRows), "Indicator Metrics");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(htmtRows), "Discriminant (HTMT)");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vifRows), "Collinearity VIF");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fitRows), "Model Fit");
    
    if (normalityRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(normalityRows), "Normality Diagnostics");
    }

    XLSX.writeFile(wb, "PLS_SEM_Analysis_Detailed_Report.xlsx");
  };

  // Helper to format p-values cleanly
  const formatPValue = (p?: number) => {
    if (p === undefined) return '-';
    if (p < 0.001) return 'p < 0.001';
    if (p < 0.01) return 'p < 0.01';
    if (p < 0.05) return 'p < 0.05';
    return `p = ${p.toFixed(3)}`;
  };

  // Helper for significance badges
  const getSigBadge = (p?: number) => {
    if (p === undefined) return null;
    if (p < 0.01) {
      return (
        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200">
          <CheckCircle className="w-3 h-3" /> Significant (99%)
        </span>
      );
    }
    if (p < 0.05) {
      return (
        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-100">
          <CheckCircle className="w-3 h-3" /> Significant (95%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 text-[10px] font-semibold px-2 py-0.5 rounded border border-rose-100">
        <XCircle className="w-3 h-3" /> Not Significant
      </span>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
      {/* Tab Navigation header */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-200 bg-gray-50/50 px-4 pt-2">
        <div className="flex gap-1 overflow-x-auto">
          <button
            id="tab-paths"
            onClick={() => setActiveTab('paths')}
            className={`px-3.5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'paths'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-850'
            }`}
          >
            Path Coefficients
          </button>
          <button
            id="tab-loadings"
            onClick={() => setActiveTab('loadings')}
            className={`px-3.5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'loadings'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-850'
            }`}
          >
            Factor Loadings / Weights
          </button>
          <button
            id="tab-effects"
            onClick={() => setActiveTab('effects')}
            className={`px-3.5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'effects'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-850'
            }`}
          >
            Total & Indirect Effects
          </button>
          <button
            id="tab-reliability"
            onClick={() => setActiveTab('reliability')}
            className={`px-3.5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'reliability'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-850'
            }`}
          >
            Construct Validity
          </button>
          <button
            id="tab-discriminant"
            onClick={() => setActiveTab('discriminant')}
            className={`px-3.5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'discriminant'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-850'
            }`}
          >
            Discriminant Validity
          </button>
          <button
            id="tab-vif"
            onClick={() => setActiveTab('vif')}
            className={`px-3.5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'vif'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-850'
            }`}
          >
            Collinearity (VIF)
          </button>
          <button
            id="tab-fit"
            onClick={() => setActiveTab('fit')}
            className={`px-3.5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'fit'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-850'
            }`}
          >
            Model Fit
          </button>
          <button
            id="tab-normality"
            onClick={() => setActiveTab('normality')}
            className={`px-3.5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'normality'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-850'
            }`}
          >
            Normality Testing
          </button>
        </div>

        <div className="py-2 shrink-0 flex items-center gap-2">
          <span className="text-[10px] bg-gray-150 text-gray-700 px-2.5 py-1 rounded font-bold font-mono border border-gray-200">
            Converged in {results.iterationsRun} iterations
          </span>
          <button
            id="export-results-xlsx-btn"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-[10px] shadow-sm transition cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export XLSX Report
          </button>
        </div>
      </div>

      {/* Main Results panels scroll box */}
      <div className="flex-1 overflow-auto p-5">
        
        {/* TABS 1: PATH COEFFICIENTS */}
        {activeTab === 'paths' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-950 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-indigo-600" /> Structural Model Path Coefficients
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Direct effects of predecessor constructs on endogenous target constructs.
                </p>
              </div>

              {!results.bootstrappingRun && (
                <button
                  id="dash-run-bootstrap"
                  onClick={onRunBootstrapping}
                  disabled={bootstrappingProgress !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${bootstrappingProgress !== null ? 'animate-spin' : ''}`} />
                  Test Significance (Run Bootstrapping)
                </button>
              )}
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[9px]">
                    <th className="py-3 px-4">Relation Path</th>
                    <th className="py-3 px-4 text-center">Original Est. (β)</th>
                    <th className="py-3 px-4 text-center">Std. Error (SE)</th>
                    <th className="py-3 px-4 text-center">T-Statistic</th>
                    <th className="py-3 px-4 text-center">P-Value</th>
                    <th className="py-3 px-4 text-center">95% CI (Percentile)</th>
                    <th className="py-3 px-4 text-center">Significance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {results.pathCoefficients.map((p, idx) => {
                    const fromName = constructsMap.get(p.from)?.name ?? p.from;
                    const toName = constructsMap.get(p.to)?.name ?? p.to;
                    const isSig = p.pValue !== undefined ? p.pValue < 0.05 : null;

                    return (
                      <tr key={idx} className="hover:bg-gray-50/40 transition">
                        <td className="py-3.5 px-4 font-medium flex items-center gap-2">
                          <span className="text-gray-900 font-semibold">{fromName}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-gray-900 font-semibold">{toName}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold font-mono text-indigo-700 bg-indigo-50/20">
                          {p.coefficient.toFixed(3)}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-gray-500">
                          {p.standardError !== undefined ? p.standardError.toFixed(3) : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-semibold text-gray-700">
                          {p.tValue !== undefined ? p.tValue.toFixed(3) : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-semibold">
                          {p.pValue !== undefined ? (
                            <span className={isSig ? 'text-emerald-600 font-bold' : 'text-gray-400 font-medium'}>
                              {formatPValue(p.pValue)}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-gray-600">
                          {p.ciLower !== undefined && p.ciUpper !== undefined ? (
                            `[${p.ciLower.toFixed(3)}, ${p.ciUpper.toFixed(3)}]`
                          ) : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {results.bootstrappingRun ? getSigBadge(p.pValue) : (
                            <span className="text-[10px] text-gray-400 italic">Run Bootstrap to test</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {results.pathCoefficients.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 italic">
                        No structural paths configured. Connect latent variables on the model canvas first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {results.bootstrappingRun && (
              <div className="bg-gray-50/50 border border-gray-200 rounded-xl p-4 flex gap-3 text-xs text-gray-600 max-w-3xl">
                <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">Interpreting Resampling Significance:</p>
                  <p className="mt-1">
                     Significance testing is based on <strong>{results.bootstrapSamplesCount} bootstrap samples</strong>. 
                     The T-statistic represents the ratio of the original path estimate to its bootstrap standard error.
                     An absolute T-value exceeding <strong>1.96</strong> corresponds to a two-tailed significance level of <strong>p &lt; 0.05</strong> (95% confidence).
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TABS: FACTOR LOADINGS / WEIGHTS */}
        {activeTab === 'loadings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-950 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" /> Outer Model Factor Loadings and Weights
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Assesses the outer measurement model. Reflective indicators should have high outer loadings, while formative indicators are assessed by outer weights.
                </p>
              </div>

              {!results.bootstrappingRun && (
                <button
                  id="dash-run-bootstrap-loadings"
                  onClick={onRunBootstrapping}
                  disabled={bootstrappingProgress !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${bootstrappingProgress !== null ? 'animate-spin' : ''}`} />
                  Test Significance (Run Bootstrapping)
                </button>
              )}
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[9px]">
                    <th className="py-3 px-4">Latent Construct</th>
                    <th className="py-3 px-4">Indicator</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-center">Estimate Value</th>
                    <th className="py-3 px-4 text-center">Std. Error (SE)</th>
                    <th className="py-3 px-4 text-center">T-Statistic</th>
                    <th className="py-3 px-4 text-center">P-Value</th>
                    <th className="py-3 px-4 text-center">95% CI (Percentile)</th>
                    <th className="py-3 px-4 text-center">Indicator Reliability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {results.indicatorResults.map((r, idx) => {
                    const cNode = constructsMap.get(r.constructId);
                    const isFormative = cNode?.type === 'formative';
                    const estValue = isFormative ? r.weight : r.loading;
                    const isSig = r.pValue !== undefined ? r.pValue < 0.05 : null;

                    // Compute indicator reliability recommendation badge
                    let statusBadge = null;
                    if (isFormative) {
                      statusBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                          Formative Weight
                        </span>
                      );
                    } else {
                      if (estValue >= 0.708) {
                        statusBadge = (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Excellent (&ge; 0.708)
                          </span>
                        );
                      } else if (estValue >= 0.40) {
                        statusBadge = (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                            Acceptable (0.4 - 0.7)
                          </span>
                        );
                      } else {
                        statusBadge = (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                            Critical Action (&lt; 0.40)
                          </span>
                        );
                      }
                    }

                    return (
                      <tr key={idx} className="hover:bg-gray-50/40 transition">
                        <td className="py-3 px-4 font-bold text-gray-900">
                          {cNode?.name ?? r.constructId}
                        </td>
                        <td className="py-3 px-4 font-semibold font-mono text-gray-800">
                          {r.indicator}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-tight border ${
                            isFormative ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}>
                            {isFormative ? 'Formative' : 'Reflective'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold font-mono text-indigo-700">
                          {estValue.toFixed(3)}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-gray-500">
                          {r.standardError !== undefined ? r.standardError.toFixed(3) : '-'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold text-gray-700">
                          {r.tValue !== undefined ? r.tValue.toFixed(3) : '-'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold">
                          {r.pValue !== undefined ? (
                            <span className={isSig ? 'text-emerald-600 font-bold' : 'text-gray-400 font-medium'}>
                              {formatPValue(r.pValue)}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-gray-600">
                          {r.ciLower !== undefined && r.ciUpper !== undefined ? (
                            `[${r.ciLower.toFixed(3)}, ${r.ciUpper.toFixed(3)}]`
                          ) : '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {statusBadge}
                        </td>
                      </tr>
                    );
                  })}
                  {results.indicatorResults.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-400 italic">
                        No indicator results available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-gray-50/50 border border-gray-200 rounded-xl p-4 space-y-3 max-w-4xl text-xs text-gray-600">
              <p className="font-bold text-gray-900 flex items-center gap-1">
                <Info className="w-4 h-4 text-indigo-500 shrink-0" /> Outer Measurement Model Guidelines:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Reflective Loadings (Factor Loadings)</strong>: Loadings should ideally be <strong>&ge; 0.708</strong>. 
                  This indicates that the construct explains more than 50% of the indicator's variance (indicator reliability). 
                  Indicators with outer loadings between 0.40 and 0.70 should be considered for removal only if deletion increases Dijkstra-Henseler's $\rho_A$ or Composite Reliability above 0.70 or AVE above 0.50. Indicators with loadings &lt; 0.40 must always be deleted.
                </li>
                <li>
                  <strong>Formative Weights</strong>: Formative indicators are evaluated on their relative contribution (outer weights) and significance (p-value). If an outer weight is not significant, but its corresponding outer loading is high (&ge; 0.50), the indicator should still be kept.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* TABS 2: TOTAL & INDIRECT EFFECTS */}
        {activeTab === 'effects' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" /> Total, Direct, and Indirect Path Effects
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Breakdown of how constructs influence other constructs through direct and indirect (mediating) pathways.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[9px]">
                    <th className="py-3 px-4">Relationship Path</th>
                    <th className="py-3 px-4 text-center">Direct Effect (β)</th>
                    <th className="py-3 px-4 text-center">Indirect Effect</th>
                    <th className="py-3 px-4 text-center">Total Effect</th>
                    <th className="py-3 px-4">Structure Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {(() => {
                    const rowsList: { from: string; to: string; direct: number; indirect: number; total: number }[] = [];
                    const ids = constructs.map(c => c.id);

                    ids.forEach(src => {
                      ids.forEach(dst => {
                        const total = totalEffects[src]?.[dst] ?? 0;
                        const direct = results.pathCoefficients.find(p => p.from === src && p.to === dst)?.coefficient ?? 0;
                        const indirect = indirectEffects[src]?.[dst] ?? 0;

                        if (total !== 0) {
                          rowsList.push({ from: src, to: dst, direct, indirect, total });
                        }
                      });
                    });

                    if (rowsList.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                            No paths or relationships found.
                          </td>
                        </tr>
                      );
                    }

                    return rowsList.map((row, idx) => {
                      const fromName = constructsMap.get(row.from)?.name ?? row.from;
                      const toName = constructsMap.get(row.to)?.name ?? row.to;

                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-semibold text-slate-800 flex items-center gap-2">
                            <span>{fromName}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                            <span>{toName}</span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-medium text-slate-600">
                            {row.direct !== 0 ? row.direct.toFixed(3) : '0.000'}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-medium text-amber-600 bg-amber-50/10">
                            {row.indirect !== 0 ? row.indirect.toFixed(3) : '-'}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-indigo-700 bg-indigo-50/20">
                            {row.total.toFixed(3)}
                          </td>
                          <td className="py-3 px-4">
                            {row.indirect !== 0 && row.direct !== 0 ? (
                              <span className="inline-flex items-center bg-purple-50 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded border border-purple-100">
                                Partially Mediated
                              </span>
                            ) : row.indirect !== 0 ? (
                              <span className="inline-flex items-center bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-100">
                                Fully Mediated
                              </span>
                            ) : (
                              <span className="inline-flex items-center bg-slate-50 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-200">
                                Direct Only
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TABS 3: CONSTRUCT RELIABILITY & VALIDITY */}
        {activeTab === 'reliability' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600" /> Latent Construct Reliability and Validity
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Assesses the internal consistency, reliability, and convergent validity of reflective constructs.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[9px]">
                    <th className="py-3 px-4">Latent Construct Name</th>
                    <th className="py-3 px-4">Model Type</th>
                    <th className="py-3 px-4 text-center">Cronbach's Alpha (&alpha;)</th>
                    <th className="py-3 px-4 text-center">Dijkstra-Henseler (&rho;<sub>A</sub>)</th>
                    <th className="py-3 px-4 text-center">Composite Reliability (&rho;<sub>C</sub>)</th>
                    <th className="py-3 px-4 text-center">Average Variance Extr. (AVE)</th>
                    <th className="py-3 px-4 text-center">Convergent Validity Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {results.constructValidity.map((v, idx) => {
                    const cNode = constructsMap.get(v.id);
                    if (!cNode) return null;

                    const isFormative = cNode.type === 'formative';
                    
                    // Evaluate thresholds
                    const alphaOk = !isFormative && v.cronbachAlpha !== null ? v.cronbachAlpha >= 0.70 : true;
                    const rhoAOk = !isFormative && v.rhoA !== null ? v.rhoA >= 0.70 : true;
                    const compOk = !isFormative && v.compositeReliability !== null ? v.compositeReliability >= 0.70 : true;
                    const aveOk = !isFormative && v.ave !== null ? v.ave >= 0.50 : true;

                    const hasViolations = !isFormative && (!alphaOk || !compOk || !aveOk);

                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="py-4 px-4 font-bold text-slate-800">{v.name}</td>
                        <td className="py-4 px-4 font-semibold">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isFormative 
                              ? 'bg-amber-50 text-amber-700 border-amber-200' 
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {isFormative ? 'Formative' : 'Reflective'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center font-mono">
                          {isFormative ? (
                            <span className="text-slate-400 italic">N/A</span>
                          ) : (
                            <span className={alphaOk ? 'text-slate-800 font-bold' : 'text-rose-600 font-bold'}>
                              {v.cronbachAlpha !== null ? v.cronbachAlpha.toFixed(3) : '-'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center font-mono">
                          {isFormative ? (
                            <span className="text-slate-400 italic">N/A</span>
                          ) : (
                            <span className={rhoAOk ? 'text-slate-800 font-bold' : 'text-rose-600 font-bold'}>
                              {v.rhoA !== null ? v.rhoA.toFixed(3) : '-'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center font-mono">
                          {isFormative ? (
                            <span className="text-slate-400 italic">N/A</span>
                          ) : (
                            <span className={compOk ? 'text-indigo-600 font-extrabold' : 'text-rose-600 font-bold'}>
                              {v.compositeReliability !== null ? v.compositeReliability.toFixed(3) : '-'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center font-mono">
                          {isFormative ? (
                            <span className="text-slate-400 italic">N/A</span>
                          ) : (
                            <span className={aveOk ? 'text-emerald-600 font-extrabold' : 'text-rose-600 font-bold'}>
                              {v.ave !== null ? v.ave.toFixed(3) : '-'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          {isFormative ? (
                            <span className="text-[10px] text-slate-400 font-medium italic">Evaluation by Outer VIF</span>
                          ) : hasViolations ? (
                            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-200">
                              <AlertTriangle className="w-3 h-3 text-rose-500" /> Violations Found
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle className="w-3 h-3 text-emerald-500" /> Fully Valid
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 max-w-4xl text-xs text-slate-600">
              <p className="font-bold text-slate-800 flex items-center gap-1">
                <Award className="w-4 h-4 text-indigo-500" /> Standard Academic Threshold Benchmarks:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Cronbach's Alpha (&alpha;) &amp; Composite Reliability (&rho;<sub>C</sub> / &rho;<sub>A</sub>)</strong>: Should exceed <strong>0.70</strong> for satisfactory construct internal consistency. Values between 0.60 and 0.70 are acceptable in exploratory research.</li>
                <li><strong>Average Variance Extracted (AVE)</strong>: Measures convergent validity and must exceed <strong>0.50</strong>, meaning the latent construct explains more than 50% of the variance of its assigned indicators.</li>
              </ul>
            </div>
          </div>
        )}

        {/* TABS 4: DISCRIMINANT VALIDITY */}
        {activeTab === 'discriminant' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" /> Discriminant Validity Diagnostics
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Determines whether constructs are truly distinct from one another using academic metrics.
                </p>
              </div>

              {/* Sub tabs switcher */}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  id="subtab-fornell"
                  onClick={() => setDiscTab('fornell')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition ${
                    discTab === 'fornell'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Fornell-Larcker Criterion
                </button>
                <button
                  id="subtab-htmt"
                  onClick={() => setDiscTab('htmt')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition ${
                    discTab === 'htmt'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  HTMT Ratio
                </button>
              </div>
            </div>

            {/* SUBTAB A: FORNELL-LARCKER */}
            {discTab === 'fornell' && (
              <div className="space-y-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-center border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[9px]">
                        <th className="py-3 px-4 text-left">Latent Construct</th>
                        {constructs.map(c => (
                          <th key={c.id} className="py-3 px-4">{c.name.split(' ')[0]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                      {constructs.map((cRow) => {
                        const valRow = results.constructValidity.find(v => v.id === cRow.id);
                        const sqrtAve = valRow?.ave !== null && valRow?.ave !== undefined ? Math.sqrt(valRow.ave) : null;

                        return (
                          <tr key={cRow.id} className="hover:bg-slate-50 transition">
                            <td className="py-3.5 px-4 font-bold text-slate-800 text-left font-sans bg-slate-50/50">{cRow.name}</td>
                            {constructs.map((cCol) => {
                              const isDiagonal = cRow.id === cCol.id;
                              
                              if (isDiagonal) {
                                return (
                                  <td key={cCol.id} className="py-3.5 px-4 bg-indigo-50/30 text-indigo-700 font-extrabold text-xs underline">
                                    {sqrtAve !== null ? sqrtAve.toFixed(3) : '-'}
                                  </td>
                                );
                              }

                              const rValue = results.correlations[cRow.id]?.[cCol.id] ?? 0;
                              // Violation if correlation > diagonal sqrt(AVE) of either construct
                              const colVal = results.constructValidity.find(v => v.id === cCol.id);
                              const colSqrtAve = colVal?.ave !== null && colVal?.ave !== undefined ? Math.sqrt(colVal.ave) : null;
                              
                              const hasViolation = 
                                (sqrtAve !== null && Math.abs(rValue) > sqrtAve) ||
                                (colSqrtAve !== null && Math.abs(rValue) > colSqrtAve);

                              return (
                                <td 
                                  key={cCol.id} 
                                  className={`py-3.5 px-4 font-medium ${hasViolation ? 'text-rose-600 bg-rose-50/20 font-bold' : 'text-slate-600'}`}
                                >
                                  {rValue.toFixed(3)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-xs text-slate-600 max-w-3xl">
                  <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-800">Fornell-Larcker Criterion Interpretation:</p>
                    <p className="mt-1">
                      The diagonal values (underlined) represent the <strong>square root of each construct's AVE</strong>.
                      For satisfactory discriminant validity, the diagonal value of any construct must be <strong>greater than</strong> its correlation values with all other constructs (the off-diagonal entries in the same row/column).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB B: HTMT RATIO */}
            {discTab === 'htmt' && (
              <div className="space-y-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-center border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[9px]">
                        <th className="py-3 px-4 text-left">Latent Construct</th>
                        {constructs.map(c => (
                          <th key={c.id} className="py-3 px-4">{c.name.split(' ')[0]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                      {constructs.map((cRow, rIdx) => {
                        return (
                          <tr key={cRow.id} className="hover:bg-slate-50 transition">
                            <td className="py-3.5 px-4 font-bold text-slate-800 text-left font-sans bg-slate-50/50">{cRow.name}</td>
                            {constructs.map((cCol, cIdx) => {
                              const isDiagonal = cRow.id === cCol.id;
                              if (isDiagonal) {
                                return <td key={cCol.id} className="py-3.5 px-4 text-slate-300">-</td>;
                              }
                              
                              // Lower triangular matrix display for ease of reading
                              if (cIdx > rIdx) {
                                return <td key={cCol.id} className="py-3.5 px-4 text-slate-300 bg-slate-50/10">-</td>;
                              }

                              const htmtRatio = results.htmt[cRow.id]?.[cCol.id] ?? 0;
                              const isViolatedStrict = htmtRatio > 0.85;
                              const isViolatedLenient = htmtRatio > 0.90;

                              let cellColor = 'text-slate-600';
                              let cellBg = '';
                              
                              if (isViolatedLenient) {
                                cellColor = 'text-rose-600 font-extrabold';
                                cellBg = 'bg-rose-50/30';
                              } else if (isViolatedStrict) {
                                cellColor = 'text-amber-600 font-bold';
                                cellBg = 'bg-amber-50/20';
                              }

                              return (
                                <td 
                                  key={cCol.id} 
                                  className={`py-3.5 px-4 font-medium ${cellColor} ${cellBg}`}
                                >
                                  {htmtRatio.toFixed(3)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-xs text-slate-600 max-w-3xl">
                  <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-800">Heterotrait-Monotrait (HTMT) Ratio Interpretation:</p>
                    <p className="mt-1">
                      HTMT measures the ratio of between-construct indicator correlations to within-construct correlations. 
                      Values above <strong>0.90</strong> indicate severe discriminant validity violations (the constructs are too similar).
                      A strict conservative threshold is <strong>0.85</strong>. Yellow or red entries indicate potential overlap.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TABS 5: COLLINEARITY (VIF) */}
        {activeTab === 'vif' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-indigo-600" /> Collinearity Diagnostics (Variance Inflation Factor - VIF)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Checks for multicollinearity issues among predictor constructs (inner model) and formative indicators (outer model).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Inner VIF Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-1.5 uppercase tracking-wider text-[10px]">
                  Inner Structural Model VIF
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[9px] uppercase">
                        <th className="py-2.5 px-4">Target Construct</th>
                        <th className="py-2.5 px-4">Predictor</th>
                        <th className="py-2.5 px-4 text-center">VIF Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {results.vif.filter(v => v.type === 'inner').map((v, idx) => {
                        const isSevere = v.vif >= 5.0;
                        const isModerate = v.vif >= 3.0;

                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 px-4 font-semibold">{v.targetName}</td>
                            <td className="py-2.5 px-4 text-slate-600 font-medium">{v.predictor}</td>
                            <td className={`py-2.5 px-4 text-center font-mono font-bold ${
                              isSevere ? 'text-rose-600 bg-rose-50/20' : isModerate ? 'text-amber-600 bg-amber-50/10' : 'text-emerald-600'
                            }`}>
                              {v.vif.toFixed(3)}
                            </td>
                          </tr>
                        );
                      })}
                      {results.vif.filter(v => v.type === 'inner').length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-slate-400 italic">
                            No multicollinear predictors (requires 2+ predictors pointing to same construct).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Outer VIF Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-1.5 uppercase tracking-wider text-[10px]">
                  Outer Formative Model VIF
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[9px] uppercase">
                        <th className="py-2.5 px-4">Formative Construct</th>
                        <th className="py-2.5 px-4">Indicator</th>
                        <th className="py-2.5 px-4 text-center">VIF Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {results.vif.filter(v => v.type === 'outer').map((v, idx) => {
                        const isSevere = v.vif >= 5.0;
                        const isModerate = v.vif >= 3.0;

                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 px-4 font-semibold">{v.targetName}</td>
                            <td className="py-2.5 px-4 text-slate-600 font-medium">{v.predictor}</td>
                            <td className={`py-2.5 px-4 text-center font-mono font-bold ${
                              isSevere ? 'text-rose-600 bg-rose-50/20' : isModerate ? 'text-amber-600' : 'text-emerald-600'
                            }`}>
                              {v.vif.toFixed(3)}
                            </td>
                          </tr>
                        );
                      })}
                      {results.vif.filter(v => v.type === 'outer').length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-slate-400 italic">
                            No formative constructs with multiple indicators.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-xs text-slate-600 max-w-3xl">
              <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800">Variance Inflation Factor (VIF) Thresholds:</p>
                <p className="mt-1">
                  VIF values assess multicollinearity. A VIF <strong>&ge; 5.0</strong> indicates severe collinearity issues that may distort estimates. 
                  In strict contexts, a VIF <strong>&ge; 3.0</strong> is a threshold of concern. Ideally, all VIF values should be below 3.0.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TABS 6: MODEL FIT */}
        {activeTab === 'fit' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-indigo-600" /> Overall Model Fit Indices
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Standard criteria to evaluate the explanatory power and global predictive fit of the PLS path model.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
              {/* SRMR Metric Box */}
              <div className="border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">SRMR Residual Index</span>
                  {results.srmr < 0.08 ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-100">
                      Good Fit
                    </span>
                  ) : results.srmr < 0.10 ? (
                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-amber-100">
                      Acceptable Fit
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-rose-100">
                      Poor Fit
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-3xl font-extrabold font-mono text-indigo-700">
                    {results.srmr.toFixed(4)}
                  </div>
                  <div className="text-xs text-slate-400 font-semibold">
                    Standardized Root Mean Square Residual
                  </div>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  SRMR is the standardized difference between the observed correlation matrix and the model-implied correlation matrix. 
                  A value below <strong>0.08</strong> indicates a good model fit, meaning the theoretical model structure aligns tightly with empirical observations.
                </p>
              </div>

              {/* R-squared Detail Table */}
              <div className="border border-slate-200 rounded-xl p-5 shadow-sm bg-white space-y-4 col-span-1 md:col-span-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Endogenous Variance Explained (R² & Adjusted R²)
                </span>
                <div className="overflow-x-auto border border-slate-100 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[9px]">
                        <th className="py-2.5 px-4">Endogenous Target Construct</th>
                        <th className="py-2.5 px-4 text-center">R-squared (R²)</th>
                        <th className="py-2.5 px-4 text-center">Adjusted R-squared (R² adj)</th>
                        <th className="py-2.5 px-4 text-center">Explanatory Strength</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-gray-700">
                      {Object.entries(results.rSquare).map(([cId, val]) => {
                        const cName = constructsMap.get(cId)?.name ?? cId;
                        const adjVal = results.rSquareAdj?.[cId] ?? val;
                        
                        let powerBadge = null;
                        if (val >= 0.67) {
                          powerBadge = (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Substantial (&ge; 0.67)
                            </span>
                          );
                        } else if (val >= 0.33) {
                          powerBadge = (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                              Moderate (&ge; 0.33)
                            </span>
                          );
                        } else if (val >= 0.19) {
                          powerBadge = (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                              Weak (&ge; 0.19)
                            </span>
                          );
                        } else {
                          powerBadge = (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-medium bg-gray-150 text-gray-500 border border-gray-250">
                              Very Weak (&lt; 0.19)
                            </span>
                          );
                        }

                        return (
                          <tr key={cId} className="hover:bg-slate-50/40">
                            <td className="py-2.5 px-4 font-bold text-slate-900">{cName}</td>
                            <td className="py-2.5 px-4 text-center font-bold font-mono text-indigo-700">{val.toFixed(3)}</td>
                            <td className="py-2.5 px-4 text-center font-bold font-mono text-indigo-500">
                              {adjVal.toFixed(3)}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              {powerBadge}
                            </td>
                          </tr>
                        );
                      })}
                      {Object.keys(results.rSquare).length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                            No endogenous target constructs found. Draw structural paths pointing to latent variables.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TABS: NORMALITY TESTING */}
        {activeTab === 'normality' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600" /> Empirical Normality Diagnostics
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Jarque-Bera tests, Skewness, and Excess Kurtosis calculations for all numeric indicators in the loaded dataset.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[9px]">
                    <th className="py-3 px-4">Dataset Column / Indicator</th>
                    <th className="py-3 px-4 text-center">Mean</th>
                    <th className="py-3 px-4 text-center">Std. Deviation (SD)</th>
                    <th className="py-3 px-4 text-center">Skewness</th>
                    <th className="py-3 px-4 text-center">Excess Kurtosis</th>
                    <th className="py-3 px-4 text-center">Jarque-Bera Stat</th>
                    <th className="py-3 px-4 text-center">JB p-value</th>
                    <th className="py-3 px-4 text-center">Distribution Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                  {results.normality?.map((n, idx) => {
                    const isNormal = n.pValue >= 0.05;
                    const skewSeverity = Math.abs(n.skewness) > 1 ? 'text-amber-600 font-bold' : 'text-slate-600';
                    const kurtSeverity = Math.abs(n.kurtosis) > 1.5 ? 'text-amber-600 font-bold' : 'text-slate-600';

                    return (
                      <tr key={idx} className="hover:bg-slate-50/40 transition">
                        <td className="py-3 px-4 font-bold text-slate-900 font-sans">{n.column}</td>
                        <td className="py-3 px-4 text-center text-slate-600">{n.mean.toFixed(4)}</td>
                        <td className="py-3 px-4 text-center text-slate-600">{n.stdDev.toFixed(4)}</td>
                        <td className={`py-3 px-4 text-center ${skewSeverity}`}>{n.skewness.toFixed(4)}</td>
                        <td className={`py-3 px-4 text-center ${kurtSeverity}`}>{n.kurtosis.toFixed(4)}</td>
                        <td className="py-3 px-4 text-center text-slate-600 font-semibold">{n.jbStat.toFixed(4)}</td>
                        <td className="py-3 px-4 text-center font-bold text-indigo-700">
                          {formatPValue(n.pValue)}
                        </td>
                        <td className="py-3 px-4 text-center font-sans">
                          {isNormal ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-100">
                              <CheckCircle className="w-3 h-3" /> Normal (p &ge; 0.05)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-100">
                              <AlertTriangle className="w-3 h-3" /> Non-Normal (p &lt; 0.05)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(!results.normality || results.normality.length === 0) && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 italic font-sans">
                        No normality diagnostics available. Upload a dataset to view distribution metrics.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-xs text-slate-600 max-w-4xl">
              <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800">Interpretive Guidelines for Normality Testing in PLS-SEM:</p>
                <div className="mt-1.5 space-y-2 leading-relaxed">
                  <p>
                    <strong>Non-parametric Nature</strong>: PLS-SEM does not assume normally distributed data. However, highly non-normal data can artificially reduce bootstrapping precision, which inflates standard errors and diminishes statistical power (Hair et al., 2019).
                  </p>
                  <p>
                    <strong>Skewness & Kurtosis</strong>: As a rule of thumb, skewness values between <strong>-1 and +1</strong> are acceptable. Excess kurtosis values between <strong>-1.5 and +1.5</strong> are acceptable. Extreme violations (e.g., skewness absolute value &gt; 2 or excess kurtosis absolute value &gt; 7) indicate heavy-tailed non-normality.
                  </p>
                  <p>
                    <strong>Jarque-Bera Test</strong>: The Jarque-Bera test determines if skewness and kurtosis match a normal distribution. A <strong>p-value &lt; 0.05</strong> rejects the null hypothesis of normality, confirming statistically significant non-normality.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
