/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

// Declare p5 globally since we loaded it via CDN
declare global {
  interface Window {
    p5: any;
  }
}

export interface P5CanvasRef {
    downloadGif: () => void;
    downloadPng: (filename: string, size?: number) => void;
    downloadSvg: (filename: string) => void;
    resetAnimation: () => void;
}

interface P5CanvasProps {
  code: string;
  speed?: number;
  hueShift?: number;
  aspectRatio?: number; // width / height
}

export const CursorTrail = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        let trails: {x: number, y: number, life: number}[] = [];
        let animationFrameId: number;

        const resize = () => {
            if (canvas.parentElement) {
                canvas.width = canvas.parentElement.clientWidth;
                canvas.height = canvas.parentElement.clientHeight;
            }
        };
        resize();
        window.addEventListener('resize', resize);

        const onMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            // Don't add trail if mouse is outside
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
            
            trails.push({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                life: 1.0
            });
        };
        document.body.addEventListener('mousemove', onMouseMove);

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = trails.length - 1; i >= 0; i--) {
                const t = trails[i];
                t.life -= 0.05; // Fades out relatively quickly
                if (t.life <= 0) {
                    trails.splice(i, 1);
                } else {
                    ctx.beginPath();
                    ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(150, 200, 255, ${t.life * 0.4})`;
                    ctx.fill();
                }
            }
            animationFrameId = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            window.removeEventListener('resize', resize);
            document.body.removeEventListener('mousemove', onMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-[100]" />;
};

export const P5Canvas = forwardRef<P5CanvasRef, P5CanvasProps>(({ code, speed = 1, hueShift = 0, aspectRatio = 1 }, ref) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<any>(null);
  const speedRef = useRef(speed);
  const resetFnRef = useRef<(() => void) | null>(null);
  const [scale, setScale] = useState(1);
  const [userZoom, setUserZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);

  // Compute fixed virtual dimensions
  const virtualWidth = 400;
  const virtualHeight = 400 / aspectRatio;

  useEffect(() => {
     speedRef.current = speed;
  }, [speed]);

  useImperativeHandle(ref, () => ({
    downloadGif: () => {
        if (p5InstanceRef.current) {
            try {
                p5InstanceRef.current.saveGif('spinner_loop', 4, { silent: true });
            } catch (e) {
                console.error("GIF generation failed", e);
            }
        }
    },
    downloadPng: (filename: string, size?: number) => {
        const p = p5InstanceRef.current;
        if (!p) return;

        if (!size || size === virtualWidth) {
            p.saveCanvas(filename, 'png');
        } else {
            const h = size / aspectRatio;
            const pg = p.createGraphics(size, h);
            pg.clear();
            pg.image(p.get(), 0, 0, size, h);
            p.save(pg, filename + '.png');
            pg.remove();
        }
    },
    downloadSvg: (filename: string) => {
        const div = document.createElement('div');
        div.style.display = 'none';
        document.body.appendChild(div);
        try {
            const cleanCode = code.replace(/```javascript/g, '').replace(/```/g, '').trim();
            const sketchFunction = new Function('p', cleanCode);
            new window.p5((p: any) => {
                const origCreateCanvas = p.createCanvas;
                p.createCanvas = (w: number, h: number) => {
                    return origCreateCanvas.call(p, w, h, p.SVG);
                };
                p.millis = () => 0; // Capture first frame
                p.setup = () => {
                   origCreateCanvas.call(p, virtualWidth, virtualHeight, p.SVG);
                };
                try {
                    sketchFunction(p);
                    const originalDraw = p.draw;
                    if (originalDraw) {
                        p.draw = () => {
                            p.noLoop();
                            originalDraw();
                            p.save(filename + '.svg');
                            setTimeout(() => { p.remove(); div.remove(); }, 100);
                        };
                    } else {
                        setTimeout(() => { p.save(filename + '.svg'); p.remove(); div.remove(); }, 100);
                    }
                } catch(e) {
                    console.error("SVG execution error:", e);
                    div.remove();
                }
            }, div);
        } catch(e) {
            console.error("SVG generation failed:", e);
            div.remove();
        }
    },
    resetAnimation: () => {
        if (resetFnRef.current) {
            resetFnRef.current();
        }
    }
  }));

  // Resize observer to handle scaling for smaller screens and layout changes
  useEffect(() => {
    if (!wrapperRef.current) return;

    const updateScale = () => {
      if (wrapperRef.current) {
        const { width, height } = wrapperRef.current.getBoundingClientRect();
        
        // Calculate scale to fit both width and height gracefully
        const widthScale = Math.max(0.1, (width - 30) / virtualWidth);
        const heightScale = Math.max(0.1, (height - 30) / virtualHeight);
        
        const newScale = Math.min(widthScale, heightScale, 2.0); 
        setScale(newScale);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(updateScale);
    });

    resizeObserver.observe(wrapperRef.current);
    updateScale();

    return () => resizeObserver.disconnect();
  }, [virtualWidth, virtualHeight]);

  useEffect(() => {
    if (!canvasRef.current || !window.p5) return;

    if (p5InstanceRef.current) {
      p5InstanceRef.current.remove();
    }

    try {
      const cleanCode = code.replace(/```javascript/g, '').replace(/```/g, '').trim();
      // eslint-disable-next-line no-new-func
      const sketchFunction = new Function('p', cleanCode);

      p5InstanceRef.current = new window.p5((p: any) => {
        
        let internalMillis = 0;
        let lastRealTime = performance.now();
        
        resetFnRef.current = () => {
            internalMillis = 0;
        };
        
        p.millis = () => internalMillis;

        p.setup = () => {
          p.createCanvas(virtualWidth, virtualHeight);
          p.clear();
        };
        
        try {
            sketchFunction(p);

            const originalDraw = p.draw;
            if (originalDraw) {
                p.draw = () => {
                    const now = performance.now();
                    const dt = now - lastRealTime;
                    lastRealTime = now;
                    // Cap dt to avoid huge jumps if tab was inactive
                    internalMillis += Math.min(dt, 100) * speedRef.current;

                    try {
                        originalDraw();
                    } catch (drawErr) {
                        console.error("Runtime error in p5 draw loop:", drawErr);
                        p.noLoop();
                        p.clear();
                        p.translate(0, 0);
                        p.fill(255, 50, 50);
                        p.noStroke();
                        p.textAlign(p.CENTER, p.CENTER);
                        p.textSize(16);
                        p.text("RUNTIME_ERR", 200, 180);
                        p.textSize(10);
                        p.text((drawErr as Error).message.substring(0, 40), 200, 210);
                    }
                }
            }
        } catch (e) {
            console.error("Error executing generated p5 code:", e);
            p.clear();
            p.fill(150);
            p.noStroke();
            p.textAlign(p.LEFT, p.TOP);
            p.textSize(12);
            p.text("RENDER_ERR", 10, 10);
        }
      }, canvasRef.current);
    } catch (err) {
      console.error("Failed to compile p5 code:", err);
    }

    return () => {
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
      }
    };
  }, [code]);

  const handleWheel = (e: React.WheelEvent) => {
      // Zoom
      const zoomSensitivity = 0.002;
      setUserZoom(z => Math.max(0.1, Math.min(10, z - e.deltaY * zoomSensitivity)));
  };

  const activePointers = useRef(new Map<number, React.PointerEvent>());
  const initialPinchDist = useRef<number | null>(null);
  const initialZoom = useRef<number>(1);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
      activePointers.current.set(e.pointerId, e);
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsInteracting(true);

      if (activePointers.current.size === 1) {
          isDragging.current = true;
          lastMouse.current = { x: e.clientX, y: e.clientY };
      } else if (activePointers.current.size === 2) {
          isDragging.current = false; // Stop pure pan
          const pts = Array.from(activePointers.current.values());
          initialPinchDist.current = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
          initialZoom.current = userZoom;
      }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!activePointers.current.has(e.pointerId)) return;
      activePointers.current.set(e.pointerId, e); // Update the cache

      if (activePointers.current.size === 1 && isDragging.current) {
          const dx = e.clientX - lastMouse.current.x;
          const dy = e.clientY - lastMouse.current.y;
          setPan(p => ({ x: p.x + dx / (scale * userZoom), y: p.y + dy / (scale * userZoom) }));
          lastMouse.current = { x: e.clientX, y: e.clientY };
      } else if (activePointers.current.size === 2 && initialPinchDist.current) {
          const pts = Array.from(activePointers.current.values());
          const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
          const zoomFactor = dist / initialPinchDist.current;
          setUserZoom(Math.max(0.1, Math.min(10, initialZoom.current * zoomFactor)));
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      activePointers.current.delete(e.pointerId);
      e.currentTarget.releasePointerCapture(e.pointerId);

      if (activePointers.current.size === 0) {
          setIsInteracting(false);
          isDragging.current = false;
      } else if (activePointers.current.size < 2) {
          initialPinchDist.current = null;
      }
      if (activePointers.current.size === 1) {
          const remainingPointer = Array.from(activePointers.current.values())[0];
          isDragging.current = true;
          lastMouse.current = { x: remainingPointer.clientX, y: remainingPointer.clientY };
      }
  };

  // Reset zoom on double click
  const handleDoubleClick = () => {
      setUserZoom(1);
      setPan({ x: 0, y: 0 });
  };

  return (
    <div 
        className="w-full h-full flex items-center justify-center overflow-hidden relative" 
        ref={wrapperRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{ touchAction: 'none' }}
    >
        <CursorTrail />
        {isInteracting && (
            <div className="absolute top-4 left-4 z-40 bg-black/60 backdrop-blur text-white text-[10px] font-mono px-2 py-1 rounded shadow pointer-events-none">
                Pan: {Math.round(pan.x)}, {Math.round(pan.y)} | Zoom: {userZoom.toFixed(2)}x
            </div>
        )}
        <div 
          ref={canvasRef}
          className={`transition-all duration-300 ease-out ${isInteracting ? 'cursor-grabbing ring-2 ring-white/30 rounded-lg shadow-2xl' : 'cursor-move'}`}
          style={{ 
            width: `${virtualWidth}px`, 
            height: `${virtualHeight}px`, 
            transform: `scale(${scale * userZoom}) translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: 'center center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: isDragging.current ? 'none' : 'transform 0.1s ease-out, filter 0.3s ease-out',
            filter: `hue-rotate(${hueShift}deg)`
          }}
          role="application"
          aria-label="Interactive p5.js animation canvas"
          tabIndex={0}
        >
            {/* The p5 canvas injects itself here */}
        </div>
    </div>
  );
});
P5Canvas.displayName = 'P5Canvas';