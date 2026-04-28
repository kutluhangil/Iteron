import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, login, logout, auth } from '../firebaseConfig';
import { SpinnerData } from '../types';
import { P5Canvas } from './P5Canvas';
import { onAuthStateChanged, User } from 'firebase/auth';

interface ExploreGalleryProps {
    onClose: () => void;
    onLoad: (spinner: SpinnerData) => void;
    currentSpinner?: SpinnerData;
}

export const ExploreGallery: React.FC<ExploreGalleryProps> = ({ onClose, onLoad, currentSpinner }) => {
    const [user, setUser] = useState<User | null>(null);
    const [spinners, setSpinners] = useState<SpinnerData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [publishing, setPublishing] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            fetchSpinners();
        });
        return unsubscribe;
    }, []);

    const fetchSpinners = async () => {
        setIsLoading(true);
        try {
            const q = query(collection(db, 'spinners'), orderBy('createdAt', 'desc'), limit(50));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id_str: doc.id, ...doc.data() } as any));
            setSpinners(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePublish = async () => {
        if (!user || !currentSpinner) return;
        setPublishing(true);
        try {
            await addDoc(collection(db, 'spinners'), {
                p5Code: currentSpinner.p5Code,
                mutationName: currentSpinner.mutationName,
                reasoning: currentSpinner.reasoning || "Published by user",
                creatorId: user.uid,
                createdAt: serverTimestamp(),
                likesCount: 0
            });
            await fetchSpinners();
        } catch (e) {
            console.error(e);
            alert("Failed to publish design. Wait a few seconds or try again.");
        } finally {
            setPublishing(false);
        }
    };

    const handleLike = async (id: string, currentLikes: number) => {
        if (!user) {
            login();
            return;
        }
        try {
            await updateDoc(doc(db, 'spinners', id), {
                likesCount: currentLikes + 1
            });
            await fetchSpinners();
        } catch(e) {
            console.error(e);
        }
    };

    return (
        <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-md overflow-hidden flex flex-col font-sans">
            <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-800 bg-black sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-white tracking-widest uppercase">Community Gallery</h2>
                    {user ? (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-400">Welcome, {user.displayName || 'Creator'}</span>
                            <button onClick={logout} className="text-[10px] px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded">Logout</button>
                        </div>
                    ) : (
                        <button onClick={login} className="text-xs px-4 py-2 bg-white text-black font-bold uppercase rounded shadow-lg">Login to Publish</button>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {user && currentSpinner && (
                        <button 
                            onClick={handlePublish} 
                            disabled={publishing}
                            className="text-xs px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase rounded shadow-lg disabled:opacity-50"
                        >
                            {publishing ? 'Publishing...' : 'Publish Current'}
                        </button>
                    )}
                    <button onClick={onClose} className="text-white hover:text-neutral-300 text-3xl font-light">&times;</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                {isLoading ? (
                    <div className="flex items-center justify-center h-64 text-neutral-400 uppercase tracking-widest animate-pulse">Loading Designs...</div>
                ) : spinners.length === 0 ? (
                    <div className="flex items-center justify-center h-64 text-neutral-600 uppercase tracking-widest">No designs found. Be the first to publish!</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {spinners.map((spinner, i) => (
                            <div key={(spinner as any).id_str || i} className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden flex flex-col group relative">
                                <div className="aspect-square relative bg-black/50 pointer-events-none">
                                    <P5Canvas code={spinner.p5Code} speed={1} hueShift={0} aspectRatio={1} />
                                    <div className="absolute inset-0 z-10 hover:bg-black/20 transition-colors pointer-events-auto"></div>
                                </div>
                                <div className="p-4 flex flex-col gap-2 relative z-20 bg-neutral-900">
                                    <h3 className="font-bold text-sm text-white truncate" title={spinner.mutationName}>{spinner.mutationName}</h3>
                                    <p className="text-[10px] text-neutral-400 leading-tight line-clamp-2" title={spinner.reasoning}>{spinner.reasoning}</p>
                                    
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-800">
                                        <button 
                                            onClick={() => handleLike((spinner as any).id_str, spinner.likesCount || 0)}
                                            className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-red-400 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                                            <span>{spinner.likesCount || 0}</span>
                                        </button>
                                        <button 
                                            onClick={() => {
                                                const sCopy = { ...spinner, id: Date.now() };
                                                onLoad(sCopy);
                                                onClose();
                                            }} 
                                            className="text-[10px] uppercase font-bold text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded transition-colors"
                                        >
                                            Evolve &rarr;
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
