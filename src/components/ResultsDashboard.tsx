import React, { useState } from 'react';
import { PLSResults, Construct } from '../types';
import { ArrowRight, CheckCircle, AlertTriangle, XCircle, BarChart3, ShieldCheck, Layers, Award, Info, RefreshCw } from 'lucide-react';

interface ResultsDashboardProps {
  results: PLSResults;
  constructs: Construct[];
  onRunBootstrapping: () => void;
  bootstrappingProgress: number | null;
}

export default function ResultsDashboard({
  results,
  constructs,
  onRunBootstrapping,
  bootstrappingProgress
}: ResultsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'paths' | 'effects' | 'reliability' | 'discriminant' | 'vif' | 'fit'>('paths');
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
        </div>

        <div className="py-2 shrink-0">
          <span className="text-[10px] bg-gray-150 text-gray-700 px-2.5 py-1 rounded font-bold font-mono border border-gray-200">
            Converged in {results.iterationsRun} iterations
          </span>
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

              {/* R-squared Summary Box */}
              <div className="border border-slate-200 rounded-xl p-5 shadow-sm bg-white space-y-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Endogenous Variance Explained (R²)
                </span>
                <div className="space-y-3.5 max-h-[140px] overflow-y-auto">
                  {Object.entries(results.rSquare).map(([cId, val]) => {
                    const cName = constructsMap.get(cId)?.name ?? cId;
                    return (
                      <div key={cId} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-700">{cName}</span>
                          <span className="font-mono text-indigo-600 font-bold">{val.toFixed(3)}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${val * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(results.rSquare).length === 0 && (
                    <p className="text-xs text-slate-400 italic py-2">
                      No endogenous constructs found (requires structural paths pointing to them).
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
