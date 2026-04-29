/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism-tomorrow.css';
import { P5Canvas, P5CanvasRef } from './components/P5Canvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Terminal, parsePartialJson } from './components/Terminal';
import { ExploreGallery } from './components/ExploreGallery';
import { TreeVisualizer } from './components/TreeVisualizer';
import { generateNextSpinner } from './services/geminiService';
import { generateExportPack } from './utils/exportService'; 
import { playClickSound, playChimeSound } from './utils/sound';
import { SpinnerData, CandidateState } from './types';

// Initial seed code: Material Design 3 Circular Progress Indicator
const PROGENITOR_CODE = `
  p.setup = () => {
    p.createCanvas(400, 400);
    p.colorMode(p.HSB, 360, 100, 100);
    p.noFill();
    p.strokeCap(p.ROUND);
    p.strokeWeight(20);
  };

  p.draw = () => {
    p.clear(); // Transparent background
    p.translate(p.width / 2, p.height / 2);

    const t = p.millis(); // Continuous time
    
    // 1. Continuous Rotation
    // Rotate steadily over time
    p.rotate(t * 0.0005);

    // 2. Breathing Arc
    // Sine wave creates a natural infinite loop without jumps
    const sineVal = p.sin(t * 0.002);
    
    const minLen = p.radians(20);
    const maxLen = p.radians(280);
    const arcLen = p.map(sineVal, -1, 1, minLen, maxLen);
    
    // 3. Dynamic Offset
    const easeOffset = p.map(sineVal, -1, 1, 0, p.PI * 0.5);
    p.rotate(easeOffset);

    // 4. Color Cycle
    const hue = (t * 0.05) % 360;
    p.stroke(hue, 80, 100);
    
    p.arc(0, 0, 300, 300, 0, arcLen);
  };
`;

const PROGENITOR_DATA: SpinnerData = {
  id: 1,
  mutationName: "Material Kinetic",
  reasoning: "The Progenitor. A perfect loop based on Material Design 3's indeterminate progress indicator. Features variable arc length, elastic rotation, and full-spectrum HSB cycling.",
  p5Code: PROGENITOR_CODE,
  timestamp: Date.now(),
  generationTimeMs: 0,
  tokensPerSecond: 0,
  totalTokens: 0,
  tpsHistory: [],
};

// --- Overlay Component for Streaming Text ---
const StreamingOverlay = ({ buffer, isVisible, accentColor }: { buffer: string, isVisible: boolean, accentColor: string }) => {
    const data = useMemo(() => parsePartialJson(buffer), [buffer]);
    
    // We only render if visible OR if there is content (to allow fade out)
    if (!isVisible && !buffer) return null;

    return (
        <div 
            className={`absolute inset-0 z-50 p-4 md:p-8 flex flex-col pointer-events-none transition-all duration-500 ease-out bg-black/90 backdrop-blur-sm
            ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
        >
            {/* Inner container handles instant content hide when generation stops, preventing visual clash */}
            <div className={`flex flex-col h-full transition-opacity ${isVisible ? 'opacity-100 duration-500' : 'opacity-0 duration-0'}`}>
                <div className="flex-none mb-4 space-y-2">
                     <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${accentColor}`} />
                        <span className={`text-[10px] font-mono uppercase tracking-widest ${accentColor}`}>
                            Generating Mutation...
                        </span>
                     </div>
                     {data.mutationName && (
                         <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-none animate-in fade-in slide-in-from-left-2 duration-300">
                             {data.mutationName}
                         </h2>
                     )}
                     {data.reasoning && (
                         <p className="text-xs md:text-sm text-neutral-400 italic font-serif leading-relaxed animate-in fade-in slide-in-from-left-2 delay-100 duration-500 border-l-2 border-neutral-800 pl-3">
                             {data.reasoning}
                         </p>
                     )}
                </div>
                
                <div className="flex-1 min-h-0 relative mt-2 rounded border border-neutral-900 bg-neutral-950/50 overflow-hidden">
                    <pre className="absolute inset-0 p-4 text-[10px] font-mono text-neutral-500 leading-relaxed overflow-hidden whitespace-pre-wrap break-all opacity-70">
                        {/* We only show the last 1000 chars to create a 'terminal stream' effect without scrolling */}
                        {data.p5Code || buffer.slice(-500) || "Initializing..."}
                        <span className={`inline-block w-2 h-4 align-middle ml-1 bg-white animate-pulse`} />
                    </pre>
                </div>
            </div>
        </div>
    );
};

export default function App() {
  const [history, setHistory] = useState<SpinnerData[]>([PROGENITOR_DATA]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [candidates, setCandidates] = useState<{ a: CandidateState; b: CandidateState } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  
  const [exportState, setExportState] = useState<{ variant: 'a' | 'b', progress: number } | null>(null);

  const [generationStartTime, setGenerationStartTime] = useState<number>(0);
  
  // Mobile UI State
  const [mobileTab, setMobileTab] = useState<'a' | 'b'>('a');
  const touchStartRef = useRef<number>(0);
  
  const [isCustomSeedOpen, setIsCustomSeedOpen] = useState(false);
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [isTreeOpen, setIsTreeOpen] = useState(false);
  const [customSeedCode, setCustomSeedCode] = useState('');
  const [codeExportStatus, setCodeExportStatus] = useState<string | null>(null);

  const [activeSeedId, setActiveSeedId] = useState<number | undefined>(undefined);

  const [speed, setSpeed] = useState(1);
  const [hueShift, setHueShift] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [theme, setTheme] = useState<'dark'|'light'>('dark');
  const [userPrompt, setUserPrompt] = useState('');
  const [presets, setPresets] = useState<SpinnerData[]>([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);

  // Toggle fullscreen
  const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(err => {
              console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
          });
      } else {
          if (document.exitFullscreen) {
              document.exitFullscreen();
          }
      }
  };

  useEffect(() => {
      const handleFullscreenChange = () => {
          setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleMic = async () => {
    if (!micEnabled) {
      if (!(window as any).p5AudioMic) {
        if ((window as any).p5 && (window as any).p5.prototype && (window as any).p5.prototype.userStartAudio) {
           await (window as any).p5.prototype.userStartAudio();
           (window as any).p5AudioMic = new (window as any).p5.AudioIn();
           (window as any).p5AudioMic.start();
        } else {
           alert("p5.sound is still loading or unavailable.");
           return;
        }
      } else {
        await (window as any).p5.prototype.userStartAudio();
      }
      setMicEnabled(true);
    } else {
       if ((window as any).p5AudioMic) {
           (window as any).p5AudioMic.stop();
           delete (window as any).p5AudioMic;
       }
       setMicEnabled(false);
    }
  };

  useEffect(() => {
      try {
          const saved = localStorage.getItem('spinnerPresets');
          if (saved) setPresets(JSON.parse(saved));
      } catch(e) {}
  }, []);

  const savePresetSilent = (index: number) => {
      const sp = history[index];
      if (!sp) return;
      setPresets(prev => {
          if (prev.find(p => p.id === sp.id)) return prev;
          const newPreset: SpinnerData = { ...sp, mutationName: sp.mutationName + ' (Auto-Saved)' };
          const newPresets = [...prev, newPreset];
          localStorage.setItem('spinnerPresets', JSON.stringify(newPresets));
          return newPresets;
      });
  };

  const savePreset = () => {
      const sp = history[Math.min(currentIndex, history.length - 1)];
      if (!sp) return;
      const newPreset: SpinnerData = { ...sp, id: Date.now(), mutationName: sp.mutationName + ' (Saved)' };
      const newPresets = [...presets, newPreset];
      setPresets(newPresets);
      localStorage.setItem('spinnerPresets', JSON.stringify(newPresets));
  };

  const loadPreset = (preset: SpinnerData) => {
      setHistory(prev => [...prev, { ...preset, id: Math.max(...prev.map(h=>h.id), 0) + 1 }]);
      setCurrentIndex(history.length);
      setIsConfigOpen(false);
  };

  const candidatesRef = useRef<{ a: CandidateState; b: CandidateState } | null>(null);
  const canvasSingleRef = useRef<P5CanvasRef>(null);
  const canvasARef = useRef<P5CanvasRef>(null);
  const canvasBRef = useRef<P5CanvasRef>(null);

  // LOGIC CHANGE: 
  // We allow currentIndex to go one step beyond history length (index == history.length) 
  // IF there are active candidates. This "phantom" slot represents the "Creation Zone".
  // This decoupling allows us to view the "Head" (index == history.length - 1) as a static history item.
  const isSelectionMode = candidates !== null && currentIndex === history.length;
  const currentHistorySpinner = history[currentIndex];

  const [selectedVariant, setSelectedVariant] = useState<'a' | 'b' | null>(null);

  // Safety clamp: If candidates disappear (e.g. error) and we are in phantom slot, retreat.
  useEffect(() => {
      if (!candidates && currentIndex >= history.length) {
          setCurrentIndex(Math.max(0, history.length - 1));
      }
  }, [candidates, history.length, currentIndex]);

  // Reset mobile tab when new candidates are generated
  useEffect(() => {
      if (candidates) {
          setMobileTab('a');
      }
  }, [candidates]);

  const handleEvolve = async (seedOverride?: SpinnerData, promptOverride?: string) => {
    if (isGenerating) return;

    setIsGenerating(true);
    setGenerationStartTime(performance.now());
    
    const initialCandidateState = { buffer: "", data: null, tpsHistory: [] };
    const newCandidates = {
        a: { ...initialCandidateState },
        b: { ...initialCandidateState }
    };
    setCandidates(newCandidates);
    candidatesRef.current = newCandidates;

    const seedSpinner = seedOverride !== undefined ? seedOverride : history[currentIndex];
    const seedCode = seedSpinner ? seedSpinner.p5Code : null;
    setActiveSeedId(seedSpinner?.id);
    const nextId = (Math.max(...history.map(h => h.id), seedSpinner?.id || 0)) + 1;

    try {
      const promiseA = generateNextSpinner(seedCode, nextId, (text) => updateCandidateStream('a', text), promptOverride);
      const promiseB = generateNextSpinner(seedCode, nextId, (text) => updateCandidateStream('b', text), promptOverride);

      const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

      playChimeSound(); // Play sound when both candidates are generated

      setCandidates(prev => {
          if (!prev) return null;
          return {
              a: { ...prev.a, data: { ...resultA, tpsHistory: [...prev.a.tpsHistory] } },
              b: { ...prev.b, data: { ...resultB, tpsHistory: [...prev.b.tpsHistory] } }
          };
      });

    } catch (error) {
      console.error("Evolution failed", error);
      setCandidates(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const updateCandidateStream = (variant: 'a' | 'b', text: string) => {
    setCandidates(prev => {
        if (!prev) return null;
        const updated = {
            ...prev,
            [variant]: { ...prev[variant], buffer: text }
        };
        candidatesRef.current = updated;
        return updated;
    });
  };

  const downloadTextFile = (text: string, filename: string) => {
      const element = document.createElement("a");
      const file = new Blob([text], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = filename;
      document.body.appendChild(element); // Required for this to work in FireFox
      element.click();
      element.remove();
  };

  const handleExportCode = async (format: 'react' | 'css' | 'lottie', variant?: 'main' | 'a' | 'b') => {
      let spinner: SpinnerData | undefined;
      
      if (variant === 'main') {
          spinner = history[currentIndex];
      } else if (variant === 'a' || variant === 'b') {
          if (candidates) {
              spinner = candidates[variant].data || undefined;
          }
      }
      
      if (!spinner) return;
      const codeKey = format === 'react' ? 'reactCode' : format === 'css' ? 'cssCode' : 'lottieCode';
      const fileName = format === 'react' ? 'Spinner.tsx' : format === 'css' ? 'spinner.css' : 'spinner-lottie.json';
      
      if (spinner[codeKey]) {
          // already cached, download
          downloadTextFile(spinner[codeKey]!, fileName);
          return;
      }

      setCodeExportStatus(`Generating ${format.toUpperCase()}...`);
      try {
          const generatedCode = await convertSpinnerFormat(spinner.p5Code, format, (text) => {
              // we don't display stream for now, just wait
          });
          spinner[codeKey] = generatedCode;
          downloadTextFile(generatedCode, fileName);
      } catch (err) {
          console.error(err);
          alert(`Failed to generate ${format.toUpperCase()}.`);
      } finally {
          setCodeExportStatus(null);
      }
  };

  const handleStart = () => {
      setHasStarted(true);
      handleEvolve();
      setCurrentIndex(1); // Jump to the new phantom slot
  };

  const handleSelect = (variant: 'a' | 'b') => {
      if (exportState || !candidates) return;
      
      let winnerData = candidates[variant].data;
      
      // Early selection! Parse the buffer if it's still generating
      if (!winnerData && isGenerating) {
           winnerData = parsePartialJson(candidates[variant].buffer) as SpinnerData;
           if (!winnerData.p5Code || winnerData.p5Code.length < 10) return; // Not enough code yet
           winnerData.id = Date.now();
           winnerData.parentId = activeSeedId;
           winnerData.generationTimeMs = performance.now() - generationStartTime;
           winnerData.totalTokens = Math.round(candidates[variant].buffer.length / 4);
           winnerData.tokensPerSecond = 0;
           winnerData.tpsHistory = candidates[variant].tpsHistory;
      }
      
      if (!winnerData) return;
      winnerData.parentId = activeSeedId;

      playClickSound(); // Sound effect on selection
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50);
      }

      setSelectedVariant(variant);
      
      // Stop generating state so the UI reflects the selection
      setIsGenerating(false);

      setTimeout(() => {
          setHistory(prev => [...prev, winnerData!]);
          setCurrentIndex(prev => prev + 1); // Move to the NEXT phantom slot
          handleEvolve(winnerData);
          setSelectedVariant(null);
      }, 500); // Wait 500ms for visual feedback
  };

  const handleKeyDown = (e: React.KeyboardEvent, variant: 'a' | 'b') => {
      if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (candidates && !exportState) {
              handleSelect(variant);
          }
      }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
          // Don't trigger if typing in a textarea or input
          if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

          if (e.key === 'ArrowLeft') {
              actions.onPrev();
          } else if (e.key === 'ArrowRight') {
              actions.onNext();
          } else if ((e.key === 'Enter' || e.key === ' ') && !isSelectionMode && !isGenerating && hasStarted) {
              e.preventDefault();
              actions.onMutate();
          }
      };

      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [currentIndex, isSelectionMode, isGenerating, history.length, hasStarted]);

  const handleTouchStart = (e: React.TouchEvent) => {
      touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (!isSelectionMode) return;
      const touchEnd = e.changedTouches[0].clientX;
      const diff = touchStartRef.current - touchEnd;
      const threshold = 50; // min px to be considered a swipe

      if (Math.abs(diff) > threshold) {
          if (diff > 0) {
              // Swipe Left -> Go Next (A -> B)
              setMobileTab('b');
          } else {
              // Swipe Right -> Go Prev (B -> A)
              setMobileTab('a');
          }
      }
  };

  // Telemetry Recorder
  useEffect(() => {
    let interval: any;
    if (isGenerating) {
        interval = setInterval(() => {
            const now = performance.now();
            const elapsedSeconds = (now - generationStartTime) / 1000;
            
            if (elapsedSeconds > 0 && candidatesRef.current) {
                const lenA = candidatesRef.current.a.buffer.length / 4; 
                const tpsA = lenA / elapsedSeconds;
                
                const lenB = candidatesRef.current.b.buffer.length / 4;
                const tpsB = lenB / elapsedSeconds;

                candidatesRef.current.a.tpsHistory.push(tpsA);
                candidatesRef.current.b.tpsHistory.push(tpsB);

                setCandidates(prev => {
                    if (!prev) return null;
                    return {
                        a: { ...prev.a, tpsHistory: [...prev.a.tpsHistory, tpsA] },
                        b: { ...prev.b, tpsHistory: [...prev.b.tpsHistory, tpsB] }
                    };
                });
            }
        }, 100);
    }
    return () => clearInterval(interval);
  }, [isGenerating, generationStartTime]);

  const submitCustomSeed = () => {
    if (!customSeedCode.trim()) return;
    const seedSpinner: SpinnerData = {
      id: Math.max(...history.map(h => h.id), 0) + 1,
      mutationName: "Custom Seed",
      reasoning: "User provided custom seed",
      p5Code: customSeedCode,
      timestamp: Date.now(),
      generationTimeMs: 0,
      tokensPerSecond: 0,
      totalTokens: 0,
      tpsHistory: []
    };
    setHistory(prev => [...prev, seedSpinner]);
    setCurrentIndex(history.length);
    handleEvolve(seedSpinner);
    setIsCustomSeedOpen(false);
  };

  const actions = {
      onPrev: () => {
          if (currentIndex > 0) {
              savePresetSilent(currentIndex);
              setCurrentIndex(c => Math.max(0, c - 1));
          }
      },
      onNext: () => {
          if (currentIndex < (candidates ? history.length : history.length - 1)) {
              savePresetSilent(currentIndex);
              setCurrentIndex(c => Math.min(candidates ? history.length : history.length - 1, c + 1));
          }
      },
      onMutate: () => {
          handleEvolve(undefined, userPrompt);
          setUserPrompt('');
          setCurrentIndex(history.length); // Jump to phantom slot
      },
      onMutateRandom: () => {
          const fakeBase: SpinnerData = {
              id: Date.now(),
              p5Code: "// COMPLETELY_RANDOM_NEW_CONCEPT\n// Ignore any current style, generate a wildly different, creative, deeply complex loading spinner completely unlike anything before.",
              mutationName: "Random Exploration",
              reasoning: "Starting fresh.",
              tpsHistory: [],
              totalTokens: 0,
              generationTimeMs: 0,
              tokensPerSecond: 0
          };
          handleEvolve(fakeBase);
          setCurrentIndex(history.length); // Jump to phantom slot
      }
  };

  const hasApiKey = !!process.env.API_KEY;

  if (!hasApiKey) {
      return (
          <div className="min-h-screen bg-black text-neutral-400 flex items-center justify-center p-8 font-mono">
              <div className="max-w-md text-center space-y-4">
                  <h1 className="text-xl font-bold text-white">SYSTEM_HALT</h1>
                  <p>API_KEY missing. Process terminated.</p>
              </div>
          </div>
      )
  }

  const isInteractive = !isGenerating && !exportState;
  const maxIndex = candidates ? history.length : history.length - 1;

  return (
    <div className={`h-screen font-sans flex flex-col overflow-hidden relative ${theme === 'dark' ? 'bg-[#020202] text-neutral-400 dark-theme-mode' : 'bg-[#e5e5e5] text-neutral-600 light-theme-mode'}`}>
      <style>{`
        .light-theme-mode .bg-black { background-color: #ffffff; }
        .light-theme-mode .bg-\[#0a0a0a\] { background-color: #f0f0f0; }
        .light-theme-mode .bg-\[#050505\]\\/95 { background-color: rgba(255, 255, 255, 0.95); }
        .light-theme-mode .bg-neutral-900 { background-color: #f5f5f5; border-color: #d4d4d4; }
        .light-theme-mode .bg-neutral-900\\/40 { background-color: rgba(245, 245, 245, 0.6); }
        .light-theme-mode .bg-neutral-900\\/80 { background-color: rgba(245, 245, 245, 0.8); }
        .light-theme-mode .bg-neutral-950 { background-color: #fafafa; }
        .light-theme-mode .border-neutral-800, .light-theme-mode .border-neutral-700, .light-theme-mode .border-neutral-900 { border-color: #d4d4d4; }
        .light-theme-mode .text-white { color: #000000; }
        .light-theme-mode .text-neutral-300 { color: #333333; }
        .light-theme-mode .text-neutral-400 { color: #555555; }
        .light-theme-mode .text-neutral-500 { color: #777777; }
        .light-theme-mode .text-neutral-600 { color: #888888; }
        .light-theme-mode .text-neutral-700 { color: #999999; }
        .light-theme-mode .bg-white { background-color: #000000; color: #ffffff; }
        .light-theme-mode .border-white { border-color: #000000; }
        @keyframes gradientFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-text {
            background-size: 200% 200%;
            animation: gradientFlow 5s ease infinite;
        }
      `}</style>
      
      {isExploreOpen && (
          <ExploreGallery 
             onClose={() => setIsExploreOpen(false)}
             onLoad={(spinner) => {
                 setHistory(prev => [...prev, spinner]);
                 setCurrentIndex(history.length); // will be the new item
                 handleEvolve(spinner);
             }}
             currentSpinner={currentHistorySpinner}
          />
      )}

      {isTreeOpen && (
          <TreeVisualizer 
             history={history}
             currentIndex={currentIndex}
             onSelectNode={(index) => setCurrentIndex(index)}
             onClose={() => setIsTreeOpen(false)}
          />
      )}

      {isConfigOpen && (
          <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur flex items-center justify-center p-4">
               <div className="bg-neutral-900 border border-neutral-700 w-full max-w-sm rounded shadow-2xl flex flex-col p-6 space-y-6">
                   <div className="flex justify-between items-center bg-black/50 p-2 rounded -mx-2 -mt-2">
                       <h2 className="text-white font-bold tracking-widest text-xs uppercase px-2">Tweaks & Presets</h2>
                       <button onClick={() => setIsConfigOpen(false)} className="text-neutral-500 hover:text-white px-2">&times;</button>
                   </div>
                   
                   <div className="space-y-4">
                       <div>
                           <div className="flex justify-between text-xs text-neutral-400 mb-2">
                               <label>Animation Speed</label>
                               <span>{speed.toFixed(1)}x</span>
                           </div>
                           <input type="range" min="0.1" max="3" step="0.1" value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} className="w-full accent-white" />
                       </div>
                       
                       <div>
                           <div className="flex justify-between text-xs text-neutral-400 mb-2">
                               <label>Hue Shift</label>
                               <span>{hueShift}&deg;</span>
                           </div>
                           <input type="range" min="0" max="360" step="1" value={hueShift} onChange={e => setHueShift(parseInt(e.target.value))} className="w-full accent-white" />
                           <div className="h-2 w-full mt-2 rounded bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 via-purple-500 to-red-500" style={{ filter: `hue-rotate(${hueShift}deg)` }} />
                       </div>
                       <div className="flex gap-4">
                           <div className="flex-1">
                               <div className="flex justify-between text-xs text-neutral-400 mb-2">
                                   <label>Aspect Ratio</label>
                               </div>
                               <select 
                                   value={aspectRatio} 
                                   onChange={e => setAspectRatio(parseFloat(e.target.value))}
                                   className="w-full bg-neutral-800 text-white rounded px-2 py-1 text-xs border border-neutral-700 outline-none focus:border-neutral-500"
                               >
                                   <option value={1}>1:1 (Square)</option>
                                   <option value={16/9}>16:9 (Landscape)</option>
                                   <option value={4/3}>4:3</option>
                                   <option value={9/16}>9:16 (Portrait)</option>
                                   <option value={3/4}>3:4</option>
                               </select>
                           </div>
                       </div>
                   </div>

                   <hr className="border-neutral-800" />

                   <div className="space-y-4">
                       <div className="flex items-center justify-between">
                           <h3 className="text-xs uppercase font-bold text-neutral-400">Saved Presets</h3>
                           <button onClick={savePreset} disabled={!currentHistorySpinner} className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-white text-[10px] uppercase font-bold rounded disabled:opacity-50">Save Current</button>
                       </div>
                       
                       <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                           {presets.length === 0 && <div className="text-xs text-neutral-600 italic text-center py-4">No presets saved yet.</div>}
                           {presets.map((p, i) => (
                               <div key={i} className="flex flex-col p-2 bg-black/50 rounded border border-neutral-800 hover:border-neutral-600 cursor-pointer transition-colors" onClick={() => loadPreset(p)}>
                                   <span className="text-xs font-bold text-white mb-1">{p.mutationName}</span>
                                   <span className="text-[10px] text-neutral-500 truncate">{p.reasoning}</span>
                               </div>
                           ))}
                       </div>
                   </div>
               </div>
          </div>
      )}

      {isCustomSeedOpen && (
          <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur flex items-center justify-center p-4">
               <div className="bg-neutral-900 border border-neutral-700 w-full max-w-2xl rounded shadow-2xl flex flex-col p-4 space-y-4">
                   <div className="flex justify-between items-center">
                       <h2 className="text-white font-bold tracking-widest text-xs uppercase">Custom p5.js Seed</h2>
                       <button onClick={() => setIsCustomSeedOpen(false)} className="text-neutral-500 hover:text-white">&times;</button>
                   </div>
                   <div className="relative border border-neutral-800 bg-black overflow-y-auto custom-scrollbar h-64 rounded">
                       <Editor
                            value={customSeedCode}
                            onValueChange={code => setCustomSeedCode(code)}
                            highlight={code => Prism.highlight(code, Prism.languages.javascript, 'javascript')}
                            padding={15}
                            style={{
                                fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                                fontSize: 12,
                                color: '#ccc',
                                minHeight: '100%',
                            }}
                            textareaClassName="focus:outline-none"
                        />
                   </div>
                   <div className="flex justify-end gap-2">
                       <button onClick={() => setIsCustomSeedOpen(false)} className="px-4 py-2 text-xs font-bold text-neutral-400 hover:text-white uppercase">Cancel</button>
                       <button onClick={submitCustomSeed} className="px-4 py-2 bg-white text-black text-xs font-bold uppercase rounded hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-white">Evolve from Seed</button>
                   </div>
               </div>
          </div>
      )}

      {/* GLOBAL HEADER */}
      <div className="flex-none h-14 flex items-center justify-between px-3 md:px-4 bg-black border-b border-neutral-900 z-20">
            <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0 mr-2">
                 <span className="font-bold tracking-tight text-xs sm:text-sm hidden sm:inline-block">
                     <span className="text-neutral-100">Iter</span>
                     <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-500 to-blue-400 animate-gradient-text">on</span>
                 </span>
                 <div className="h-4 w-px bg-neutral-800 hidden sm:block"></div>
                 <div 
                    onClick={() => setIsTreeOpen(true)}
                    className="text-[9px] md:text-[10px] text-neutral-500 hover:text-white cursor-pointer uppercase tracking-widest font-mono truncate transition-colors px-2 py-1 bg-neutral-900 hover:bg-neutral-800 rounded border border-neutral-800">
                    {!hasStarted ? "" : (isSelectionMode ? "Gemini 3 Flash Live Coding" : `History: ${currentIndex + 1}/${history.length}`)}
                 </div>
            </div>

            {hasStarted && (() => {
                const isPromptValid = userPrompt.trim().length > 0 && userPrompt.trim().length <= 250;
                return (
                <div className="flex gap-2 flex-none">
                    {!isGenerating && !isSelectionMode && (
                        <>
                        <button 
                            onClick={actions.onMutateRandom}
                            title="Generate a completely new random spinner"
                            className="h-8 px-3 md:px-4 font-bold text-[9px] md:text-[10px] uppercase rounded border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition-colors hidden sm:flex items-center focus:outline-none focus:ring-2 focus:ring-neutral-700"
                        >
                            RANDOMIZE
                        </button>
                        <button 
                            onClick={toggleFullscreen}
                            title="Toggle Fullscreen"
                            className="h-8 px-3 md:px-4 font-bold text-[9px] md:text-[10px] uppercase rounded border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition-colors hidden sm:flex items-center focus:outline-none focus:ring-2 focus:ring-neutral-700"
                        >
                            {isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}
                        </button>
                        {isSelectionMode && (
                        <button 
                            onClick={() => setIsSyncEnabled(!isSyncEnabled)}
                            title="Toggle Timeline Scrub Syncing"
                            className={`h-8 px-3 md:px-4 font-bold text-[9px] md:text-[10px] uppercase rounded border border-neutral-800 transition-colors hidden sm:flex items-center focus:outline-none focus:ring-2 focus:ring-neutral-700 ${isSyncEnabled ? 'bg-blue-900/40 text-blue-400 border-blue-900' : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300'}`}
                        >
                            {isSyncEnabled ? 'SYNC: ON' : 'SYNC: OFF'}
                        </button>
                        )}
                        <button 
                            onClick={() => setIsExploreOpen(true)}
                            title="Explore Community Gallery"
                            className="h-8 px-3 md:px-4 font-bold text-[9px] md:text-[10px] uppercase rounded border border-blue-900 bg-blue-900/20 hover:bg-blue-900/40 text-blue-300 transition-colors hidden md:flex items-center focus:outline-none focus:ring-2 focus:ring-blue-700 gap-1"
                        >
                            EXPLORE
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                        </button>
                        <button 
                            onClick={toggleMic}
                            title="Toggle Microphone for Audio-Reactive Spinners"
                            className={`h-8 px-3 md:px-4 font-bold text-[9px] md:text-[10px] uppercase rounded border border-neutral-800 transition-colors hidden sm:flex items-center focus:outline-none focus:ring-2 focus:ring-neutral-700 gap-1 ${micEnabled ? 'bg-red-900/40 text-red-400 border-red-900' : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300'}`}
                        >
                            {micEnabled ? 'MIC ON' : 'MIC OFF'}
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                        </button>
                        <button 
                            onClick={() => setIsConfigOpen(true)}
                            className="h-8 px-3 md:px-4 font-bold text-[9px] md:text-[10px] uppercase rounded border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition-colors hidden sm:flex items-center focus:outline-none focus:ring-2 focus:ring-neutral-700"
                        >
                            TWEAKS & PRESETS
                        </button>
                        <button 
                            onClick={() => { setCustomSeedCode(history[currentIndex]?.p5Code || ''); setIsCustomSeedOpen(true); }}
                            className="h-8 px-3 md:px-4 font-bold text-[9px] md:text-[10px] uppercase rounded border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition-colors hidden sm:flex items-center focus:outline-none focus:ring-2 focus:ring-neutral-700"
                        >
                            CUSTOM SEED
                        </button>
                        </>
                    )}
                    <button 
                        onClick={actions.onPrev}
                        disabled={currentIndex === 0}
                        title="Undo (Previous iteration)"
                        className="h-8 w-8 flex items-center justify-center bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-white focus:outline-none focus:ring-2 focus:ring-neutral-700"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                    </button>
                    
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                        <input
                            type="text"
                            value={userPrompt}
                            onChange={(e) => setUserPrompt(e.target.value)}
                            placeholder="Prompt: e.g. low-poly, neon fire..."
                            disabled={isGenerating || !!exportState || isSelectionMode}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isGenerating && !isSelectionMode && isPromptValid) {
                                    actions.onMutate();
                                }
                            }}
                            className={`h-8 px-3 text-[10px] rounded border ${theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-neutral-300' : 'bg-white border-neutral-300 text-black'} focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48 transition-colors ${isSelectionMode ? 'opacity-50' : ''}`}
                        />
                        <button 
                            onClick={isSelectionMode || !isPromptValid ? undefined : actions.onMutate}
                        disabled={isSelectionMode || isGenerating || !!exportState || !isPromptValid}
                        title="Generate next iteration based on the current spinner"
                        className={`
                            h-8 px-3 md:px-4 font-bold text-[9px] md:text-[10px] uppercase rounded border transition-all duration-300 tracking-wider flex items-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black
                            ${isSelectionMode 
                                ? 'bg-neutral-900 border-neutral-800 text-neutral-500 cursor-default opacity-50' 
                                : 'bg-white hover:bg-neutral-200 border-white text-black shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:scale-110 hover:shadow-[0_0_25px_rgba(255,255,255,0.4)]'
                            }
                        `}
                    >
                        {isGenerating 
                            ? "PROCESSING..." 
                            : (isSelectionMode ? <span className="hidden md:inline">SELECT ON CANVAS</span> : "EVOLVE")
                        }
                        {isSelectionMode && <span className="md:hidden">SELECT</span>}
                    </button>
                    </div>

                    <button 
                        onClick={actions.onNext}
                        disabled={currentIndex === maxIndex}
                        title="Redo (Next iteration)"
                        className="h-8 w-8 flex items-center justify-center bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-white focus:outline-none focus:ring-2 focus:ring-neutral-700"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
                    </button>
                    {!isGenerating && !isSelectionMode && (
                        <button 
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            title="Toggle Light/Dark Theme"
                            className="h-8 w-8 ml-2 flex items-center justify-center bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded transition-colors text-white focus:outline-none focus:ring-2 focus:ring-neutral-700"
                        >
                            {theme === 'dark' ? (
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                            ) : (
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
                            )}
                        </button>
                    )}
                </div>
                );
            })()}
      </div>

      {/* VISUALS */}
      {/* We use lg:flex-row to ensure tablets (often < 1024px) get the mobile view */}
      <div 
        className="flex-1 min-h-0 bg-black shadow-[0_0_50px_rgba(0,0,0,0.8)_inset] flex flex-col lg:flex-row border-b border-neutral-900 z-10 relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {!isSelectionMode ? (
            // SINGLE VIEW
            <div className="w-full h-full relative flex items-center justify-center perspective-[1000px]">
                <div className="shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9),inset_0_0_30px_rgba(255,255,255,0.1)] border border-white/5 rounded-3xl transform transition-all duration-500 hover:scale-[1.03] overflow-hidden" style={{ aspectRatio, width: '100%', maxWidth: '80vh', maxHeight: '80vh' }}>
                    <ErrorBoundary onReset={actions.onMutate}>
                        <P5Canvas ref={canvasSingleRef} code={currentHistorySpinner?.p5Code || ""} speed={isPlaying ? speed : 0} hueShift={hueShift} aspectRatio={aspectRatio} />
                    </ErrorBoundary>
                </div>
                
                {/* Playback Controls Overlay */}
                <div className="absolute bottom-4 left-4 flex gap-2 z-20 items-center">
                    <button 
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="bg-neutral-900/80 hover:bg-neutral-800 text-white p-2 rounded-full backdrop-blur transition-colors border border-neutral-700 pointer-events-auto shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
                        title={isPlaying ? "Pause Animation" : "Play Animation"}
                        aria-label={isPlaying ? "Pause Animation" : "Play Animation"}
                        aria-pressed={isPlaying}
                    >
                        {isPlaying ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        )}
                    </button>
                    <button 
                        onClick={() => canvasSingleRef.current?.resetAnimation()}
                        className="bg-neutral-900/80 hover:bg-neutral-800 text-white p-2 rounded-full backdrop-blur transition-colors border border-neutral-700 pointer-events-auto shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
                        title="Reset Animation"
                        aria-label="Reset Animation"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                    {isPlaying && (
                        <div className="ml-2 bg-neutral-900/80 text-neutral-400 text-[9px] font-mono px-2 py-1 flex items-center gap-2 rounded border border-neutral-800 pointer-events-auto shadow-lg backdrop-blur" aria-live="polite">
                            <span><span className="text-green-400">●</span> GPU: ~16.6ms</span>
                            <span>Mem: {(performance as any)?.memory ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) : '--'} MB</span>
                        </div>
                    )}
                </div>

                {hasStarted && currentIndex < maxIndex && (
                     <div className="absolute bottom-8 right-8 pointer-events-none">
                        <span className="text-[10px] text-neutral-500 uppercase tracking-widest bg-neutral-900/80 px-2 py-1 rounded">
                            New Generation Ready &rarr;
                        </span>
                     </div>
                )}
            </div>
        ) : (
            // SPLIT VIEW
            <>
                {/* Mobile Navigation Controls */}
                <div className="lg:hidden absolute inset-x-0 top-1/2 -translate-y-1/2 z-40 flex justify-between px-2 pointer-events-none">
                    <button 
                         onClick={(e) => { e.stopPropagation(); setMobileTab('a'); }}
                         className={`pointer-events-auto p-3 bg-neutral-900/80 text-white rounded-full border border-neutral-700 shadow-lg backdrop-blur-sm transition-all active:scale-95 ${mobileTab === 'a' ? 'opacity-0 cursor-default' : 'opacity-100'}`}
                         aria-label="Previous Variant"
                    >
                         <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    
                    <button 
                         onClick={(e) => { e.stopPropagation(); setMobileTab('b'); }}
                         className={`pointer-events-auto p-3 bg-neutral-900/80 text-white rounded-full border border-neutral-700 shadow-lg backdrop-blur-sm transition-all active:scale-95 ${mobileTab === 'b' ? 'opacity-0 cursor-default' : 'opacity-100'}`}
                         aria-label="Next Variant"
                    >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
                
                {/* Mobile Tab Indicators */}
                <div className="lg:hidden absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex gap-2 pointer-events-none">
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${mobileTab === 'a' ? 'bg-white' : 'bg-neutral-800'}`} />
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${mobileTab === 'b' ? 'bg-white' : 'bg-neutral-800'}`} />
                </div>

                {/* Variant A */}
                {/* On mobile (< lg), only show if mobileTab is 'a'. On desktop (lg+), always show. */}
                <div 
                    onClick={() => (!exportState) && handleSelect('a')}
                    onKeyDown={(e) => handleKeyDown(e, 'a')}
                    tabIndex={candidates && !exportState ? 0 : -1}
                    role="button"
                    aria-label="Select Variant A"
                    className={`relative flex-1 border-b lg:border-b-0 lg:border-r border-neutral-900 flex-col items-center justify-center group cursor-pointer focus:outline-none transition-all duration-300
                    ${mobileTab === 'b' ? 'hidden lg:flex' : 'flex'}
                    ${selectedVariant === 'a' ? 'scale-[1.02] z-50 ring-4 ring-blue-500 bg-neutral-900 border-transparent shadow-[0_0_50px_rgba(59,130,246,0.3)]' : ''}
                    ${selectedVariant === 'b' ? 'opacity-20 grayscale scale-[0.98]' : (selectedVariant ? '' : 'hover:bg-neutral-900/50 hover:shadow-[inset_0_0_80px_rgba(59,130,246,0.15)] hover:border-blue-500/50')}
                    `}
                >
                    <div className={`absolute inset-0 bg-neutral-950/80 opacity-0 ${exportState ? '' : 'group-hover:opacity-100 group-focus-visible:opacity-100'} transition-opacity duration-300 z-30 flex items-center justify-center backdrop-grayscale`}>
                        <span className="text-white font-mono text-sm tracking-[0.2em] uppercase border border-white/20 px-4 py-2 bg-black/50 backdrop-blur-md rounded">
                            Select Variant A
                        </span>
                    </div>

                    {/* Streaming Overlay A */}
                    {candidates && (
                        <StreamingOverlay 
                            buffer={candidates.a.buffer} 
                            isVisible={isGenerating} 
                            accentColor="bg-blue-500 text-blue-500" 
                        />
                    )}

                    {candidates?.a.data ? (
                         <div className="w-full h-full flex items-center justify-center p-4 md:p-8 transition-all duration-500 perspective-[1000px]">
                             <div className="w-full h-full flex items-center justify-center relative shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(255,255,255,0.05)] group-hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9),inset_0_0_30px_rgba(255,255,255,0.1)] border border-white/5 rounded-3xl overflow-hidden transition-all duration-500 group-hover:scale-[1.03]">
                                 <ErrorBoundary onReset={actions.onMutate}>
                                     <P5Canvas id="variant-a" ref={canvasARef} code={candidates.a.data.p5Code} speed={isPlaying ? speed : 0} hueShift={hueShift} aspectRatio={aspectRatio} enableSync={isSyncEnabled} />
                                 </ErrorBoundary>
                             </div>
                         </div>
                    ) : (
                         // Fallback loader
                         !isGenerating && (
                            <div className="flex flex-col items-center gap-4 opacity-50">
                                <span className="text-xs font-mono text-neutral-700">Waiting for stream...</span>
                            </div>
                         )
                    )}
                </div>

                {/* Variant B */}
                <div 
                    onClick={() => (!exportState) && handleSelect('b')}
                    onKeyDown={(e) => handleKeyDown(e, 'b')}
                    tabIndex={candidates && !exportState ? 0 : -1}
                    role="button"
                    aria-label="Select Variant B"
                    className={`relative flex-1 flex-col items-center justify-center group cursor-pointer focus:outline-none transition-all duration-300
                    ${mobileTab === 'a' ? 'hidden lg:flex' : 'flex'}
                    ${selectedVariant === 'b' ? 'scale-[1.02] z-50 ring-4 ring-purple-500 bg-neutral-900 border-transparent shadow-[0_0_50px_rgba(168,85,247,0.3)]' : ''}
                    ${selectedVariant === 'a' ? 'opacity-20 grayscale scale-[0.98]' : (selectedVariant ? '' : 'hover:bg-neutral-900/50 hover:shadow-[inset_0_0_80px_rgba(168,85,247,0.15)] hover:border-purple-500/50')}
                    `}
                >
                    <div className={`absolute inset-0 bg-neutral-950/80 opacity-0 ${exportState ? '' : 'group-hover:opacity-100 group-focus-visible:opacity-100'} transition-opacity duration-300 z-30 flex items-center justify-center backdrop-grayscale`}>
                        <span className="text-white font-mono text-sm tracking-[0.2em] uppercase border border-white/20 px-4 py-2 bg-black/50 backdrop-blur-md rounded">
                            Select Variant B
                        </span>
                    </div>

                    {/* Streaming Overlay B */}
                    {candidates && (
                        <StreamingOverlay 
                            buffer={candidates.b.buffer} 
                            isVisible={isGenerating} 
                            accentColor="bg-purple-500 text-purple-500" 
                        />
                    )}

                    {candidates?.b.data ? (
                         <div className="w-full h-full flex items-center justify-center p-4 md:p-8 transition-all duration-500 perspective-[1000px]">
                             <div className="w-full h-full flex items-center justify-center relative shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(255,255,255,0.05)] group-hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9),inset_0_0_30px_rgba(255,255,255,0.1)] border border-white/5 rounded-3xl overflow-hidden transition-all duration-500 group-hover:scale-[1.03]">
                                 <ErrorBoundary onReset={actions.onMutate}>
                                     <P5Canvas id="variant-b" ref={canvasBRef} code={candidates.b.data.p5Code} speed={isPlaying ? speed : 0} hueShift={hueShift} aspectRatio={aspectRatio} enableSync={isSyncEnabled} />
                                 </ErrorBoundary>
                             </div>
                         </div>
                    ) : (
                         !isGenerating && (
                            <div className="flex flex-col items-center gap-4 opacity-50">
                                <span className="text-xs font-mono text-neutral-700">Waiting for stream...</span>
                            </div>
                         )
                    )}
                </div>
            </>
        )}
      </div>

      {/* CONSOLE / DATA VIEW */}
      {/* Adjusted height: Auto-height (flex-none) when running to minimize empty space, fixed height for start screen to fit content */}
      <div className={`${!hasStarted ? 'h-[40vh]' : 'flex-none'} bg-[#080808] flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20 relative transition-[height] duration-500`}>
        <Terminal 
            currentData={currentHistorySpinner}
            candidates={candidates}
            isGenerating={isGenerating}
            generationStartTime={generationStartTime}
            history={history}
            currentIndex={currentIndex}
            isSelectionMode={isSelectionMode}
            mobileTab={mobileTab}
            allowInteraction={hasStarted}
            onDownloadGifMain={() => canvasSingleRef.current?.downloadGif()}
            onDownloadGifA={() => canvasARef.current?.downloadGif()}
            onDownloadGifB={() => canvasBRef.current?.downloadGif()}
            onDownloadSvgMain={() => canvasSingleRef.current?.downloadSvg('spinner_gen_' + (currentHistorySpinner?.id || 'export'))}
            onDownloadSvgA={() => canvasARef.current?.downloadSvg('spinner_a_' + (candidates?.a.data.id || 'export'))}
            onDownloadSvgB={() => canvasBRef.current?.downloadSvg('spinner_b_' + (candidates?.b.data.id || 'export'))}
            onDownloadReactMain={() => handleExportCode('react', 'main')}
            onDownloadReactA={() => handleExportCode('react', 'a')}
            onDownloadReactB={() => handleExportCode('react', 'b')}
            onDownloadCssMain={() => handleExportCode('css', 'main')}
            onDownloadCssA={() => handleExportCode('css', 'a')}
            onDownloadCssB={() => handleExportCode('css', 'b')}
            onDownloadLottieMain={() => handleExportCode('lottie', 'main')}
            onDownloadLottieA={() => handleExportCode('lottie', 'a')}
            onDownloadLottieB={() => handleExportCode('lottie', 'b')}
            onCodeEditMain={(newCode) => {
                const newHistory = [...history];
                if (newHistory[currentIndex]) {
                    newHistory[currentIndex] = { ...newHistory[currentIndex], p5Code: newCode };
                    setHistory(newHistory);
                }
            }}
            onCodeEditA={(newCode) => {
                if (candidates?.a) {
                    setCandidates({ ...candidates, a: { ...candidates.a, data: { ...candidates.a.data, p5Code: newCode } } as typeof candidates.a });
                }
            }}
            onCodeEditB={(newCode) => {
                if (candidates?.b) {
                    setCandidates({ ...candidates, b: { ...candidates.b, data: { ...candidates.b.data, p5Code: newCode } } as typeof candidates.b });
                }
            }}
        />

        {/* CODE EXPORT OVERLAY */}
        {codeExportStatus && (
            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-neutral-900 border border-neutral-800 p-6 rounded shadow-2xl text-center max-w-sm w-full mx-auto animate-in fade-in zoom-in duration-300">
                    <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
                    <h3 className="text-white font-mono text-sm tracking-wider uppercase">{codeExportStatus}</h3>
                    <p className="text-neutral-500 text-[10px] mt-2">Translating p5.js logic via Gemini...</p>
                </div>
            </div>
        )}

        {/* LANDING OVERLAY */}
        {!hasStarted && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 z-50 border-t border-neutral-800">
                <div className="animate-in fade-in zoom-in duration-700 slide-in-from-bottom-4 flex flex-col items-center">
                    <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 tracking-tighter max-w-4xl leading-none">
                        Iter<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-500 to-blue-400 animate-gradient-text">on</span>
                    </h1>
                    
                    <p className="text-sm md:text-base text-neutral-400 max-w-xl mb-8 leading-relaxed font-light">
                        A new way to develop. A/B test real-time code generations.
                        <br />
                        <span className="text-white font-medium">Gemini 3 Flash</span> evolves the perfect loading spinner.
                        <br />
                        <span className="text-neutral-500 italic text-xs mt-2 block">So fast you barely need a loading spinner!</span>
                    </p>

                    <button 
                        onClick={handleStart}
                        className="px-8 py-3 bg-white hover:bg-neutral-200 text-black font-bold text-xs tracking-[0.2em] rounded-sm transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] ring-offset-2 ring-offset-black focus:ring-2 focus:ring-white outline-none"
                    >
                        START EVOLVING
                    </button>
                    
                    <div className="mt-8 text-[10px] text-neutral-600 font-mono uppercase tracking-widest hover:text-neutral-500 transition-colors">
                        Created by <a href="https://x.com/leslienooteboom" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 decoration-neutral-800 hover:decoration-neutral-500">@leslienooteboom</a>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}