'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'motion/react';
import { X, ZoomIn, ZoomOut, RotateCw, Download, Reply, Forward } from 'lucide-react';

export const ImageViewer = ({ src, alt, onClose }: { src: string, alt: string, onClose: () => void }) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isZooming, setIsZooming] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  
  const isDraggingRef = useRef(false);

  useEffect(() => {
    // Add hash to URL if it's not already there
    const originalHash = window.location.hash;
    const hasViewerHash = window.location.hash.includes('viewer');
    
    if (!hasViewerHash) {
      window.history.pushState(null, '', window.location.href + (originalHash ? (originalHash.includes('-viewer') ? '' : '-viewer') : '#viewer'));
    }

    const handlePopState = () => {
      if (!window.location.hash.includes('viewer')) {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onClose]);

  const handleClose = useCallback(() => {
    if (window.location.hash.includes('viewer')) {
      window.history.back();
    }
    onClose();
  }, [onClose]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const updateZoom = useCallback((ratio: number, cx: number, cy: number) => {
    setScale(s => {
      const newScale = Math.max(0.5, Math.min(8, s * ratio));
      if (newScale !== s) {
        const ww = window.innerWidth;
        const wh = window.innerHeight;
        
        const dx = cx - ww / 2 - x.get();
        const dy = cy - wh / 2 - y.get();
        
        const scaleFactor = newScale / s;
        
        const newDx = dx * scaleFactor;
        const newDy = dy * scaleFactor;
        
        x.set(x.get() - (newDx - dx));
        y.set(y.get() - (newDy - dy));
      }
      return newScale;
    });
  }, [x, y]);

  const handleZoomIn = useCallback(() => updateZoom(1.5, window.innerWidth / 2, window.innerHeight / 2), [updateZoom]);
  const handleZoomOut = useCallback(() => updateZoom(1 / 1.5, window.innerWidth / 2, window.innerHeight / 2), [updateZoom]);
  const handleRotate = useCallback(() => setRotation(r => (r + 90) % 360), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) return;
    const delta = e.deltaY;
    const ratio = delta < 0 ? 1.1 : 1 / 1.1;
    updateZoom(ratio, e.clientX, e.clientY);
  }, [updateZoom]);

  // Touch handling for pinch to zoom
  const lastTouchDist = useRef<number | null>(null);
  const lastPinchCenter = useRef<{x: number, y: number} | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setIsZooming(true);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDist.current = dist;
      
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      lastPinchCenter.current = { x: cx, y: cy };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDist.current !== null && lastPinchCenter.current !== null) {
      if (e.cancelable) e.preventDefault();
      
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      
      const ratio = dist / lastTouchDist.current;
      const dampedRatio = Math.pow(ratio, 0.75); // Apply slight damping

      if (dampedRatio !== 1) {
        updateZoom(dampedRatio, cx, cy);
      }
      
      const deltaX = cx - lastPinchCenter.current.x;
      const deltaY = cy - lastPinchCenter.current.y;
      
      if (deltaX !== 0 || deltaY !== 0) {
        x.set(x.get() + deltaX);
        y.set(y.get() + deltaY);
      }
      
      lastTouchDist.current = dist;
      lastPinchCenter.current = { x: cx, y: cy };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent | React.PointerEvent) => {
    if ('touches' in e && e.touches.length < 2) {
      setIsZooming(false);
      lastTouchDist.current = null;
      lastPinchCenter.current = null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, handleZoomIn, handleZoomOut]);

  const downloadImage = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = alt || 'image';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (isDraggingRef.current) return;
    if (scale !== 1 || x.get() !== 0 || y.get() !== 0) {
      setScale(1);
      x.set(0);
      y.set(0);
      setRotation(0);
    } else {
      setScale(2);
    }
  };

  useEffect(() => {
    if (scale === 1) {
      x.set(0);
      y.set(0);
    }
  }, [scale, x, y]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="image-viewer-overlay fixed inset-0 z-[100] bg-black/95 flex items-center justify-center overflow-hidden touch-none"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={handleClick}
    >
      {/* Top Controls */}
      <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/60 to-transparent">
        <div className="text-white/90 text-sm font-medium truncate max-w-[60%]">
          {alt}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); downloadImage(); }}
            className="p-2.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
            title="Download"
          >
            <Download size={20} />
          </button>
          
          <div className="w-px h-6 bg-white/20 mx-1" />

          {/* Added Reply/Forward for easy access on mobile */}
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              handleClose();
              window.dispatchEvent(new CustomEvent('image-viewer-action', { detail: { action: 'reply' } }));
            }}
            className="p-2.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
            title="Reply"
          >
            <Reply size={20} />
          </button>
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              handleClose();
              window.dispatchEvent(new CustomEvent('image-viewer-action', { detail: { action: 'forward' } }));
            }}
            className="p-2.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
            title="Forward"
          >
            <Forward size={20} />
          </button>

          <div className="w-px h-6 bg-white/20 mx-1" />

          <button 
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="p-2.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Image Area */}
      <div 
        className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden"
      >
        <motion.div
           drag={!isZooming}
           dragMomentum={false}
           onDragStart={() => isDraggingRef.current = true}
           onDragEnd={() => {
             setTimeout(() => {
               isDraggingRef.current = false;
             }, 50);
           }}
           style={{ scale, rotate: rotation, x, y }}
           className="relative"
        >
          <img 
            ref={imageRef}
            src={src} 
            alt={alt}
            draggable={false}
            className="max-w-[95vw] max-h-[85vh] object-contain pointer-events-none select-none"
          />
        </motion.div>
      </div>

      {/* Bottom Controls */}
      <div 
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 backdrop-blur-md p-1.5 rounded-2xl z-10 border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={handleZoomOut} 
          className="p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          disabled={scale <= 0.5}
        >
          <ZoomOut size={20} />
        </button>
        
        <div className="px-4 text-white/90 text-sm font-mono font-medium min-w-[70px] text-center select-none">
          {Math.round(scale * 100)}%
        </div>
        
        <button 
          onClick={handleZoomIn} 
          className="p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          disabled={scale >= 5}
        >
          <ZoomIn size={20} />
        </button>
        
        <div className="w-px h-6 bg-white/10 mx-1" />
        
        <button 
          onClick={handleRotate} 
          className="p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
        >
          <RotateCw size={20} />
        </button>
      </div>
    </motion.div>
  );
};
