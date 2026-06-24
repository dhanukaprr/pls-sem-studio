import React, { useRef, useState } from 'react';
import { Dataset, Construct } from '../types';
import { parseCSV } from '../utils/csvParser';
import { builtInDatasets } from '../utils/demoData';
import { Upload, Database, Eye, BarChart, ChevronDown, ChevronUp, Check, AlertCircle } from 'lucide-react';
import { getMean, getStdDev } from '../utils/math';

interface DatasetPanelProps {
  selectedDataset: Dataset;
  onDatasetChange: (dataset: Dataset, defaultModelKey?: 'corpRep' | 'tam') => void;
  constructs: Construct[];
}

export default function DatasetPanel({
  selectedDataset,
  onDatasetChange,
  constructs
}: DatasetPanelProps) {
  const [dragOverActive, setDragOverActive] = useState(false);
  const [expandedVar, setExpandedVar] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const assignedVariables = new Set(constructs.flatMap(c => c.indicators));

  // CSV file drag and drop upload
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragOverActive(true);
    } else if (e.type === 'dragleave') {
      setDragOverActive(false);
    }
  };

  const processFile = async (file: File) => {
    try {
      setErrorMsg(null);
      const text = await file.text();
      const dataset = parseCSV(text, file.name);
      onDatasetChange(dataset);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to parse CSV file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Switch demo datasets
  const handleSelectDemo = (key: 'corpRep' | 'tam') => {
    setErrorMsg(null);
    onDatasetChange(builtInDatasets[key], key);
  };

  // Compute descriptive statistics on-demand for a column
  const getStats = (col: string) => {
    const vals = selectedDataset.rows.map(r => r[col] ?? 0);
    const mean = getMean(vals);
    const std = getStdDev(vals, mean);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { mean, std, min, max };
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Selector and Dropdown section */}
      <div className="p-4 border-b border-gray-200 bg-gray-50/50 space-y-3">
        <h3 className="text-xs font-bold text-gray-700 flex items-center gap-1.5 uppercase tracking-wider">
          <Database className="w-4 h-4 text-indigo-600" /> Active Dataset
        </h3>
        
        <div className="grid grid-cols-2 gap-2">
          <button
            id="btn-demo-corprep"
            onClick={() => handleSelectDemo('corpRep')}
            className={`px-3 py-2 text-[11px] font-bold rounded-lg border text-center transition cursor-pointer ${
              selectedDataset.name.includes('Corporate')
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Corporate Rep (Demo)
          </button>
          <button
            id="btn-demo-tam"
            onClick={() => handleSelectDemo('tam')}
            className={`px-3 py-2 text-[11px] font-bold rounded-lg border text-center transition cursor-pointer ${
              selectedDataset.name.includes('Acceptance')
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            TAM Model (Demo)
          </button>
        </div>

        {/* Selected File Badge info */}
        <div className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-xs font-semibold text-gray-800 truncate" title={selectedDataset.name}>
            {selectedDataset.name}
          </p>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400 font-bold font-mono">
            <span>COLUMNS: {selectedDataset.columns.length}</span>
            <span>ROWS (N): {selectedDataset.rows.length}</span>
          </div>
        </div>
      </div>

      {/* CSV File Drag & Drop Upload Zone */}
      <div className="p-4 border-b border-gray-200">
        <div
          id="csv-drag-upload-zone"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center ${
            dragOverActive
              ? 'border-indigo-600 bg-indigo-50/50'
              : 'border-gray-300 hover:border-indigo-500 bg-gray-50/50 hover:bg-white'
          }`}
        >
          <Upload className="w-6 h-6 text-gray-400 mb-1.5" />
          <span className="text-xs font-bold text-gray-700">Upload custom CSV dataset</span>
          <span className="text-[10px] text-gray-400 mt-0.5">Drag CSV file or click here</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {errorMsg && (
          <div className="mt-3 p-2.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-lg text-[10px] flex gap-1.5 font-medium leading-relaxed">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Manifest Variables / Drag items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <div className="flex items-center justify-between text-gray-500 font-bold text-[10px] uppercase tracking-wider mb-2">
          <span>Indicators / Columns</span>
          <span>{assignedVariables.size} / {selectedDataset.columns.length} assigned</span>
        </div>

        <div className="space-y-1.5">
          {selectedDataset.columns.map((col) => {
            const isAssigned = assignedVariables.has(col);
            const isExpanded = expandedVar === col;

            // HTML5 DragStart handler
            const handleDragStart = (e: React.DragEvent) => {
              e.dataTransfer.setData('text/plain', col);
              e.dataTransfer.effectAllowed = 'copy';
            };

            return (
              <div
                key={col}
                draggable={true}
                onDragStart={handleDragStart}
                className={`border rounded-lg p-2 bg-white transition group cursor-grab active:cursor-grabbing hover:shadow-sm ${
                  isAssigned
                    ? 'border-emerald-200 bg-emerald-50/20 hover:border-emerald-300'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <BarChart className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-500 transition" />
                    <span className="text-xs font-bold text-gray-700 truncate" title="Drag me to a construct on the canvas!">
                      {col}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAssigned && (
                      <span className="inline-flex items-center bg-emerald-50 border border-emerald-100 text-emerald-700 text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                        <Check className="w-2.5 h-2.5 mr-0.5 text-emerald-600" /> Assigned
                      </span>
                    )}

                    <button
                      onClick={() => setExpandedVar(isExpanded ? null : col)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded statistics panel */}
                {isExpanded && (
                  (() => {
                    const stats = getStats(col);
                    return (
                      <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-2 text-[10px] text-gray-500 font-mono font-medium">
                        <div>Mean: <span className="text-gray-800 font-semibold">{stats.mean.toFixed(3)}</span></div>
                        <div>Std.Dev: <span className="text-gray-800 font-semibold">{stats.std.toFixed(3)}</span></div>
                        <div>Min: <span className="text-gray-800 font-semibold">{stats.min}</span></div>
                        <div>Max: <span className="text-gray-800 font-semibold">{stats.max}</span></div>
                      </div>
                    );
                  })()
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
