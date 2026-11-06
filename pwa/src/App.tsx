import React, { useState, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { Canvas, CanvasHandle } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { ColorPickerModal } from './components/ColorPickerModal';
import { BrushPickerModal } from './components/BrushPickerModal';
import { TextModal } from './components/TextModal';
import { StickerTrayModal, PlaceStickerOptions } from './components/StickerTrayModal';
import { PreviewModal } from './components/PreviewModal';
import { AuthModal } from './components/AuthModal';
import { 
  ToolType, 
  StickerTrayTab,
  CanvasTextNote, 
  CanvasSticker, 
  GenerateResult, 
  PublishResult, 
  AuthState 
} from './types';
import { callGenerateApi, callPublishApi } from './services/workerClient';
import { initFirebase, getFirebaseAuth } from './config/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export const App: React.FC = () => {
  const canvasRef = useRef<CanvasHandle>(null);

  // Drawing tool state
  const [currentTool, setCurrentTool] = useState<ToolType>('brush');
  const [brushColor, setBrushColor] = useState<string>('#0f172a');
  const [brushSize, setBrushSize] = useState<number>(8);

  // Canvas elements state (starts empty without hardcoded notes)
  const [textNotes, setTextNotes] = useState<CanvasTextNote[]>([]);
  const [stickers, setStickers] = useState<CanvasSticker[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Modal open states
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isBrushPickerOpen, setIsBrushPickerOpen] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [isStickerTrayOpen, setIsStickerTrayOpen] = useState(false);
  const [stickerTrayTab, setStickerTrayTab] = useState<StickerTrayTab>('gifs');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // API Execution states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [errorNotification, setErrorNotification] = useState<string | null>(null);

  // Auth state
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    idToken: null,
  });

  // Get a fresh ID token at request time (prevents 1-hour expiration 401s)
  const getFreshIdToken = async (): Promise<string | null> => {
    const auth = getFirebaseAuth();
    if (auth?.currentUser) {
      try {
        const freshToken = await auth.currentUser.getIdToken();
        if (freshToken !== authState.idToken) {
          setAuthState((prev) => ({ ...prev, idToken: freshToken }));
        }
        return freshToken;
      } catch (e) {
        console.warn('Failed to retrieve fresh Firebase ID token:', e);
      }
    }
    return authState.idToken;
  };

  // Listen to Firebase Auth state changes
  useEffect(() => {
    initFirebase();
    const auth = getFirebaseAuth();
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setAuthState({
          isAuthenticated: true,
          user: {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          },
          idToken,
        });
      } else {
        setAuthState({
          isAuthenticated: false,
          user: null,
          idToken: null,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateAuthState = (newAuth: AuthState) => {
    setAuthState(newAuth);
  };

  const handleStrokeCountChange = React.useCallback((undoAvailable: boolean, redoAvailable: boolean) => {
    setCanUndo(undoAvailable);
    setCanRedo(redoAvailable);
  }, []);

  // Add text note to canvas
  const handleAddTextNote = (noteData: Omit<CanvasTextNote, 'id' | 'x' | 'y'>) => {
    const dims = canvasRef.current?.getDimensions?.() || { width: 390, height: 600 };
    const noteWidth = 140;
    const centerX = Math.max(10, Math.round((dims.width - noteWidth) / 2));
    const newNote: CanvasTextNote = {
      ...noteData,
      id: Math.random().toString(36).substring(2, 9),
      x: centerX,
      y: 100 + (textNotes.length % 6) * 45,
    };
    setTextNotes((prev) => [...prev, newNote]);
  };

  const handleUpdateTextNote = React.useCallback((id: string, updates: Partial<CanvasTextNote>) => {
    setTextNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
  }, []);

  const handleDeleteTextNote = React.useCallback((id: string) => {
    setTextNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Add photo, GIF, sticker, or washi tape to canvas
  const handlePlacePhoto = (photoUrl: string, options?: PlaceStickerOptions) => {
    const dims = canvasRef.current?.getDimensions?.() || { width: 390, height: 600 };
    const stickerWidth = options?.width || 140;
    const stickerHeight = options?.height || 140;
    const centerX = Math.max(10, Math.round((dims.width - stickerWidth) / 2));
    const baseY = Math.max(40, Math.round((dims.height - stickerHeight) / 2));
    const stagger = (stickers.length % 5) * 15;

    const newSticker: CanvasSticker = {
      id: Math.random().toString(36).substring(2, 9),
      url: photoUrl,
      x: centerX,
      y: baseY + stagger,
      width: stickerWidth,
      height: stickerHeight,
      rotation: 0, // Upright, no automatic tilt or offset
      kind: options?.kind,
      label: options?.label,
    };
    setStickers((prev) => [...prev, newSticker]);
  };

  const handleUpdateSticker = React.useCallback((id: string, updates: Partial<CanvasSticker>) => {
    setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  const handleDeleteSticker = React.useCallback((id: string) => {
    setStickers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Vibecode Generation Action
  const handleVibecode = async () => {
    const currentToken = await getFreshIdToken();
    if (!authState.isAuthenticated || !currentToken) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!canvasRef.current) return;

    setIsGenerating(true);
    setPublishResult(null);

    try {
      const snapshotBase64 = await canvasRef.current.exportSnapshot();
      const imageUrls = Array.from(
        new Set(
          stickers
            .filter((s) => s.url.startsWith('https://'))
            .map((s) => s.url)
        )
      ).slice(0, 20);

      const noteLines = textNotes.map((n) => n.text);
      for (const s of stickers) {
        if ((s.kind === 'sticker' || s.kind === 'washi') && s.label) {
          noteLines.push(`[Decorative ${s.kind}: ${s.label}]`);
        }
      }
      const notes = noteLines.join('\n').slice(0, 4000);

      const result = await callGenerateApi({
        snapshotBase64,
        imageUrls,
        notes,
        idToken: currentToken,
      });

      setGenerateResult(result);
      setIsPreviewModalOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ [PWA Generation Error]:', err);
      setErrorNotification(`Oops! Your nerd got a little confused: ${message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // One-Click Publish Action
  const handlePublish = async () => {
    const currentToken = await getFreshIdToken();
    if (!generateResult || !currentToken) return;

    setIsPublishing(true);
    try {
      const result = await callPublishApi({
        html: generateResult.html,
        commitMessage: '🎨 Doodlebug: new layout coded by your nerd',
        idToken: currentToken,
      });
      setPublishResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ [PWA Publish Error]:', err);
      setErrorNotification(`Oops! Your nerd had trouble publishing: ${message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-butter select-none">
      
      {/* Top Navigation & Actions Bar */}
      <Header
        onVibecode={handleVibecode}
        isGenerating={isGenerating}
        authState={authState}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      {/* Core Retro Drawing Canvas Pad - Mobile First Viewport */}
      <main className="flex-1 relative overflow-hidden flex flex-col items-center justify-center bg-butter sm:bg-stone-100 sm:p-2">
        <div className="w-full max-w-[430px] h-full relative overflow-hidden flex flex-col bg-butter sm:rounded-3xl sm:border sm:border-stone-300 sm:shadow-retro">
          <Canvas
            ref={canvasRef}
            currentTool={currentTool}
            brushColor={brushColor}
            brushSize={brushSize}
            textNotes={textNotes}
            stickers={stickers}
            onUpdateTextNote={handleUpdateTextNote}
            onDeleteTextNote={handleDeleteTextNote}
            onUpdateSticker={handleUpdateSticker}
            onDeleteSticker={handleDeleteSticker}
            onStrokeCountChange={handleStrokeCountChange}
          />
        </div>
      </main>

      {/* Thumb-Friendly Bottom Mobile Toolbar */}
      <Toolbar
        currentTool={currentTool}
        onSelectTool={setCurrentTool}
        brushColor={brushColor}
        brushSize={brushSize}
        onOpenColorPicker={() => setIsColorPickerOpen(true)}
        onOpenBrushPicker={() => setIsBrushPickerOpen(true)}
        onOpenTextModal={() => setIsTextModalOpen(true)}
        onOpenStickerTray={(tab = 'gifs') => {
          setStickerTrayTab(tab);
          setIsStickerTrayOpen(true);
        }}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => canvasRef.current?.undo()}
        onRedo={() => canvasRef.current?.redo()}
        onClear={() => {
          canvasRef.current?.clearCanvas();
          setTextNotes([]);
          setStickers([]);
        }}
      />

      {/* Modals */}
      <ColorPickerModal
        isOpen={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        selectedColor={brushColor}
        onSelectColor={setBrushColor}
      />

      <BrushPickerModal
        isOpen={isBrushPickerOpen}
        onClose={() => setIsBrushPickerOpen(false)}
        currentSize={brushSize}
        onSelectSize={setBrushSize}
        color={brushColor}
      />

      <TextModal
        isOpen={isTextModalOpen}
        onClose={() => setIsTextModalOpen(false)}
        onAddTextNote={handleAddTextNote}
        defaultColor={brushColor}
      />

      <StickerTrayModal
        isOpen={isStickerTrayOpen}
        onClose={() => setIsStickerTrayOpen(false)}
        onPlacePhoto={handlePlacePhoto}
        attachedUrls={stickers.map((s) => s.url)}
        initialTab={stickerTrayTab}
      />


      <PreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        result={generateResult}
        onPublish={handlePublish}
        isPublishing={isPublishing}
        publishResult={publishResult}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        authState={authState}
        onUpdateAuthState={handleUpdateAuthState}
      />

      {/* Nerd Building Webpage Loading Screen with Animated GIF */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-white rounded-3xl border-2 border-pink-200 shadow-2xl p-6 sm:p-8 max-w-sm w-full flex flex-col items-center text-center">
            <div className="relative mb-4">
              <img
                src="https://media1.tenor.com/m/IVh7YxGaB_4AAAAC/nerd-emoji.gif"
                alt="Your nerd is coding your webpage"
                className="w-32 h-32 rounded-2xl object-contain shadow-sm border border-stone-200"
              />
              <span className="absolute -bottom-2 -right-2 text-2xl">💻</span>
            </div>
            <h3 className="font-extrabold text-slate-900 text-lg sm:text-xl mb-1.5 flex items-center justify-center gap-1.5">
              <span>Your nerd is coding!</span>
              <span>🤓</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Turning your cute drawing and photos into a real webpage for you...
            </p>
          </div>
        </div>
      )}

      {/* Floating Error Notification Toast */}
      {errorNotification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-lg w-full px-4 animate-fade-in pointer-events-auto">
          <div className="bg-rose-50 border border-rose-300 text-rose-800 p-3.5 rounded-2xl shadow-retro flex items-start justify-between gap-3 text-xs">
            <div className="flex items-start gap-2 max-h-56 overflow-y-auto pr-1">
              <span className="text-base flex-shrink-0 mt-0.5">⚠️</span>
              <span className="font-medium break-words leading-relaxed select-text">{errorNotification}</span>
            </div>
            <button
              onClick={() => setErrorNotification(null)}
              className="p-1 rounded-lg hover:bg-rose-100 text-rose-600 transition-colors font-bold flex-shrink-0"
              title="Dismiss error"
            >
              ✕
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
