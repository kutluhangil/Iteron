import React, { useMemo } from 'react';
import * as d3 from 'd3';
import { SpinnerData } from '../types';

interface TreeVisualizerProps {
    history: SpinnerData[];
    currentIndex: number;
    onSelectNode: (index: number) => void;
    onClose: () => void;
}

export const TreeVisualizer: React.FC<TreeVisualizerProps> = ({ history, currentIndex, onSelectNode, onClose }) => {
    
    const { nodes, links, width, height } = useMemo(() => {
        if (history.length === 0) return { nodes: [], links: [], width: 0, height: 0 };

        // 1. Build hierarchy
        // Find roots (nodes with no parentId or whose parentId doesn't exist in history)
        const historyIds = new Set(history.map(h => h.id));
        const rootNodes = history.filter(h => !h.parentId || !historyIds.has(h.parentId));

        // Let's create a synthetic root if there are multiple roots
        const stratifyData = history.map(h => ({
            ...h,
            parentId: (!h.parentId || !historyIds.has(h.parentId)) ? 'SYNTHETIC_ROOT' : h.parentId.toString(),
            idStr: h.id.toString(),
            index: history.indexOf(h)
        }));

        stratifyData.push({
            id: -1,
            idStr: 'SYNTHETIC_ROOT',
            parentId: '',
            mutationName: 'Start',
            reasoning: '',
            p5Code: '',
            timestamp: 0,
            generationTimeMs: 0,
            tokensPerSecond: 0,
            totalTokens: 0,
            tpsHistory: [],
            index: -1
        });

        const root = d3.stratify<any>()
            .id(d => d.idStr)
            .parentId(d => d.parentId)(stratifyData);

        // Calculate generic tree layout
        const nodeSizeX = 140;
        const nodeSizeY = 80;
        
        const treeLayout = d3.tree<any>()
            .nodeSize([nodeSizeX, nodeSizeY]);

        treeLayout(root);

        // Calculate bounding box to adjust SVG coordinates
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        root.each(d => {
            if (d.x < minX) minX = d.x;
            if (d.x > maxX) maxX = d.x;
            if (d.y < minY) minY = d.y;
            if (d.y > maxY) maxY = d.y;
        });

        // Filter out the synthetic root for display
        const displayNodes = root.descendants().filter(d => d.id !== 'SYNTHETIC_ROOT');
        const displayLinks = root.links().filter(l => l.source.id !== 'SYNTHETIC_ROOT');

        const padding = 100;
        const w = Math.max(800, maxX - minX + padding * 2);
        const h = Math.max(600, maxY - minY + padding * 2);
        
        const offsetX = -minX + padding;
        const offsetY = -minY + padding;

        return {
            nodes: displayNodes.map(n => ({...n, x: n.x + offsetX, y: n.y + offsetY})),
            links: displayLinks.map(l => ({
                source: {...l.source, x: l.source.x + offsetX, y: l.source.y + offsetY},
                target: {...l.target, x: l.target.x + offsetX, y: l.target.y + offsetY}
            })),
            width: w,
            height: h
        };
    }, [history]);

    return (
        <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col font-sans">
            <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-800 bg-black sticky top-0 z-10 w-full">
                <h2 className="text-xl font-bold text-white tracking-widest uppercase flex items-center pr-4">Evolution Tree</h2>
                <button onClick={onClose} className="text-white hover:text-neutral-300 text-3xl font-light">&times;</button>
            </div>
            
            <div className="flex-1 overflow-auto relative">
                <svg width={width} height={height} className="absolute top-0 left-0">
                    <defs>
                        <linearGradient id="linkGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.5" />
                        </linearGradient>
                    </defs>
                    <g>
                        {links.map((link, i) => {
                            const pathData = d3.linkVertical()
                                .x(d => (d as any).x)
                                .y(d => (d as any).y)(link as any);
                            return (
                                <path
                                    key={`link-${i}`}
                                    d={pathData || undefined}
                                    fill="none"
                                    stroke="url(#linkGradient)"
                                    strokeWidth={2}
                                />
                            );
                        })}
                        {nodes.map((node) => {
                            const isCurrent = node.data.index === currentIndex;
                            return (
                                <g 
                                    key={node.id} 
                                    transform={`translate(${node.x},${node.y})`}
                                    onClick={() => {
                                        onSelectNode(node.data.index);
                                        onClose();
                                    }}
                                    className="cursor-pointer group"
                                >
                                    <circle 
                                        r={isCurrent ? 24 : 16} 
                                        fill={isCurrent ? "#3b82f6" : "#171717"} 
                                        stroke={isCurrent ? "#60a5fa" : "#3f3f46"}
                                        strokeWidth={isCurrent ? 3 : 2}
                                        className="transition-all duration-300 group-hover:stroke-white group-hover:fill-neutral-800"
                                    />
                                    <text
                                        y={isCurrent ? 40 : 30}
                                        textAnchor="middle"
                                        fill="white"
                                        className="text-[10px] font-bold uppercase tracking-wider transition-all duration-300 group-hover:fill-blue-300"
                                    >
                                        {node.data.mutationName.slice(0, 15) + (node.data.mutationName.length > 15 ? '...' : '')}
                                    </text>
                                    <text
                                        y={isCurrent ? 55 : 45}
                                        textAnchor="middle"
                                        fill="#737373"
                                        className="text-[8px] font-mono"
                                    >
                                        #{node.data.index + 1}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                </svg>
            </div>
        </div>
    );
};
