/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { SpinnerData, CandidateState } from '../types';
import { StatsChart } from './StatsChart';
import { generateExportPack } from '../utils/exportService';
import Editor from '@monaco-editor/react';

// --- Helper Functions ---

export const parsePartialJson = (jsonStr: string) => {
    const result = { mutationName: "", reasoning: "", p5Code: "" };
    
    // Helper to extract value safely
    const extract = (key: string) => {
        // 1. Strict Match: Try to find key and value with a closing quote (completed field)
        // We use [^"]* to ensure we stop at the first closing quote
        const strictRegex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
        const strictMatch = jsonStr.match(strictRegex);
        if (strictMatch) return strictMatch[1];

        // 2. Loose Match: If not found, try to find key and take everything until end of string (streaming field)
        // This only matches if the string ENDS inside the value (no closing quote found)
        const looseRegex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)$`);
        const looseMatch = jsonStr.match(looseRegex);
        if (looseMatch) return looseMatch[1];
        
        return "";
    };

    result.mutationName = extract("mutationName");
    result.reasoning = extract("reasoning");
    
    // p5Code extraction
    let codeRaw = extract("p5Code");
    if (codeRaw) {
        result.p5Code = codeRaw
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .replace(/\\t/g, '  ');
    }

    return result;
};

// --- Sub-Component: TerminalPanel ---

interface TerminalPanelProps {
    data: SpinnerData | null;
    streamBuffer: string;
    isGenerating: boolean;
    tpsHistory: number[];
    generationStartTime: number;
    label: string;
    labelColorClass: string;
    showControls?: boolean;
    overlayPosition?: string;
    className?: string;
    allowInteraction?: boolean;
    onDownloadGif?: () => void;
    onDownloadSvg?: () => void;
    onDownloadReact?: () => void;
    onDownloadCss?: () => void;
    onDownloadLottie?: () => void;
    onCodeEdit?: (newCode: string) => void;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({
    data,
    streamBuffer,
    isGenerating,
    tpsHistory,
    generationStartTime,
    label,
    labelColorClass,
    showControls,
    overlayPosition = "inset-x-0",
    className = "",
    allowInteraction = true,
    onDownloadGif,
    onDownloadSvg,
    onDownloadReact,
    onDownloadCss,
    onDownloadLottie,
    onCodeEdit
}) => {
    const [liveElapsed, setLiveElapsed] = useState(0);
    const [isCodeOpen, setIsCodeOpen] = useState(false);
    const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const codeScrollRef = useRef<HTMLPreElement>(null);
    const lastValidCodeRef = useRef<string>("");

    const handleExport = async (platform: 'windows' | 'linux' | 'chrome', e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExportDropdownOpen(false);
        const code = data?.p5Code;
        if (!code) return;
        setIsExporting(true);
        try {
            const filename = (data?.mutationName || 'spinner').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
            await generateExportPack({ code, platform, filename });
        } catch (error) {
            console.error("Export failed:", error);
            alert("Export failed. See console for details.");
        } finally {
            setIsExporting(false);
        }
    };

    // Live timer & Auto-Open/Collapse Logic
    useEffect(() => {
        let interval: any;
        if (isGenerating) {
            setIsCodeOpen(true); // Automatically expand to show streaming
            interval = setInterval(() => {
                setLiveElapsed(performance.now() - generationStartTime);
            }, 50);
        } else {
            setIsCodeOpen(false); // Automatically collapse when done
            setLiveElapsed(0);
        }
        return () => clearInterval(interval);
    }, [isGenerating, generationStartTime]);

    // Reset last valid code when starting a new generation
    useEffect(() => {
        if (isGenerating && streamBuffer.length < 10) {
            lastValidCodeRef.current = "";
        }
    }, [generationStartTime, isGenerating, streamBuffer]);

    // Derived Display Data
    const displayData = useMemo(() => {
        if (isGenerating && streamBuffer) {
            return parsePartialJson(streamBuffer);
        }
        return data || { mutationName: "", reasoning: "", p5Code: "" };
    }, [isGenerating, streamBuffer, data]);

    // Cache valid code to prevent flashing when the parser returns empty during a tricky chunk
    if (displayData.p5Code) {
        lastValidCodeRef.current = displayData.p5Code;
    }
    const codeToDisplay = displayData.p5Code || lastValidCodeRef.current;

    // Auto-scroll logic
    useEffect(() => {
        if (isCodeOpen && codeScrollRef.current) {
            codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
        }
    }, [codeToDisplay, isCodeOpen]);

    const liveAvgTps = isGenerating && liveElapsed > 0 
        ? ((streamBuffer.length / 4) / (liveElapsed / 1000)).toFixed(1)
        : "0.0";
    
    const totalTokens = isGenerating 
        ? Math.round(streamBuffer.length / 4) 
        : (data?.totalTokens || 0);
        
    const timeValue = isGenerating 
        ? (liveElapsed / 1000).toFixed(1)
        : (data?.generationTimeMs ? (data.generationTimeMs / 1000).toFixed(1) : "0.0");

    const tpsValue = isGenerating ? liveAvgTps : data?.tokensPerSecond || 0;

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        const code = data?.p5Code;
        if (!code) return;
    
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        const safeName = (data?.mutationName || 'spinner').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
        link.download = `spinner_${data?.id || 'gen'}_${safeName}.js`;
        link.href = url;
        
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const ExportControls = () => (
        <div className="flex items-center gap-1 md:gap-2 relative">
            <button 
                onClick={handleDownload}
                disabled={!allowInteraction || isExporting}
                tabIndex={allowInteraction ? 0 : -1}
                className="flex items-center gap-1 px-2 py-0.5 md:py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-white transition-all text-[9px] uppercase tracking-wider font-medium border border-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                title="Download Source Code"
            >
                <span>JS</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    const code = data?.p5Code;
                    if (code) {
                        navigator.clipboard.writeText(code);
                        alert("Code copied to clipboard!");
                    }
                }}
                disabled={!allowInteraction}
                tabIndex={allowInteraction ? 0 : -1}
                className="flex items-center gap-1 px-2 py-0.5 md:py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-white transition-all text-[9px] uppercase tracking-wider font-medium border border-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                title="Copy Code"
            >
                <span>COPY</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    if (onDownloadGif) onDownloadGif();
                }}
                disabled={!allowInteraction || !onDownloadGif}
                tabIndex={allowInteraction && onDownloadGif ? 0 : -1}
                className="flex items-center gap-1 px-2 py-0.5 md:py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-white transition-all text-[9px] uppercase tracking-wider font-medium border border-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                title="Download GIF (4s loop)"
            >
                <span>GIF</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            </button>
            
            <button onClick={(e) => handleExport('windows', e)} disabled={!allowInteraction || isExporting} className="hidden sm:flex items-center px-2 py-0.5 md:py-1 text-[9px] uppercase font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-white border border-neutral-800 rounded transition-all active:scale-95 disabled:opacity-50">.ANI</button>
            <button onClick={(e) => handleExport('linux', e)} disabled={!allowInteraction || isExporting} className="hidden sm:flex items-center px-2 py-0.5 md:py-1 text-[9px] uppercase font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-white border border-neutral-800 rounded transition-all active:scale-95 disabled:opacity-50">PLYMOUTH</button>
            <button onClick={(e) => handleExport('chrome', e)} disabled={!allowInteraction || isExporting} className="hidden sm:flex items-center px-2 py-0.5 md:py-1 text-[9px] uppercase font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-white border border-neutral-800 rounded transition-all active:scale-95 disabled:opacity-50">CHROME</button>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    if (onDownloadReact) onDownloadReact();
                }} 
                disabled={!allowInteraction || isExporting || !onDownloadReact} 
                className="hidden sm:flex items-center gap-1 px-2 py-0.5 md:py-1 text-[9px] uppercase font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 rounded transition-all active:scale-95 disabled:opacity-50"
            >
                REACT
            </button>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    if (onDownloadCss) onDownloadCss();
                }} 
                disabled={!allowInteraction || isExporting || !onDownloadCss} 
                className="hidden sm:flex items-center gap-1 px-2 py-0.5 md:py-1 text-[9px] uppercase font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 rounded transition-all active:scale-95 disabled:opacity-50"
            >
                CSS
            </button>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    if (onDownloadLottie) onDownloadLottie();
                }} 
                disabled={!allowInteraction || isExporting || !onDownloadLottie} 
                className="hidden sm:flex items-center gap-1 px-2 py-0.5 md:py-1 text-[9px] uppercase font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 rounded transition-all active:scale-95 disabled:opacity-50"
            >
                LOTTIE
            </button>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    if (onDownloadSvg) onDownloadSvg();
                }} 
                disabled={!allowInteraction || isExporting || !onDownloadSvg} 
                className="hidden sm:flex items-center gap-1 px-2 py-0.5 md:py-1 text-[9px] uppercase font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 rounded transition-all active:scale-95 disabled:opacity-50"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                SVG
            </button>

            {/* Mobile only fallback dropdown */}
            <div className="relative sm:hidden">
                <button
                    onClick={(e) => { e.stopPropagation(); setIsExportDropdownOpen(!isExportDropdownOpen); }}
                    disabled={!allowInteraction || isExporting}
                    tabIndex={allowInteraction ? 0 : -1}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-white transition-all text-[9px] uppercase tracking-wider font-medium border border-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                    <span>{isExporting ? '...' : 'EXPORTS'}</span>
                </button>
                {isExportDropdownOpen && (
                    <div className="absolute bottom-full mb-1 right-0 w-32 bg-neutral-900 border border-neutral-700 rounded shadow-2xl z-[100] flex flex-col items-stretch overflow-hidden">
                        <button onClick={(e) => handleExport('windows', e)} className="px-3 py-2 text-left text-[10px] text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase transition-colors">Windows</button>
                        <button onClick={(e) => handleExport('linux', e)} className="px-3 py-2 text-left text-[10px] text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase transition-colors border-t border-neutral-800">Linux</button>
                        <button onClick={(e) => handleExport('chrome', e)} className="px-3 py-2 text-left text-[10px] text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase transition-colors border-t border-neutral-800">Chrome</button>
                        <button onClick={(e) => { e.stopPropagation(); setIsExportDropdownOpen(false); if (onDownloadReact) onDownloadReact(); }} className="px-3 py-2 text-left text-[10px] text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase transition-colors border-t border-neutral-800">React</button>
                        <button onClick={(e) => { e.stopPropagation(); setIsExportDropdownOpen(false); if (onDownloadCss) onDownloadCss(); }} className="px-3 py-2 text-left text-[10px] text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase transition-colors border-t border-neutral-800">CSS</button>
                        <button onClick={(e) => { e.stopPropagation(); setIsExportDropdownOpen(false); if (onDownloadLottie) onDownloadLottie(); }} className="px-3 py-2 text-left text-[10px] text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase transition-colors border-t border-neutral-800">Lottie</button>
                        <button onClick={(e) => { e.stopPropagation(); setIsExportDropdownOpen(false); if (onDownloadGif) onDownloadGif(); }} className="px-3 py-2 text-left text-[10px] text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase transition-colors border-t border-neutral-800">GIF</button>
                        <button onClick={(e) => { e.stopPropagation(); setIsExportDropdownOpen(false); if (onDownloadSvg) onDownloadSvg(); }} className="px-3 py-2 text-left text-[10px] text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase transition-colors border-t border-neutral-800">SVG</button>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className={`flex-1 flex flex-col justify-end min-w-0 bg-[#0a0a0a] border-r border-neutral-900/50 last:border-r-0 relative group overflow-hidden ${className}`}>
            
            {/* 
                CODE OVERLAY (Fixed Position to break out of containers) 
                Sits behind metrics (z-30) but covers spinner.
            */}
            <div 
                className={`fixed ${overlayPosition} top-14 bottom-0 bg-[#050505]/95 backdrop-blur-md z-30 transition-transform duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] flex flex-col pt-0 pb-56 md:pb-80 px-0 border-b border-neutral-800
                ${isCodeOpen ? 'translate-y-0 shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'translate-y-[calc(100%+20px)]'}`}
            >
                 {/* NEW HEADER in Overlay (Acts as Collapse Trigger) */}
                 <div 
                    onClick={() => setIsCodeOpen(false)}
                    className="flex-none h-10 flex items-center justify-between px-3 md:px-6 border-b border-neutral-800 cursor-pointer select-none bg-neutral-900/40 hover:bg-neutral-900 transition-colors group/header"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-500 rotate-180 transition-colors group-hover/header:text-neutral-400">
                            ▲
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 group-hover/header:text-neutral-200 transition-colors">
                            Collapse Code Stream
                        </span>
                        {isGenerating && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse ml-2" />}
                    </div>

                    <div className="flex items-center gap-4">
                        {codeToDisplay && <span className="text-[10px] font-mono text-neutral-600 hidden sm:inline">{codeToDisplay.length} bytes</span>}
                        {showControls && data?.p5Code && (
                            <ExportControls />
                        )}
                    </div>
                 </div>

                 <div className="flex-1 w-full bg-[#0a0a0a] relative">
                     <Editor
                         height="100%"
                         language="javascript"
                         theme="vs-dark"
                         value={codeToDisplay || "// Spinner code generating..."}
                         options={{
                             minimap: { enabled: false },
                             fontSize: 12,
                             wordWrap: 'on',
                             scrollBeyondLastLine: false,
                             readOnly: isGenerating,
                             padding: { top: 16, bottom: 16 },
                             fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                         }}
                         onChange={(value) => {
                             if (value && onCodeEdit && !isGenerating) {
                                 onCodeEdit(value);
                             }
                         }}
                     />
                 </div>
            </div>

            {/* 
                BOTTOM CONTROL GROUP (Z-40 to stay above the code overlay)
            */}
            <div className="relative z-40 bg-black shadow-[0_-10px_40px_rgba(0,0,0,0.8)] border-t border-neutral-900 flex flex-col max-h-full">
                
                {/* TRIGGER BAR (EXPAND) */}
                <div 
                    onClick={() => setIsCodeOpen(true)}
                    className={`flex-none h-8 flex items-center justify-between px-3 md:px-6 bg-neutral-900/40 hover:bg-neutral-900 border-b border-neutral-900 cursor-pointer select-none transition-all duration-300 group/trigger
                    ${isCodeOpen ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'}`}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-500 transition-transform duration-300">
                            ▲
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 group-hover/trigger:text-neutral-400 transition-colors">
                            Expand Code Stream
                        </span>
                    </div>

                    {showControls && data?.p5Code && (
                        <ExportControls />
                    )}
                </div>

                {/* INFO & DESCRIPTION */}
                <div className="flex-shrink min-h-0 overflow-y-auto px-4 md:px-6 pt-3 pb-2 transition-all duration-500 bg-black custom-scrollbar max-h-32 md:max-h-40">
                     <div className="flex items-center gap-2 md:gap-3 mb-1">
                        <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest px-1.5 py-px rounded bg-neutral-900 border border-neutral-800 ${labelColorClass}`}>
                            {label}
                        </span>
                        <h2 className="text-sm md:text-base font-bold text-neutral-200 tracking-tight leading-none truncate">
                            {displayData.mutationName || "..."}
                        </h2>
                    </div>
                    <p className="text-[9px] md:text-[10px] text-neutral-500 leading-relaxed font-medium max-w-3xl">
                        {displayData.reasoning || "..."}
                    </p>
                </div>

                {/* METRICS ROW */}
                <div className="flex-none grid grid-cols-3 divide-x divide-neutral-900 border-y border-neutral-900 mt-2 bg-black">
                    <div className="p-2 md:p-4 flex flex-col justify-end items-end text-right">
                        <span className="text-[8px] md:text-[9px] text-neutral-600 uppercase tracking-[0.2em] mb-1">Time</span>
                        <div className="flex items-baseline gap-1 justify-end w-full">
                            <span className="text-lg sm:text-2xl md:text-4xl xl:text-5xl font-light text-white font-mono tracking-tighter">
                                {timeValue}
                            </span>
                            <span className="text-[10px] md:text-xs text-neutral-600 font-mono">s</span>
                        </div>
                    </div>
                    <div className="p-2 md:p-4 flex flex-col justify-end items-end text-right">
                        <span className="text-[8px] md:text-[9px] text-neutral-600 uppercase tracking-[0.2em] mb-1">Speed</span>
                        <div className="flex items-baseline gap-1 justify-end w-full">
                            <span className={`text-lg sm:text-2xl md:text-4xl xl:text-5xl font-light font-mono tracking-tighter ${isGenerating ? 'text-blue-400 animate-pulse' : 'text-white'}`}>
                                {tpsValue}
                            </span>
                            <span className="text-[10px] md:text-xs text-neutral-600 font-mono">tps</span>
                        </div>
                    </div>
                    <div className="p-2 md:p-4 flex flex-col justify-end items-end text-right relative group">
                        <span className="text-[8px] md:text-[9px] text-neutral-600 uppercase tracking-[0.2em] mb-1">Tokens</span>
                        <div className="flex flex-col items-end w-full">
                            <div className="flex items-baseline gap-1 justify-end w-full">
                                <span className="text-lg sm:text-2xl md:text-4xl xl:text-5xl font-light text-white font-mono tracking-tighter">
                                    {totalTokens}
                                </span>
                            </div>
                            {!isGenerating && data?.generationTimeMs && data?.totalTokens ? (
                                <span className="text-[8px] sm:text-[9px] text-neutral-500 font-mono tracking-widest mt-1">
                                    Avg {(data.generationTimeMs / data.totalTokens).toFixed(2)} ms/tok
                                </span>
                            ) : null}
                        </div>
                        
                        {/* Hidden detailed breakdown visible on hover */}
                        {!isGenerating && data?.generationTimeMs && (
                            <div className="absolute top-0 right-0 -translate-y-full mb-2 bg-neutral-900 border border-neutral-700 text-neutral-400 text-left p-3 rounded shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity w-48 z-50">
                                <h4 className="text-[9px] font-bold text-white uppercase tracking-widest border-b border-neutral-700 pb-1 mb-2">Generation Stats</h4>
                                <div className="space-y-1 text-[10px] font-mono">
                                    <div className="flex justify-between"><span>Compute Total:</span><span className="text-white">{(data.generationTimeMs / 1000).toFixed(2)}s</span></div>
                                    <div className="flex justify-between"><span>Avg Token Latency:</span><span className="text-white">{(data.generationTimeMs / data.totalTokens).toFixed(2)}ms</span></div>
                                    <div className="flex justify-between"><span>Cost/Param (est):</span><span className="text-white">~0.0002¢</span></div>
                                    <div className="flex justify-between"><span>GPU Frame Time:</span><span className="text-white">16.6ms</span></div>
                                    <div className="flex justify-between"><span>GPU Memory:</span><span className="text-white">{(performance as any)?.memory ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) : 'N/A'} MB</span></div>
                                    <div className="flex justify-between"><span>Model:</span><span className="text-white">gemini-3.1-pro</span></div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* CHART */}
                <div className="flex-none h-20 md:h-28 w-full bg-neutral-900/10 relative bg-black">
                     <StatsChart data={tpsHistory} label="" isLive={isGenerating} />
                </div>
            </div>
        </div>
    );
};

// --- Main Container ---

interface TerminalProps {
  currentData: SpinnerData | null;
  candidates: { a: CandidateState; b: CandidateState } | null;
  
  isGenerating: boolean;
  generationStartTime: number;
  history: SpinnerData[];
  currentIndex: number;
  
  isSelectionMode: boolean;
  mobileTab?: 'a' | 'b'; 
  allowInteraction?: boolean;
  onDownloadGifMain?: () => void;
  onDownloadGifA?: () => void;
  onDownloadGifB?: () => void;
  onDownloadSvgMain?: () => void;
  onDownloadSvgA?: () => void;
  onDownloadSvgB?: () => void;
  onDownloadReactMain?: () => void;
  onDownloadReactA?: () => void;
  onDownloadReactB?: () => void;
  onDownloadCssMain?: () => void;
  onDownloadCssA?: () => void;
  onDownloadCssB?: () => void;
  onDownloadLottieMain?: () => void;
  onDownloadLottieA?: () => void;
  onDownloadLottieB?: () => void;
  onCodeEditMain?: (newCode: string) => void;
  onCodeEditA?: (newCode: string) => void;
  onCodeEditB?: (newCode: string) => void;
}

export const Terminal: React.FC<TerminalProps> = ({ 
    currentData,
    candidates,
    isGenerating,
    generationStartTime,
    history,
    currentIndex,
    isSelectionMode,
    mobileTab = 'a',
    allowInteraction = true,
    onDownloadGifMain,
    onDownloadGifA,
    onDownloadGifB,
    onDownloadSvgMain,
    onDownloadSvgA,
    onDownloadSvgB,
    onDownloadReactMain,
    onDownloadReactA,
    onDownloadReactB,
    onDownloadCssMain,
    onDownloadCssA,
    onDownloadCssB,
    onDownloadLottieMain,
    onDownloadLottieA,
    onDownloadLottieB,
    onCodeEditMain,
    onCodeEditA,
    onCodeEditB
}) => {
  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] font-mono text-sm border-t border-neutral-800">
        <style>{`
            .custom-scrollbar::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
                background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
                background: #262626;
                border-radius: 3px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: #404040;
            }
        `}</style>

        {/* --- CONTENT AREA (SPLIT OR SINGLE) --- */}
        <div className="flex-1 flex flex-row overflow-hidden">
            {isSelectionMode && candidates ? (
                <>
                    <TerminalPanel 
                        data={candidates.a.data}
                        streamBuffer={candidates.a.buffer}
                        isGenerating={isGenerating}
                        tpsHistory={candidates.a.tpsHistory}
                        generationStartTime={generationStartTime}
                        label="VARIANT A"
                        labelColorClass="text-blue-400 border-blue-900/50 bg-blue-900/10"
                        showControls={!isGenerating}
                        overlayPosition="left-0 w-full lg:w-1/2 border-r border-neutral-900"
                        className={`${mobileTab === 'b' ? 'hidden lg:flex' : 'flex'}`}
                        allowInteraction={allowInteraction}
                        onDownloadGif={onDownloadGifA}
                        onDownloadSvg={onDownloadSvgA}
                        onDownloadReact={onDownloadReactA}
                        onDownloadCss={onDownloadCssA}
                        onDownloadLottie={onDownloadLottieA}
                        onCodeEdit={onCodeEditA}
                    />
                    <div className="w-px bg-neutral-900 flex-none z-10 hidden lg:block" />
                    <TerminalPanel 
                        data={candidates.b.data}
                        streamBuffer={candidates.b.buffer}
                        isGenerating={isGenerating}
                        tpsHistory={candidates.b.tpsHistory}
                        generationStartTime={generationStartTime}
                        label="VARIANT B"
                        labelColorClass="text-purple-400 border-purple-900/50 bg-purple-900/10"
                        showControls={!isGenerating}
                        overlayPosition="right-0 w-full lg:w-1/2"
                        className={`${mobileTab === 'a' ? 'hidden lg:flex' : 'flex'}`}
                        allowInteraction={allowInteraction}
                        onDownloadGif={onDownloadGifB}
                        onDownloadSvg={onDownloadSvgB}
                        onDownloadReact={onDownloadReactB}
                        onDownloadCss={onDownloadCssB}
                        onDownloadLottie={onDownloadLottieB}
                        onCodeEdit={onCodeEditB}
                    />
                </>
            ) : (
                <TerminalPanel 
                    data={currentData}
                    streamBuffer=""
                    isGenerating={false}
                    tpsHistory={currentData?.tpsHistory || []}
                    generationStartTime={0}
                    label={`GEN ${currentData?.id || 1}`}
                    labelColorClass="text-white border-neutral-700 bg-neutral-800"
                    showControls={true}
                    overlayPosition="inset-x-0"
                    allowInteraction={allowInteraction}
                    onDownloadGif={onDownloadGifMain}
                    onDownloadSvg={onDownloadSvgMain}
                    onDownloadReact={onDownloadReactMain}
                    onDownloadCss={onDownloadCssMain}
                    onDownloadLottie={onDownloadLottieMain}
                    onCodeEdit={onCodeEditMain}
                />
            )}
        </div>
    </div>
  );
};