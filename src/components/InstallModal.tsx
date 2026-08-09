import React, { useState, useEffect } from 'react';
import { Download, X, AlertTriangle } from 'lucide-react';

interface InstallModalProps {
  deferredPrompt: any;
  onClose: () => void;
}

export default function InstallModal({ deferredPrompt, onClose }: InstallModalProps) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [browserType, setBrowserType] = useState<'chrome' | 'safari' | 'other'>('other');
  const [hasDismissed, setHasDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone);
    setIsStandalone(isPWA);

    // Detect browser
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /ipad|iphone|ipod/.test(userAgent) && !(window as any).MSStream;
    const isSafari = isIOS && /webkit/.test(userAgent) && !/crios/.test(userAgent);
    
    if (/chrome|crios/.test(userAgent)) {
      setBrowserType('chrome');
    } else if (isSafari) {
      setBrowserType('safari');
    } else {
      setBrowserType('other');
    }
  }, []);

  if (isStandalone || hasDismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      setHasDismissed(true);
      onClose();
    }
  };

  const handleDismiss = () => {
    setHasDismissed(true);
    onClose();
  };

  // If we have a prompt or if it is iOS Safari (where users can natively install via Share),
  // we might want to guide them. But the user asked to suggest Google Chrome if it's an uninstallable browser.
  // We'll consider Chrome (with deferredPrompt) installable.
  // Wait, if it's Chrome but no prompt yet, maybe it's still loading the event.
  // Let's assume if it's 'other', we suggest Chrome.
  // Actually, we should probably evaluate if !deferredPrompt && browserType !== 'safari'.

  const showChromeSuggestion = !deferredPrompt && browserType !== 'chrome' && browserType !== 'safari';

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-indigo-600 p-6 text-center relative">
          <button 
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Download size={32} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Install Teacher's app</h2>
          <p className="text-indigo-100 text-sm">
            Get quick access from your device's home screen and work offline.
          </p>
        </div>
        
        <div className="p-6">
          {deferredPrompt ? (
            <div className="space-y-4">
              <button 
                onClick={handleInstallClick}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Download size={20} />
                <span>Install Now</span>
              </button>
            </div>
          ) : browserType === 'safari' ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-slate-600 font-medium pb-2 border-b border-slate-100">
                To install on iOS:
              </p>
              <div className="flex items-center justify-center gap-3 text-sm text-slate-700">
                <span>1. Tap the <strong>Share</strong> button</span>
              </div>
              <div className="flex items-center justify-center gap-3 text-sm text-slate-700">
                <span>2. Select <strong>Add to Home Screen</strong></span>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="bg-amber-50 text-amber-800 p-4 rounded-xl border border-amber-200">
                <div className="flex justify-center mb-2">
                  <AlertTriangle size={24} className="text-amber-600" />
                </div>
                <h3 className="font-semibold mb-1">Your browser may not support installation</h3>
                <p className="text-sm opacity-90">
                  For the best experience and to install this app on your device, we recommend using <strong>Google Chrome</strong>.
                </p>
              </div>
            </div>
          )}
          
          <div className="mt-4 text-center">
            <button 
              onClick={handleDismiss}
              className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
