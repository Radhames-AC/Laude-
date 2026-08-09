import React, { useEffect, useRef, useState } from 'react';

interface Props {
  targetId: string;
}

export default function ThumbScroll({ targetId }: Props) {
  const padRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [trackHeight, setTrackHeight] = useState(192); // default h-48

  // Sync scroll state from target
  useEffect(() => {
    targetRef.current = document.getElementById(targetId);
    if (!targetRef.current) return;

    const target = targetRef.current;
    
    // Update track height for fluid calculations
    const updateDimensions = () => {
      if (padRef.current) {
        setTrackHeight(padRef.current.clientHeight);
      }
      setIsVisible(target.scrollHeight > target.clientHeight);
    };
    
    const handleScroll = () => {
      if (!isScrolling) {
        const maxScroll = target.scrollHeight - target.clientHeight;
        if (maxScroll > 0) {
          setScrollProgress(target.scrollTop / maxScroll);
        } else {
          setScrollProgress(0);
        }
      }
    };
    
    updateDimensions();
    handleScroll();
    
    target.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateDimensions);
    
    let observer: MutationObserver | null = new MutationObserver(() => {
      updateDimensions();
      handleScroll();
    });
    observer.observe(target, { childList: true, subtree: true, attributes: true });
    
    return () => {
      target.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateDimensions);
      if (observer) observer.disconnect();
    };
  }, [targetId, isScrolling]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!targetRef.current || !padRef.current) return;
    setIsScrolling(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateScrollFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrolling) return;
    updateScrollFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsScrolling(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const updateScrollFromPointer = (clientY: number) => {
    if (!targetRef.current || !padRef.current) return;
    const padRect = padRef.current.getBoundingClientRect();
    const target = targetRef.current;
    
    // The thumb is 56px height (h-14). Half is 28px.
    const thumbHalf = 28;
    // Include 6px padding top (top-1.5)
    const padTop = padRect.top + thumbHalf + 6;
    // Include 12px total padding for top/bottom
    const padHeight = padRect.height - (thumbHalf * 2) - 12;
    
    let progress = (clientY - padTop) / padHeight;
    progress = Math.max(0, Math.min(1, progress));
    
    setScrollProgress(progress);
    
    const maxScroll = target.scrollHeight - target.clientHeight;
    target.scrollTop = progress * maxScroll;
  };

  if (!isVisible) return null;

  // Track height minus the thumb height (56px) minus vertical padding (12px top/bottom)
  const availableTravel = trackHeight - 56 - 12;
  const thumbTranslateY = scrollProgress * availableTravel;

  return (
    <div
      ref={padRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: 'none' }}
      className={`fixed right-4 md:right-6 bottom-[90px] md:bottom-[100px] w-8 md:w-10 h-56 md:h-72 rounded-full z-[8000] border backdrop-blur-xl cursor-ns-resize transition-all duration-300 select-none ${
        isScrolling 
          ? 'opacity-100 bg-slate-800/10 border-slate-400/30 shadow-[inset_0_0_12px_rgba(0,0,0,0.05)] scale-[1.02]' 
          : 'opacity-30 hover:opacity-100 bg-white/40 border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] hover:bg-white/50 hover:shadow-[0_8px_32px_rgba(0,0,0,0.12)]'
      }`}
      title="Slide to scroll fast"
    >
      <div className="relative w-full h-full">
        {/* Thumb */}
        <div 
          className={`absolute left-1/2 -translate-x-1/2 top-1.5 w-6 md:w-8 h-14 rounded-full flex flex-col justify-center items-center gap-[4px] transition-all duration-150 ${
            isScrolling 
              ? 'bg-indigo-600 shadow-[0_4px_16px_rgba(79,70,229,0.5)] ring-2 ring-indigo-300/50 scale-105' 
              : 'bg-white shadow-[0_2px_10px_rgba(0,0,0,0.12)] border border-slate-100/50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:scale-[1.02]'
          }`}
          style={{ transform: `translate(-50%, ${thumbTranslateY}px)` }}
        >
          <div className={`w-3.5 h-[2px] rounded-full transition-colors ${isScrolling ? 'bg-indigo-300' : 'bg-slate-300'}`} />
          <div className={`w-3.5 h-[2px] rounded-full transition-colors ${isScrolling ? 'bg-white' : 'bg-slate-400'}`} />
          <div className={`w-3.5 h-[2px] rounded-full transition-colors ${isScrolling ? 'bg-indigo-300' : 'bg-slate-300'}`} />
        </div>
      </div>
    </div>
  );
}
