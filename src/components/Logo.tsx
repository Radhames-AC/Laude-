import React from 'react';

export default function Logo({ className = "w-8 h-8", animated = false, stage = 0 }: { className?: string, animated?: boolean, stage?: number }) {
  const flippingPageStyle = animated ? {
    transformOrigin: '50px 50px',
    transform: stage >= 1 ? 'rotateY(-180deg)' : 'rotateY(0deg)',
    transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out 0.3s',
    opacity: stage >= 1 ? 0 : 1
  } : { display: 'none' };

  const checkmarkStyle = animated ? {
    strokeDasharray: 100,
    strokeDashoffset: stage >= 2 ? 0 : 100,
    transition: 'stroke-dashoffset 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: stage >= 2 ? 1 : 0
  } : {
    strokeDasharray: 100,
    strokeDashoffset: 0,
    opacity: 1
  };

  const flashStyle = animated ? {
    transformOrigin: '75px 30px',
    transform: stage >= 3 ? 'scale(2.5) rotate(25deg)' : 'scale(0) rotate(0deg)',
    opacity: stage >= 3 ? 0 : 1,
    transition: stage >= 3 ? 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease-out' : 'none'
  } : { display: 'none' };

  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={animated ? { perspective: '400px' } : {}}
    >
      <defs>
        <linearGradient id="gradTeal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="1" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="gradIndigo" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="1" />
          <stop offset="100%" stopColor="#312e81" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="gradWhite" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="gradPageFlip" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
        </linearGradient>
        <radialGradient id="gradFlash" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="40%" stopColor="#2dd4bf" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
        </radialGradient>
        <filter id="beamBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
      </defs>
      
      {/* Left Book Page (Teal) */}
      <path 
        d="M 15 30 Q 30 25, 50 35 L 50 85 Q 30 75, 15 80 Z" 
        fill="url(#gradTeal)" 
      />
      
      {/* Right Book Page (Indigo) */}
      <path 
        d="M 85 30 Q 70 25, 50 35 L 50 85 Q 70 75, 85 80 Z" 
        fill="url(#gradIndigo)" 
      />
      
      {/* Center Fold Highlight */}
      <path 
        d="M 48 35 L 52 35 L 52 85 L 48 85 Z" 
        fill="#ffffff" 
        opacity="0.5"
      />

      {/* Flipping Page (Semi-transparent white) */}
      {animated && (
        <path 
          d="M 85 30 Q 70 25, 50 35 L 50 85 Q 70 75, 85 80 Z" 
          fill="url(#gradPageFlip)" 
          style={flippingPageStyle}
        />
      )}

      {/* Sleek Checkmark (Single Stroke) */}
      <path 
        d="M 32 55 L 45 68 L 75 30" 
        fill="none"
        stroke="url(#gradWhite)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={checkmarkStyle}
      />

      {/* Flash of Light / Destello de luz */}
      {animated && (
        <g style={flashStyle}>
          <circle cx="75" cy="30" r="12" fill="url(#gradFlash)" />
          <ellipse cx="75" cy="30" rx="26" ry="1.5" fill="#ffffff" opacity="0.8" filter="url(#beamBlur)" />
          <ellipse cx="75" cy="30" rx="1.5" ry="26" fill="#ffffff" opacity="0.8" filter="url(#beamBlur)" />
        </g>
      )}
    </svg>
  );
}
