import React, { useState, useEffect } from 'react';
import { Dataset, Construct, StructuralPath, PLSResults } from './types';
import { builtInDatasets, defaultCorpRepModel, defaultTamModel } from './utils/demoData';
import { runPlsSem } from './utils/plsAlgorithm';
import { runBootstrapping } from './utils/bootstrapping';
import DatasetPanel from './components/DatasetPanel';
import ModelCanvas from './components/ModelCanvas';
import ResultsDashboard from './components/ResultsDashboard';
import { Sigma, Info, BookOpen, AlertCircle, Sparkles, ChevronDown, RefreshCw, Layers } from 'lucide-react';

export default function App() {
  // 1. Core State
  const [selectedDataset, setSelectedDataset] = useState<Dataset>(builtInDatasets.corpRep);
  const [constructs, setConstructs] = useState<Construct[]>(defaultCorpRepModel.constructs);
  const [paths, setPaths] = useState<StructuralPath[]>(defaultCorpRepModel.paths);
  const [selectedConstructId, setSelectedConstructId] = useState<string | null>(null);
  const [results, setResults] = useState<PLSResults | null>(null);
  const [bootstrappingProgress, setBootstrappingProgress] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'canvas-only' | 'results-only'>('split');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Auto-run the PLS-SEM algorithm on load so the user sees results immediately
  useEffect(() => {
    handleRunPlsSem();
  }, []);

  // 2. Event Handlers
  const handleDatasetChange = (newDataset: Dataset, defaultModelKey?: 'corpRep' | 'tam') => {
    setSelectedDataset(newDataset);
    setResults(null);
    setSelectedConstructId(null);
    setValidationError(null);

    if (defaultModelKey === 'corpRep') {
      setConstructs(defaultCorpRepModel.constructs);
      setPaths(defaultCorpRepModel.paths);
    } else if (defaultModelKey === 'tam') {
      setConstructs(defaultTamModel.constructs);
      setPaths(defaultTamModel.paths);
    } else {
      // Custom uploaded CSV: clear model so they can build a new one from scratch
      setConstructs([]);
      setPaths([]);
    }
  };

  const validateModel = (): boolean => {
    setValidationError(null);

    if (constructs.length === 0) {
      setValidationError('Please place at least one construct on the canvas.');
      return false;
    }

    // Check if any construct is missing indicators
    const missingIndicators = constructs.filter(c => c.indicators.length === 0);
    if (missingIndicators.length > 0) {
      setValidationError(
        `Please assign at least one indicator to: ${missingIndicators.map(c => c.name).join(', ')}`
      );
      return false;
    }

    // Check if indicators assigned actually exist in the dataset
    for (const c of constructs) {
      for (const ind of c.indicators) {
        if (!selectedDataset.columns.includes(ind)) {
          setValidationError(`Indicator "${ind}" assigned to "${c.name}" was not found in the dataset columns.`);
          return false;
        }
      }
    }

    return true;
  };

  const handleRunPlsSem = () => {
    if (!validateModel()) return;

    try {
      const res = runPlsSem(selectedDataset, constructs, paths);
      setResults(res);
      
      // If we are currently in canvas-only, expand to split to see the results
      if (viewMode === 'canvas-only') {
        setViewMode('split');
      }
    } catch (err: any) {
      setValidationError(`Algorithm execution error: ${err.message || err}`);
    }
  };

  const handleRunBootstrapping = async () => {
    if (!validateModel()) return;

    try {
      setBootstrappingProgress(0);
      setValidationError(null);
      
      const enrichedResults = await runBootstrapping(
        selectedDataset,
        constructs,
        paths,
        250, // 250 samples is extremely accurate for browser execution and finishes in ~1.5 seconds!
        (prog) => {
          setBootstrappingProgress(prog.percent);
        }
      );

      setResults(enrichedResults);
      setBootstrappingProgress(null);
    } catch (err: any) {
      setBootstrappingProgress(null);
      setValidationError(`Bootstrapping execution error: ${err.message || err}`);
    }
  };

  const handleClearModel = () => {
    setConstructs([]);
    setPaths([]);
    setResults(null);
    setSelectedConstructId(null);
    setValidationError(null);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#f3f4f6] text-gray-950 overflow-hidden font-sans">
      
      {/* 1. APP HEADER RAIL */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-gray-200 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="bg-gradient-to-tr from-indigo-500 to-indigo-600 p-1.5 rounded-lg text-white shadow-lg shadow-indigo-500/20">
            <Sigma className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-gray-900 flex items-center gap-1.5 leading-none">
              PLS-SEM Studio <span className="text-[10px] bg-gray-100 text-indigo-600 font-bold px-2 py-0.5 rounded border border-gray-200">v1.1</span>
            </h1>
            <p className="text-[10px] text-gray-500 font-medium mt-1">
              Interactive Path Modeling & Bootstrapping Resampling Engine
            </p>
          </div>
        </div>

        {/* Top middle validation notification panel */}
        {validationError && (
          <div className="hidden lg:flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-1.5 rounded-lg text-xs font-semibold animate-pulse max-w-lg">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span className="truncate">{validationError}</span>
          </div>
        )}

        {/* Global Control Buttons */}
        <div className="flex items-center gap-3">
          <button
            id="clear-all-btn"
            onClick={handleClearModel}
            className="px-3 py-1.5 text-xs font-bold border border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-gray-900 bg-white rounded-lg transition"
          >
            Clear Model
          </button>
          <button
            id="reset-demo-btn"
            onClick={() => handleDatasetChange(builtInDatasets.corpRep, 'corpRep')}
            className="px-3 py-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-600 hover:text-indigo-700 rounded-lg transition"
          >
            Reload Corporate Demo
          </button>
        </div>
      </header>

      {/* 2. MAIN SPLIT COMPONENT BODY */}
      <main className="flex-1 flex overflow-hidden bg-[#f3f4f6]">
        
        {/* LEFT COMPONENT: DATASET PANEL */}
        <section className="w-[285px] border-r border-gray-200 flex flex-col shrink-0 overflow-hidden bg-white">
          <DatasetPanel
            selectedDataset={selectedDataset}
            onDatasetChange={handleDatasetChange}
            constructs={constructs}
          />
        </section>

        {/* CENTER & BOTTOM COMPONENT: INTERACTIVE CANVAS AND RESULTS SHEETS */}
        <section className="flex-1 flex flex-col overflow-hidden bg-[#f3f4f6] p-4 gap-4">
          
          {/* Mobile/Tablet validation error display */}
          {validationError && (
            <div className="lg:hidden flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-lg text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Workbench layout switcher bar */}
          <div className="flex items-center justify-between border border-gray-200 bg-white px-4 py-2 rounded-xl shrink-0 shadow-sm">
            <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-gray-400" /> Workbench Workspace Layout
            </span>
            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
              <button
                id="layout-canvas"
                onClick={() => setViewMode('canvas-only')}
                className={`px-3 py-1 text-[10px] font-bold rounded transition ${
                  viewMode === 'canvas-only'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Model Canvas
              </button>
              <button
                id="layout-split"
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 text-[10px] font-bold rounded transition ${
                  viewMode === 'split'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Split View (Both)
              </button>
              <button
                id="layout-results"
                onClick={() => setViewMode('results-only')}
                className={`px-3 py-1 text-[10px] font-bold rounded transition ${
                  viewMode === 'results-only'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Detailed Reports
              </button>
            </div>
          </div>

          {/* Dynamic Display Panels based on ViewMode */}
          <div className="flex-1 flex flex-col min-h-0 gap-4">
            
            {/* CANVAS WRAPPER */}
            {(viewMode === 'split' || viewMode === 'canvas-only') && (
              <div className={`transition-all duration-300 min-h-[300px] ${
                viewMode === 'canvas-only' ? 'flex-1' : 'h-[50%]'
              }`}>
                <ModelCanvas
                  constructs={constructs}
                  paths={paths}
                  datasetColumns={selectedDataset.columns}
                  results={results}
                  onUpdateConstructs={setConstructs}
                  onUpdatePaths={setPaths}
                  onRunPls={handleRunPlsSem}
                  onRunBootstrapping={handleRunBootstrapping}
                  bootstrappingProgress={bootstrappingProgress}
                  selectedConstructId={selectedConstructId}
                  onSelectConstruct={setSelectedConstructId}
                />
              </div>
            )}

            {/* RESULTS SHEET WRAPPER */}
            {(viewMode === 'split' || viewMode === 'results-only') && (
              <div className={`transition-all duration-300 ${
                viewMode === 'results-only' ? 'flex-1' : 'flex-1 min-h-[250px]'
              }`}>
                {results ? (
                  <ResultsDashboard
                    results={results}
                    constructs={constructs}
                    onRunBootstrapping={handleRunBootstrapping}
                    bootstrappingProgress={bootstrappingProgress}
                  />
                ) : (
                  <div className="h-full bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center p-6 text-center select-none shadow-sm">
                    <Sigma className="w-10 h-10 text-gray-300 mb-2 animate-pulse" />
                    <h3 className="text-sm font-bold text-gray-500">Statistical Analysis Pending</h3>
                    <p className="text-xs text-gray-400 max-w-xs mt-1.5 leading-relaxed">
                      Construct and link paths on the model canvas above, then click <strong>Run PLS-SEM</strong> to generate full coefficients, validity, and collinearity tables.
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>

        </section>

      </main>
      
    </div>
  );
}
