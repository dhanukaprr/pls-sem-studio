import React, { useState, useRef, useEffect } from 'react';
import { Construct, StructuralPath, PLSResults, ConstructType, IndicatorAlignment } from '../types';
import { Play, RotateCcw, Trash2, Link2, Plus, Move, Edit, Check, Settings, X, Download, ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';

interface ModelCanvasProps {
  constructs: Construct[];
  paths: StructuralPath[];
  datasetColumns: string[];
  results: PLSResults | null;
  onUpdateConstructs: (constructs: Construct[]) => void;
  onUpdatePaths: (paths: StructuralPath[]) => void;
  onRunPls: () => void;
  onRunBootstrapping: () => void;
  bootstrappingProgress: number | null;
  selectedConstructId: string | null;
  onSelectConstruct: (id: string | null) => void;
}

export default function ModelCanvas({
  constructs,
  paths,
  datasetColumns,
  results,
  onUpdateConstructs,
  onUpdatePaths,
  onRunPls,
  onRunBootstrapping,
  bootstrappingProgress,
  selectedConstructId,
  onSelectConstruct
}: ModelCanvasProps) {
  const [activeTool, setActiveTool] = useState<'select' | 'add' | 'connect' | 'delete'>('select');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [pathStartId, setPathStartId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isEditingNode, setIsEditingNode] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  // Pan and Zoom States
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const panHasMoved = useRef(false);

  // Form states for creating/editing constructs
  const [nodeName, setNodeName] = useState('');
  const [nodeType, setNodeType] = useState<ConstructType>('reflective');
  const [nodeAlign, setNodeAlign] = useState<IndicatorAlignment>('left');

  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRadius = 45;

  // Handle click on canvas background to add construct
  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    
    // Only handle if clicking directly on the background canvas to prevent bubbled clicks from nodes/paths
    if (e.target !== e.currentTarget) return;

    if (panHasMoved.current) {
      panHasMoved.current = false;
      return;
    }

    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left - panOffset.x) / zoom);
    const y = Math.round((e.clientY - rect.top - panOffset.y) / zoom);

    if (activeTool === 'add') {
      const newId = 'construct_' + Date.now();
      const numConstructs = constructs.length + 1;
      const newConstruct: Construct = {
        id: newId,
        name: `Latent Variable ${numConstructs}`,
        type: 'reflective',
        x,
        y,
        indicators: [],
        indicatorAlignment: 'left'
      };
      onUpdateConstructs([...constructs, newConstruct]);
      onSelectConstruct(newId);
      setNodeName(newConstruct.name);
      setNodeType('reflective');
      setNodeAlign('left');
      setIsEditingNode(true);
      setActiveTool('select');
    } else {
      // Clear selection if clicking empty canvas area
      onSelectConstruct(null);
      setPathStartId(null);
    }
  };

  // Handle panning on background mouse down
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    
    // Only handle if clicking directly on the background canvas to prevent bubbled clicks from nodes/paths
    if (e.target !== e.currentTarget) return;

    setIsPanning(true);
    panHasMoved.current = false;
    setPanStart({
      x: e.clientX - panOffset.x,
      y: e.clientY - panOffset.y
    });
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let nextZoom = zoom;
    if (e.deltaY < 0) {
      nextZoom = Math.min(3, zoom * zoomFactor);
    } else {
      nextZoom = Math.max(0.2, zoom / zoomFactor);
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setPanOffset(prev => ({
        x: mouseX - (mouseX - prev.x) * (nextZoom / zoom),
        y: mouseY - (mouseY - prev.y) * (nextZoom / zoom)
      }));
    }
    setZoom(nextZoom);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(3, prev * 1.2));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(0.2, prev / 1.2));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Node drag handlers
  const handleNodeMouseDown = (e: React.MouseEvent, node: Construct) => {
    e.stopPropagation();
    if (activeTool === 'select') {
      setDraggedNodeId(node.id);
      onSelectConstruct(node.id);
      setNodeName(node.name);
      setNodeType(node.type);
      setNodeAlign(node.indicatorAlignment);
      
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        const rawX = e.clientX - rect.left;
        const rawY = e.clientY - rect.top;
        const canvasX = (rawX - panOffset.x) / zoom;
        const canvasY = (rawY - panOffset.y) / zoom;
        setDragOffset({
          x: canvasX - node.x,
          y: canvasY - node.y
        });
      }
    } else if (activeTool === 'connect') {
      if (!pathStartId) {
        setPathStartId(node.id);
      } else if (pathStartId !== node.id) {
        // Create new path
        const alreadyExists = paths.some(p => p.from === pathStartId && p.to === node.id);
        const createsSelfLoop = pathStartId === node.id;
        
        if (!alreadyExists && !createsSelfLoop) {
          const newPath: StructuralPath = {
            id: `path_${Date.now()}`,
            from: pathStartId,
            to: node.id
          };
          onUpdatePaths([...paths, newPath]);
        }
        setPathStartId(null);
      }
    } else if (activeTool === 'delete') {
      // Delete construct and all associated paths
      onUpdateConstructs(constructs.filter(c => c.id !== node.id));
      onUpdatePaths(paths.filter(p => p.from !== node.id && p.to !== node.id));
      onSelectConstruct(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const canvasX = (rawX - panOffset.x) / zoom;
    const canvasY = (rawY - panOffset.y) / zoom;
    setMousePos({ x: canvasX, y: canvasY });

    if (draggedNodeId) {
      onUpdateConstructs(
        constructs.map(c => {
          if (c.id === draggedNodeId) {
            return {
              ...c,
              x: Math.round(canvasX - dragOffset.x),
              y: Math.round(canvasY - dragOffset.y)
            };
          }
          return c;
        })
      );
    } else if (isPanning) {
      const dx = Math.abs(e.clientX - (panStart.x + panOffset.x));
      const dy = Math.abs(e.clientY - (panStart.y + panOffset.y));
      if (dx > 3 || dy > 3) {
        panHasMoved.current = true;
      }
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setDraggedNodeId(null);
    setIsPanning(false);
  };

  // HTML5 Drop handler to assign indicators to constructs
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnConstruct = (e: React.DragEvent, constructId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData) return;

    const columnNames = dragData.split(',').map(s => s.trim()).filter(Boolean);
    if (columnNames.length === 0) return;

    onUpdateConstructs(
      constructs.map(c => {
        if (c.id === constructId) {
          // Add all indicators that are not already in this construct
          const nextIndicators = [...c.indicators];
          columnNames.forEach(col => {
            if (!nextIndicators.includes(col)) {
              nextIndicators.push(col);
            }
          });
          return {
            ...c,
            indicators: nextIndicators
          };
        } else {
          // Remove all dropped indicators from other constructs to maintain mutual exclusivity
          return {
            ...c,
            indicators: c.indicators.filter(ind => !columnNames.includes(ind))
          };
        }
      })
    );
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!svgRef.current) return;

    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData) return;

    const columnNames = dragData.split(',').map(s => s.trim()).filter(Boolean);
    if (columnNames.length === 0) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left - panOffset.x) / zoom);
    const y = Math.round((e.clientY - rect.top - panOffset.y) / zoom);

    const newId = 'construct_' + Date.now();
    const numConstructs = constructs.length + 1;
    const newConstruct: Construct = {
      id: newId,
      name: `Latent Variable ${numConstructs}`,
      type: 'reflective',
      x,
      y,
      indicators: columnNames,
      indicatorAlignment: 'left'
    };

    onUpdateConstructs([
      ...constructs.map(c => ({
        ...c,
        indicators: c.indicators.filter(ind => !columnNames.includes(ind))
      })),
      newConstruct
    ]);

    onSelectConstruct(newId);
    setNodeName(newConstruct.name);
    setNodeType('reflective');
    setNodeAlign('left');
    setIsEditingNode(true);
  };

  // Unassign indicator
  const handleRemoveIndicator = (constructId: string, indicatorName: string) => {
    onUpdateConstructs(
      constructs.map(c => {
        if (c.id === constructId) {
          return {
            ...c,
            indicators: c.indicators.filter(ind => ind !== indicatorName)
          };
        }
        return c;
      })
    );
  };

  // Delete path
  const handleDeletePath = (pathId: string) => {
    onUpdatePaths(paths.filter(p => p.id !== pathId));
  };

  // Save changes to selected construct in modal/sidebar
  const handleSaveConstructSettings = () => {
    if (!selectedConstructId) return;
    onUpdateConstructs(
      constructs.map(c => {
        if (c.id === selectedConstructId) {
          return {
            ...c,
            name: nodeName,
            type: nodeType,
            indicatorAlignment: nodeAlign
          };
        }
        return c;
      })
    );
    setIsEditingNode(false);
  };

  const handleExportSvg = () => {
    const svgEl = document.getElementById('pls-model-svg');
    if (!svgEl) return;

    // Clone the SVG element so we can safely strip dynamic/interactive classes
    const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement;
    
    // Set explicit size attributes if needed, or viewBox
    const bbox = svgRef.current?.getBoundingClientRect();
    const width = bbox?.width || 800;
    const height = bbox?.height || 600;
    
    clonedSvg.setAttribute('width', width.toString());
    clonedSvg.setAttribute('height', height.toString());
    clonedSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    // Add inline background color
    clonedSvg.style.backgroundColor = '#ffffff';

    // Remove unwanted interactive classes and UI controls (like the red indicator remover crosses)
    const elementsToRemove = clonedSvg.querySelectorAll('.cursor-pointer circle[fill="#ef4444"], .cursor-pointer line');
    elementsToRemove.forEach(el => el.remove());

    // Inject styles for standalone rendering (since Tailwind classes won't be available out of context)
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = `
      text { font-family: "Inter", system-ui, sans-serif; }
      .text-[10px] { font-size: 10px; }
      .text-[9px] { font-size: 9px; }
      .text-[8px] { font-size: 8px; }
      .text-[7px] { font-size: 7px; }
      .font-bold { font-weight: 700; }
      .font-semibold { font-weight: 600; }
      .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .fill-gray-900 { fill: #111827; }
      .fill-slate-500 { fill: #64748b; }
      .fill-indigo-600 { fill: #4f46e5; }
      .fill-white { fill: #ffffff; }
    `;
    clonedSvg.insertBefore(styleEl, clonedSvg.firstChild);

    // Serialize
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(clonedSvg);
    
    if (!svgString.startsWith('<?xml')) {
      svgString = '<?xml version="1.0" standalone="no"?>\r\n' + svgString;
    }

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PLS_SEM_Model_Diagram.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportDropdownOpen(false);
  };

  const handleExportPng = () => {
    const svgEl = document.getElementById('pls-model-svg');
    if (!svgEl) return;

    const bbox = svgRef.current?.getBoundingClientRect();
    const width = bbox?.width || 800;
    const height = bbox?.height || 600;

    const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement;
    clonedSvg.setAttribute('width', width.toString());
    clonedSvg.setAttribute('height', height.toString());
    clonedSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clonedSvg.style.backgroundColor = '#ffffff';

    // Remove unwanted interactive classes and UI controls (like the red indicator remover crosses)
    const elementsToRemove = clonedSvg.querySelectorAll('.cursor-pointer circle[fill="#ef4444"], .cursor-pointer line');
    elementsToRemove.forEach(el => el.remove());

    // Inject styles for standalone rendering (since Tailwind classes won't be available out of context)
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = `
      text { font-family: "Inter", system-ui, sans-serif; }
      .text-[10px] { font-size: 10px; }
      .text-[9px] { font-size: 9px; }
      .text-[8px] { font-size: 8px; }
      .text-[7px] { font-size: 7px; }
      .font-bold { font-weight: 700; }
      .font-semibold { font-weight: 600; }
      .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .fill-gray-900 { fill: #111827; }
      .fill-slate-500 { fill: #64748b; }
      .fill-indigo-600 { fill: #4f46e5; }
      .fill-white { fill: #ffffff; }
    `;
    clonedSvg.insertBefore(styleEl, clonedSvg.firstChild);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * 2; // 2x scale for crisp image
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        
        try {
          const pngUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `PLS_SEM_Model_Diagram.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (err) {
          console.error("Canvas export failed:", err);
          handleExportSvg(); // Fallback
        }
      }
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      handleExportSvg(); // Fallback
    };
    image.src = url;
    setIsExportDropdownOpen(false);
  };

  const selectedNode = constructs.find(c => c.id === selectedConstructId);

  // Ensure fields match when selected node changes
  useEffect(() => {
    if (selectedNode) {
      setNodeName(selectedNode.name);
      setNodeType(selectedNode.type);
      setNodeAlign(selectedNode.indicatorAlignment);
    }
  }, [selectedConstructId]);

  // Close export dropdown when clicking outside
  useEffect(() => {
    if (!isExportDropdownOpen) return;
    const handleOutsideClick = () => {
      setIsExportDropdownOpen(false);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [isExportDropdownOpen]);

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-xl overflow-hidden relative shadow-sm">
      {/* Top action toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg">
          <button
            id="tool-select"
            onClick={() => { setActiveTool('select'); setPathStartId(null); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTool === 'select'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Move className="w-3.5 h-3.5" /> Select
          </button>
          <button
            id="tool-add"
            onClick={() => { setActiveTool('add'); setPathStartId(null); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTool === 'add'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Add Latent
          </button>
          <button
            id="tool-connect"
            onClick={() => { setActiveTool('connect'); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTool === 'connect'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" /> Connect Path
          </button>
          <button
            id="tool-delete"
            onClick={() => { setActiveTool('delete'); setPathStartId(null); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTool === 'delete'
                ? 'bg-rose-50 text-rose-600 shadow-sm'
                : 'text-gray-500 hover:text-rose-600'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" /> Eraser
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selectedConstructId && (
            <button
              id="edit-selected-node"
              onClick={() => setIsEditingNode(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-850 rounded-lg text-xs font-medium transition shadow-sm"
            >
              <Settings className="w-3.5 h-3.5" /> Node Settings
            </button>
          )}

          <button
            id="run-pls-sem-btn"
            onClick={onRunPls}
            disabled={constructs.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium shadow-sm transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Run PLS-SEM
          </button>

          <button
            id="run-bootstrapping-btn"
            onClick={onRunBootstrapping}
            disabled={constructs.length === 0 || bootstrappingProgress !== null}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 rounded-lg text-xs font-medium shadow-sm transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Bootstrap Signif.
          </button>

          {/* Export Diagram Dropdown */}
          <div className="relative">
            <button
              id="export-diagram-btn"
              onClick={(e) => { e.stopPropagation(); setIsExportDropdownOpen(!isExportDropdownOpen); }}
              disabled={constructs.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 rounded-lg text-xs font-medium shadow-sm transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            {isExportDropdownOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1.5 z-30">
                <button
                  id="export-diagram-png-btn"
                  onClick={handleExportPng}
                  className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  Download PNG Image
                </button>
                <button
                  id="export-diagram-svg-btn"
                  onClick={handleExportSvg}
                  className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Download SVG Vector
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bootstrapping Progress Bar overlay */}
      {bootstrappingProgress !== null && (
        <div className="absolute top-14 left-0 right-0 z-10 bg-indigo-50 border-b border-indigo-100 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3 w-full max-w-lg">
            <span className="text-xs font-semibold text-indigo-800 shrink-0">Resampling Bootstrap:</span>
            <div className="w-full bg-indigo-200 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-600 h-full transition-all duration-100" 
                style={{ width: `${bootstrappingProgress}%` }}
              />
            </div>
            <span className="text-xs font-bold text-indigo-700 shrink-0">{bootstrappingProgress}%</span>
          </div>
          <span className="text-xs text-indigo-500 italic">Please wait while running bootstrap samples...</span>
        </div>
      )}

      {/* Interactive SVG Workspace */}
      <div className="flex-1 relative overflow-hidden select-none">
        {constructs.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
            <Plus className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-500">Workspace Empty</p>
            <p className="text-xs text-gray-400 max-w-xs mt-1">
              Select <strong>Add Latent</strong> to place constructs, then drag variables from the left dataset panel to assign them.
            </p>
          </div>
        )}

        <svg
          id="pls-sem-model-svg"
          ref={svgRef}
          className={`w-full h-full min-h-[500px] min-w-[800px] bg-white transition-colors duration-150 ${isPanning ? 'cursor-grabbing' : activeTool === 'select' ? 'cursor-grab' : 'cursor-crosshair'}`}
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onDragOver={handleDragOver}
          onDrop={handleCanvasDrop}
        >
          {/* Arrow markers definitions */}
          <defs>
            <marker id="arrow-standard" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#9ca3af" />
            </marker>
            <marker id="arrow-reflective" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1" />
            </marker>
            <marker id="arrow-formative" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
            </marker>
            <marker id="arrow-significant" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
            <marker id="arrow-nonsignificant" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
            </marker>
          </defs>

          {/* BACKGROUND GRID */}
          <pattern 
            id="grid" 
            width="20" 
            height="20" 
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}
          >
            <circle cx="2" cy="2" r="1.2" fill="#e5e7eb" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" className="pointer-events-none" />

          {/* TRANSFORMATION GROUP FOR PAN & ZOOM */}
          <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>

          {/* DYNAMIC PATH DRAWING (Rubber band) */}
          {activeTool === 'connect' && pathStartId && (
            (() => {
              const startNode = constructs.find(c => c.id === pathStartId);
              if (startNode) {
                return (
                  <line
                    x1={startNode.x}
                    y1={startNode.y}
                    x2={mousePos.x}
                    y2={mousePos.y}
                    stroke="#3b82f6"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    markerEnd="url(#arrow-reflective)"
                  />
                );
              }
              return null;
            })()
          )}

          {/* STRUCTURAL PATHS */}
          {paths.map(path => {
            const source = constructs.find(c => c.id === path.from);
            const target = constructs.find(c => c.id === path.to);
            if (!source || !target) return null;

            // Compute line start/end at node boundaries
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist <= nodeRadius * 2) return null;

            const xStart = source.x + (nodeRadius * dx) / dist;
            const yStart = source.y + (nodeRadius * dy) / dist;
            const xEnd = target.x - ((nodeRadius + 6) * dx) / dist; // offset slightly for arrow marker
            const yEnd = target.y - ((nodeRadius + 6) * dy) / dist;

            const pathRes = results?.pathCoefficients.find(p => p.from === path.from && p.to === path.to);
            const isSignificant = pathRes && pathRes.pValue !== undefined ? pathRes.pValue < 0.05 : null;

            // Arrow marker styles based on results
            let marker = 'url(#arrow-standard)';
            let strokeColor = '#94a3b8';
            let strokeWidth = '2';
            let strokeDash = undefined;

            if (results) {
              if (isSignificant === true) {
                marker = 'url(#arrow-significant)';
                strokeColor = '#10b981'; // emerald
                strokeWidth = '3';
              } else if (isSignificant === false) {
                marker = 'url(#arrow-nonsignificant)';
                strokeColor = '#f43f5e'; // rose red
                strokeWidth = '1.5';
                strokeDash = '4,4';
              } else {
                marker = 'url(#arrow-reflective)';
                strokeColor = '#3b82f6';
                strokeWidth = '2.5';
              }
            }

            const midX = (xStart + xEnd) / 2;
            const midY = (yStart + yEnd) / 2;

            return (
              <g key={path.id} className="group">
                {/* Invisible thicker line for easier clicking */}
                <line
                  x1={xStart}
                  y1={yStart}
                  x2={xEnd}
                  y2={yEnd}
                  stroke="transparent"
                  strokeWidth="12"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeTool === 'delete') {
                      handleDeletePath(path.id);
                    }
                  }}
                />
                
                {/* Actual path line */}
                <line
                  x1={xStart}
                  y1={yStart}
                  x2={xEnd}
                  y2={yEnd}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDash}
                  markerEnd={marker}
                  className="transition-all duration-300"
                />

                {/* Path Delete Button on Hover */}
                {activeTool === 'delete' && (
                  <circle
                    cx={midX}
                    cy={midY}
                    r="9"
                    fill="#ef4444"
                    className="cursor-pointer opacity-80 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePath(path.id);
                    }}
                  >
                    <title>Delete Path</title>
                  </circle>
                )}

                {/* Path results overlay */}
                {pathRes && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    {/* Background Pill */}
                    <rect
                      x="-38"
                      y="-11"
                      width="76"
                      height="22"
                      rx="4"
                      fill="white"
                      stroke={strokeColor}
                      strokeWidth="1"
                      className="shadow-sm filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.05)]"
                    />
                    <text
                      textAnchor="middle"
                      y="4"
                      className="text-[10px] font-bold"
                      fill={isSignificant === true ? '#047857' : isSignificant === false ? '#be123c' : '#1e293b'}
                    >
                      {pathRes.coefficient.toFixed(3)}
                      {pathRes.tValue !== undefined && ` (${pathRes.tValue >= 1.96 ? '*' : ''})`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* MEASUREMENT PATHS & INDICATORS FOR EACH CONSTRUCT */}
          {constructs.map(construct => {
            const K = construct.indicators.length;
            if (K === 0) return null;

            const alignment = construct.indicatorAlignment;
            const indWidth = 75;
            const indHeight = 22;
            const spacing = 6;
            const totalLength = K * indHeight + (K - 1) * spacing;
            const startOffset = -totalLength / 2;

            return (
              <g key={`indicators-${construct.id}`}>
                {construct.indicators.map((ind, idx) => {
                  let ix = 0;
                  let iy = 0;
                  let lineStartX = 0;
                  let lineStartY = 0;
                  let lineEndX = 0;
                  let lineEndY = 0;

                  // Determine position of indicator box relative to construct center
                  if (alignment === 'left') {
                    ix = construct.x - nodeRadius - 35 - indWidth;
                    iy = construct.y + startOffset + idx * (indHeight + spacing);
                    
                    lineStartX = construct.x - nodeRadius;
                    lineStartY = iy + indHeight / 2;
                    lineEndX = ix + indWidth;
                    lineEndY = iy + indHeight / 2;
                  } else if (alignment === 'right') {
                    ix = construct.x + nodeRadius + 35;
                    iy = construct.y + startOffset + idx * (indHeight + spacing);
                    
                    lineStartX = construct.x + nodeRadius;
                    lineStartY = iy + indHeight / 2;
                    lineEndX = ix;
                    lineEndY = iy + indHeight / 2;
                  } else if (alignment === 'top') {
                    const horizLength = K * indWidth + (K - 1) * spacing;
                    const hStart = -horizLength / 2;
                    ix = construct.x + hStart + idx * (indWidth + spacing);
                    iy = construct.y - nodeRadius - 35 - indHeight;
                    
                    lineStartX = ix + indWidth / 2;
                    lineStartY = construct.y - nodeRadius;
                    lineEndX = ix + indWidth / 2;
                    lineEndY = iy + indHeight;
                  } else { // bottom
                    const horizLength = K * indWidth + (K - 1) * spacing;
                    const hStart = -horizLength / 2;
                    ix = construct.x + hStart + idx * (indWidth + spacing);
                    iy = construct.y + nodeRadius + 35;
                    
                    lineStartX = ix + indWidth / 2;
                    lineStartY = construct.y + nodeRadius;
                    lineEndX = ix + indWidth / 2;
                    lineEndY = iy;
                  }

                  // Retrieve statistical loading/weight
                  const indRes = results?.indicatorResults.find(
                    r => r.constructId === construct.id && r.indicator === ind
                  );

                  // Setup indicators paths arrows based on measurement type
                  let markerEnd = undefined;
                  let markerStart = undefined;
                  let indicatorLineColor = '#94a3b8';

                  if (construct.type === 'reflective') {
                    // Circle -> Indicator (Reflective)
                    markerEnd = 'url(#arrow-reflective)';
                    indicatorLineColor = '#3b82f6';
                  } else {
                    // Indicator -> Circle (Formative)
                    markerEnd = 'url(#arrow-formative)';
                    indicatorLineColor = '#f59e0b';
                  }

                  return (
                    <g key={`ind-${construct.id}-${ind}`} className="group/ind">
                      {/* Measurement Line */}
                      <line
                        x1={lineStartX}
                        y1={lineStartY}
                        x2={lineEndX}
                        y2={lineEndY}
                        stroke={indicatorLineColor}
                        strokeWidth="1.2"
                        markerEnd={markerEnd}
                        className="transition-colors duration-200"
                      />

                      {/* Indicator Rect */}
                      <rect
                        x={ix}
                        y={iy}
                        width={indWidth}
                        height={indHeight}
                        rx="3"
                        fill="#f8fafc"
                        stroke="#cbd5e1"
                        strokeWidth="1"
                        className="filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.02)] transition group-hover/ind:stroke-slate-400"
                      />

                      {/* Indicator text */}
                      <text
                        x={ix + indWidth / 2}
                        y={iy + 14}
                        textAnchor="middle"
                        className="text-[9px] font-semibold text-slate-700"
                      >
                        {ind}
                      </text>

                      {/* Floating loading/weight value if calculated */}
                      {indRes && (
                        (() => {
                          const val = construct.type === 'reflective' ? indRes.loading : indRes.weight;
                          let textX = (lineStartX + lineEndX) / 2;
                          let textY = (lineStartY + lineEndY) / 2 - 4;
                          
                          // Adjust text slightly based on orientation to not overlap lines
                          if (alignment === 'left' || alignment === 'right') {
                            textY = iy + indHeight / 2 - 5;
                          } else {
                            textX = ix + indWidth / 2 + 16;
                            textY = (lineStartY + lineEndY) / 2 + 4;
                          }

                          return (
                            <text
                              x={textX}
                              y={textY}
                              textAnchor="middle"
                              className="text-[8px] font-bold fill-slate-500"
                            >
                              {val.toFixed(2)}
                            </text>
                          );
                        })()
                      )}

                      {/* Small hover remove indicator overlay button */}
                      <g 
                        transform={`translate(${ix + indWidth}, ${iy})`}
                        className="cursor-pointer opacity-0 group-hover/ind:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveIndicator(construct.id, ind);
                        }}
                      >
                        <circle cx="0" cy="0" r="5.5" fill="#ef4444" />
                        <line x1="-2.5" y1="-2.5" x2="2.5" y2="2.5" stroke="white" strokeWidth="1" />
                        <line x1="2.5" y1="-2.5" x2="-2.5" y2="2.5" stroke="white" strokeWidth="1" />
                      </g>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* CONSTRUCT CIRCLES */}
          {constructs.map(node => {
            const isSelected = node.id === selectedConstructId;
            const isHovered = node.id === hoveredNodeId;
            const r2 = results?.rSquare[node.id];
            
            // Outer circle border color
            let strokeColor = '#9ca3af';
            let strokeWidth = '1.5';
            if (isSelected) {
              strokeColor = '#4f46e5'; // Indigo-600 for selection
              strokeWidth = '2.5';
            } else if (isHovered) {
              strokeColor = '#6366f1'; // Indigo-500
            }

            // Clean background fill selection based on type and endogeneity
            let nodeFill = '#ffffff';
            if (r2 !== undefined) {
              nodeFill = '#eff6ff'; // Endogenous soft blue/indigo tint
            } else if (node.type === 'formative') {
              nodeFill = '#fffbeb'; // Warm formative yellow tint
            } else {
              nodeFill = '#f8fafc'; // Crisp reflective slate tint
            }

            return (
              <g
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnConstruct(e, node.id)}
                className="group cursor-grab active:cursor-grabbing"
              >
                {/* Glowing drop shadow filter when drag hovering indicator */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeRadius + 4}
                  fill="transparent"
                  stroke={activeTool === 'connect' && pathStartId === node.id ? '#10b981' : 'transparent'}
                  strokeWidth="2"
                  strokeDasharray="4,4"
                  className="transition-all duration-200"
                />

                {/* Primary Construct Node */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeRadius}
                  fill={nodeFill}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  className="transition-colors duration-200 shadow-sm"
                />

                {/* Construct Name */}
                <text
                  x={node.x}
                  y={r2 !== undefined ? node.y - 4 : node.y + 4}
                  textAnchor="middle"
                  className="text-[10px] font-bold fill-gray-900 select-none"
                >
                  {node.name.length > 14 ? `${node.name.substring(0, 12)}...` : node.name}
                  <title>{node.name}</title>
                </text>

                {/* R-squared inner indicator if endogenous */}
                {r2 !== undefined && (
                  <text
                    x={node.x}
                    y={node.y + 11}
                    textAnchor="middle"
                    className="text-[9px] font-bold fill-indigo-600 font-mono"
                  >
                    R² = {r2.toFixed(3)}
                  </text>
                )}

                {/* Construct type badge icon (R vs F) */}
                <g transform={`translate(${node.x - nodeRadius + 4}, ${node.y - nodeRadius + 4})`}>
                  <rect width="10" height="10" rx="2" fill={node.type === 'formative' ? '#f59e0b' : '#6366f1'} />
                  <text x="5" y="8" textAnchor="middle" className="text-[7px] font-bold fill-white">
                    {node.type === 'formative' ? 'F' : 'R'}
                  </text>
                </g>
              </g>
            );
          })}
          </g>
        </svg>

        {/* Floating Zoom and Pan Controls */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5 bg-white border border-gray-200 p-1.5 rounded-lg shadow-md select-none">
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4.5 h-4.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4.5 h-4.5" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="px-1 py-0.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-750 text-[10px] font-extrabold tracking-tight transition cursor-pointer border border-gray-200"
            title="Reset Zoom & Pan"
          >
            {Math.round(zoom * 100)}%
          </button>
        </div>
      </div>

      {/* QUICK INLINE SETTINGS DRAWER OVERLAY */}
      {isEditingNode && selectedNode && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl border border-slate-200 p-5 z-20 w-[340px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <Settings className="w-3.5 h-3.5 text-blue-500" /> Latent Variable Editor
            </h4>
            <button
              onClick={() => setIsEditingNode(false)}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-md transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Construct Name</label>
              <input
                id="edit-node-name"
                type="text"
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Measure Model</label>
                <select
                  id="edit-node-type"
                  value={nodeType}
                  onChange={(e) => setNodeType(e.target.value as ConstructType)}
                  className="w-full text-xs px-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="reflective">Reflective (Mode A)</option>
                  <option value="formative">Formative (Mode B)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Align Indicators</label>
                <select
                  id="edit-node-align"
                  value={nodeAlign}
                  onChange={(e) => setNodeAlign(e.target.value as IndicatorAlignment)}
                  className="w-full text-xs px-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Indicators ({selectedNode.indicators.length})</span>
              {selectedNode.indicators.length === 0 ? (
                <span className="text-[10px] text-slate-400 italic">No indicators assigned. Drag & drop from dataset panel.</span>
              ) : (
                <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto">
                  {selectedNode.indicators.map(ind => (
                    <span 
                      key={ind} 
                      className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-2 py-1 rounded text-[9px] font-semibold"
                    >
                      {ind}
                      <button 
                        onClick={() => handleRemoveIndicator(selectedNode.id, ind)}
                        className="text-slate-400 hover:text-red-500 ml-0.5"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              id="save-node-settings"
              onClick={handleSaveConstructSettings}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> Apply Structural Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
