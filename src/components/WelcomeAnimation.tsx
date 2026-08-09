import React, { useEffect, useState } from 'react';
import Logo from './Logo';

export default function WelcomeAnimation({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // Stage 0 -> 1: Logo container fades in and floats up naturally
    const t1 = setTimeout(() => setStage(1), 150); // Start page turn
    const t2 = setTimeout(() => setStage(2), 750); // Draw checkmark (after 0.6s flip)
    const t3 = setTimeout(() => setStage(3), 1200); // Flash effect (after 0.45s draw)
    const t4 = setTimeout(() => setStage(4), 2000); // Fade out whole screen
    const t5 = setTimeout(() => onComplete(), 2700); // Unmount

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[99999] flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-teal-50 transition-opacity duration-700 ${stage >= 4 ? 'opacity-0' : 'opacity-100'}`}>
      <div className={`relative w-48 h-48 flex items-center justify-center transition-all duration-1000 ease-out transform ${stage === 0 ? 'scale-90 opacity-0 translate-y-8' : stage >= 4 ? 'scale-110 opacity-0 -translate-y-8' : 'scale-100 opacity-100 translate-y-0'}`}>
        <Logo 
          className="w-full h-full drop-shadow-2xl" 
          animated={true} 
          stage={stage} 
        />
      </div>
    </div>
  );
}
