import React, { useState } from 'react';
import { PLSAlgorithmOptions, BootstrappingOptions } from '../types';
import { X, Sliders, HelpCircle, Shuffle, ChevronRight, Info } from 'lucide-react';

interface AnalysisSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'pls' | 'bootstrap';
  algoSettings: PLSAlgorithmOptions;
  bootSettings: BootstrappingOptions;
  onRun: (algo: PLSAlgorithmOptions, boot: BootstrappingOptions) => void;
}

export default function AnalysisSettingsModal({
  isOpen,
  onClose,
  type,
  algoSettings,
  bootSettings,
  onRun
}: AnalysisSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'algo' | 'boot'>(type === 'bootstrap' ? 'boot' : 'algo');

  // Local state to hold user edits before applying
  const [localAlgo, setLocalAlgo] = useState<PLSAlgorithmOptions>({ ...algoSettings });
  const [localBoot, setLocalBoot] = useState<BootstrappingOptions>({ ...bootSettings });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRun(localAlgo, localBoot);
    onClose();
  };

  const handleResetDefaults = () => {
    setLocalAlgo({
      weightingScheme: 'path',
      maxIterations: 300,
      tolerance: 1e-7
    });
    setLocalBoot({
      samplesCount: 500,
      significanceLevel: 0.05,
      testType: 'two-tailed'
    });
  };

  return (
    <div id="analysis-settings-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div 
        id="settings-modal-card"
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden max-h-[90vh] animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-150 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-100 text-indigo-700 p-2 rounded-xl">
              <Sliders className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                {type === 'bootstrap' ? 'Bootstrapping Resampling Parameters' : 'PLS-SEM Algorithm Parameters'}
              </h2>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                Configure estimation and statistical significance tests
              </p>
            </div>
          </div>
          <button 
            id="close-settings-modal"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-150 bg-white px-6">
          <button
            type="button"
            id="tab-algo-settings"
            onClick={() => setActiveTab('algo')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'algo'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            PLS-SEM Algorithm
          </button>
          
          <button
            type="button"
            id="tab-boot-settings"
            onClick={() => setActiveTab('boot')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'boot'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
            Bootstrapping {type === 'pls' && <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded ml-1 font-normal">Inactive</span>}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Tab Content: PLS-SEM Algorithm Settings */}
          {activeTab === 'algo' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Inner Weighting Scheme
                </label>
                <select
                  id="weighting-scheme-select"
                  value={localAlgo.weightingScheme}
                  onChange={(e) => setLocalAlgo({ ...localAlgo, weightingScheme: e.target.value as any })}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                >
                  <option value="path">Path Weighting Scheme (Recommended / SmartPLS Default)</option>
                  <option value="factor">Factor Weighting Scheme</option>
                  <option value="centroid">Centroid Weighting Scheme</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  The Path scheme provides the highest explanatory power (R²) and is preferred for standard structural equation modeling. Factor uses simple correlations, while Centroid uses sign matrices.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Max Iterations
                  </label>
                  <input
                    type="number"
                    id="max-iterations-input"
                    min="10"
                    max="2000"
                    value={localAlgo.maxIterations}
                    onChange={(e) => setLocalAlgo({ ...localAlgo, maxIterations: parseInt(e.target.value) || 300 })}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono font-bold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    SmartPLS Default: 300
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Stop Criterion (Tolerance)
                  </label>
                  <select
                    id="stop-criterion-select"
                    value={localAlgo.tolerance.toString()}
                    onChange={(e) => setLocalAlgo({ ...localAlgo, tolerance: parseFloat(e.target.value) || 1e-7 })}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono font-bold"
                  >
                    <option value="1e-5">1.0e-5 (Fast)</option>
                    <option value="1e-7">1.0e-7 (Recommended Default)</option>
                    <option value="1e-9">1.0e-9 (Highest Precision)</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    SmartPLS Default: 1.0e-7
                  </p>
                </div>
              </div>

              {type === 'pls' && (
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 flex gap-2.5 text-xs text-indigo-900 mt-4 leading-relaxed">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Ready to Calculate PLS Path Coefficients</p>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      You are about to execute standard PLS-SEM. This loads indicator loadings, weights, path coefficients, VIF, HTMT, and model fit index values.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab Content: Bootstrapping Settings */}
          {activeTab === 'boot' && (
            <div className="space-y-4">
              {type === 'pls' && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5 flex gap-2.5 text-xs text-amber-900 leading-relaxed">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Bootstrapping is currently inactive</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      You initiated a standard PLS-SEM Algorithm run. To run bootstrapping and test statistical significance, close this modal and click the <strong>Bootstrap Signif.</strong> button.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Bootstrap Subsamples (Count)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    id="bootstrap-samples-input"
                    min="10"
                    max="5000"
                    value={localBoot.samplesCount}
                    disabled={type === 'pls'}
                    onChange={(e) => setLocalBoot({ ...localBoot, samplesCount: parseInt(e.target.value) || 500 })}
                    className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono font-bold disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  {type === 'bootstrap' && (
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-[10px] font-bold">
                      {[100, 250, 500].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setLocalBoot({ ...localBoot, samplesCount: num })}
                          className={`px-2.5 py-1 rounded transition ${
                            localBoot.samplesCount === num
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  Higher samples (e.g. 500) provide extremely precise standard errors and p-values, but run slightly longer. 250 samples is balanced and finishes in ~1 second.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Significance Level (&alpha;)
                  </label>
                  <select
                    id="significance-level-select"
                    value={localBoot.significanceLevel.toString()}
                    disabled={type === 'pls'}
                    onChange={(e) => setLocalBoot({ ...localBoot, significanceLevel: parseFloat(e.target.value) || 0.05 })}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold"
                  >
                    <option value="0.01">0.01 (99% Confidence Interval)</option>
                    <option value="0.05">0.05 (95% Confidence Interval)</option>
                    <option value="0.10">0.10 (90% Confidence Interval)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Test Type
                  </label>
                  <select
                    id="test-type-select"
                    value={localBoot.testType}
                    disabled={type === 'pls'}
                    onChange={(e) => setLocalBoot({ ...localBoot, testType: e.target.value as any })}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold"
                  >
                    <option value="two-tailed">Two-Tailed (Standard / SmartPLS Default)</option>
                    <option value="one-tailed">One-Tailed (Directed Hypotheses)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Confidence Interval Method
                </label>
                <div className="w-full bg-slate-50 border border-slate-150 rounded-lg px-3 py-2.5 text-slate-500 font-medium text-xs">
                  Percentile Bootstrap (Standard Non-parametric)
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-150 bg-slate-50/50 flex justify-between items-center shrink-0">
          <button
            type="button"
            id="reset-settings-defaults"
            onClick={handleResetDefaults}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline transition cursor-pointer"
          >
            Reset SmartPLS Defaults
          </button>
          
          <div className="flex gap-2">
            <button
              type="button"
              id="cancel-settings-modal"
              onClick={onClose}
              className="px-4 py-2 border border-slate-250 hover:bg-slate-100 text-slate-650 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              id="submit-settings-modal"
              onClick={handleSubmit}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-500/10 transition cursor-pointer"
            >
              {type === 'bootstrap' ? 'Start Bootstrapping' : 'Run PLS-SEM'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
