'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, Send, Trash2, Video, Square, Zap, ZapOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from './LanguageProvider';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onPostToFeed?: (file: File) => void;
}

export function CameraModal({ isOpen, onClose, onCapture, onPostToFeed }: CameraModalProps) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startCamera = async (currentMode: string, currentFacingMode: string) => {
    try {
      setCameraError(null);
      
      // Stop existing stream if we're switching
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      const constraints = {
        video: { facingMode: currentFacingMode },
        audio: currentMode === 'video'
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setCameraError(t('modals.cameraAccessError') || 'Camera access denied');
    }
  };

  useEffect(() => {
    let isMounted = true;

    if (isOpen && !capturedFile) {
      const init = async () => {
        await new Promise(r => setTimeout(r, 300));
        if (isMounted) {
          startCamera(mode, facingMode);
        }
      };
      init();
    }

    return () => {
      isMounted = false;
    };
    // We explicitly omit mode and facingMode here to prevent re-triggering unless they change. 
    // Actually we only want to restart if they change. Let's handle stream cleanup.
  }, [isOpen, capturedFile, mode, facingMode, t]);

  // Handle stream cleanup when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      resetState();
    }
  }, [isOpen]); // only on isOpen change

  // Handle stream cleanup when dependencies change (like mode/facingMode)
  // We can do this by using a ref to track the active stream
  const activeStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    activeStreamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    // When component unmounts, clean up everything
    return () => {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // When stream updates or video remounts, attach to video
  useEffect(() => {
    if (videoRef.current && stream && !capturedFile && isOpen) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(playErr => {
        console.warn('Auto-play failed:', playErr);
      });
    }
  }, [stream, capturedFile, isOpen]);

  const resetState = () => {
    setCapturedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setIsRecording(false);
    setRecordingSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const takePhoto = () => {
    if (!videoRef.current || videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(videoRef.current, 0, 0);
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setCapturedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      
      // Flash effect
      setFlash(true);
      setTimeout(() => setFlash(false), 100);
    }, 'image/jpeg', 0.9);
  };

  const startRecording = () => {
    if (!stream) return;
    
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorderRef.current = mediaRecorder;
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const file = new File([blob], `video_${Date.now()}.webm`, { type: 'video/webm' });
      setCapturedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    };
    
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordingSeconds(prev => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleDone = () => {
    if (capturedFile) {
      onCapture(capturedFile);
      onClose();
    }
  };

  const handlePostToFeed = () => {
    if (capturedFile && onPostToFeed) {
      onPostToFeed(capturedFile);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center overflow-hidden"
      >
        {/* Flash Effect Overlay */}
        {flash && <div className="absolute inset-0 bg-white z-[110]" />}

        {/* Camera Error */}
        {cameraError && (
          <div className="p-6 text-center text-white">
            <p className="mb-4">{cameraError}</p>
            <button 
              onClick={onClose}
              className="px-6 py-2 bg-neutral-800 rounded-full font-medium"
            >
              {t('common.close')}
            </button>
          </div>
        )}

        {!cameraError && (
          <div className="relative w-full h-full flex flex-col">
            {/* Header */}
            <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/50 to-transparent">
              <button 
                onClick={onClose}
                className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
              
              {!capturedFile && (
                <div className="flex bg-black/30 rounded-full p-1 backdrop-blur-sm">
                  <button 
                    onClick={() => setMode('photo')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === 'photo' ? 'bg-white text-black' : 'text-white/70'}`}
                  >
                    {t('modals.photo')}
                  </button>
                  <button 
                    onClick={() => setMode('video')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === 'video' ? 'bg-white text-black' : 'text-white/70'}`}
                  >
                    {t('modals.video')}
                  </button>
                </div>
              )}
              
              <div className="w-10" /> {/* Spacer */}
            </div>

            {/* Content / Preview */}
            <div className="flex-1 relative flex items-center justify-center bg-black">
              {!capturedFile ? (
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline 
                  webkit-playsinline="true"
                  muted 
                  className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                  onLoadedMetadata={(e) => {
                    const video = e.target as HTMLVideoElement;
                    video.play().catch(console.warn);
                  }}
                />
              ) : (
                previewUrl && (
                  capturedFile.type.startsWith('video/') ? (
                    <video src={previewUrl} autoPlay loop muted className="w-full h-full object-contain" />
                  ) : (
                    <img src={previewUrl} alt="Captured" className="w-full h-full object-contain" />
                  )
                )
              )}

              {isRecording && (
                <div className="absolute top-20 flex items-center gap-2 bg-red-600 text-white px-4 py-1.5 rounded-full font-mono font-medium animate-pulse shadow-lg">
                  <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                  {formatTime(recordingSeconds)}
                </div>
              )}
            </div>

            {/* Control Bar */}
            {!capturedFile ? (
              <div className="p-10 flex items-center justify-around z-10 bg-gradient-to-t from-black/50 to-transparent pb-[max(2.5rem,env(safe-area-inset-bottom))]">
                <button 
                  onClick={switchCamera}
                  disabled={isRecording}
                  className="p-4 text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-30"
                >
                  <RefreshCw size={28} />
                </button>

                <div className="relative">
                  {mode === 'photo' ? (
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      onClick={takePhoto}
                      className="w-20 h-20 bg-white rounded-full flex items-center justify-center border-4 border-white/30"
                    >
                      <Camera size={40} className="text-black" />
                    </motion.button>
                  ) : (
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`w-20 h-20 rounded-full flex items-center justify-center border-4 ${isRecording ? 'bg-red-600 border-red-600/30' : 'bg-white border-white/30'}`}
                    >
                      {isRecording ? <Square size={32} fill="white" className="text-white" /> : <Video size={40} className="text-black" />}
                    </motion.button>
                  )}
                </div>

                <div className="w-16" /> {/* Placeholder */}
              </div>
            ) : (
              <div className="p-8 pb-[max(2rem,env(safe-area-inset-bottom))] flex flex-col gap-6 z-10 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <button 
                    onClick={resetState}
                    className="flex items-center gap-2 px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full transition-colors font-medium border border-neutral-700"
                  >
                    <Trash2 size={18} /> {t('modals.retake')}
                  </button>
                  
                  <div className="flex gap-3">
                    {onPostToFeed && (
                      <button 
                        onClick={handlePostToFeed}
                        className="flex items-center gap-2 px-6 py-2.5 bg-neutral-100 hover:bg-white text-neutral-900 rounded-full transition-colors font-semibold"
                      >
                         {t('modals.postToFeed')}
                      </button>
                    )}
                    <button 
                      onClick={handleDone}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors font-semibold shadow-lg shadow-indigo-600/20"
                    >
                      <Send size={18} /> {t('common.send') || 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
