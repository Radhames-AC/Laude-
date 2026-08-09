import React, { useEffect, useRef, useState } from 'react';

interface VisualInspectorProps {
  /** The child function that receives the constraint state */
  children: (isConstrained: boolean) => React.ReactNode;
  /** The minimum width in pixels before the container is considered constrained */
  minWidth?: number;
  /** Optional class name for the wrapper div */
  className?: string;
}

/**
 * Visual Inspector
 * 
 * An automatic mechanism that observes the actual rendered dimensions of its container.
 * If the container shrinks below the specified `minWidth` (e.g., when the screen is small 
 * or sidebars compress the view, causing dropdowns to become illegible), it triggers
 * a constrained state, allowing the nested components to adapt their layout (e.g., stacking vertically).
 */
export function VisualInspector({ 
  children, 
  minWidth = 300,
  className = ""
}: VisualInspectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isConstrained, setIsConstrained] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Check if the container's width has dropped below the threshold
        if (entry.contentRect.width < minWidth) {
          setIsConstrained(true);
        } else {
          setIsConstrained(false);
        }
      }
    });

    observer.observe(containerRef.current);
    
    return () => observer.disconnect();
  }, [minWidth]);

  return (
    <div ref={containerRef} className={`visual-inspector-wrapper min-w-0 ${className}`}>
      {children(isConstrained)}
    </div>
  );
}
