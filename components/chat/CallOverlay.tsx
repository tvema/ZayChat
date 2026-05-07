'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { PhoneOff, Video, VideoOff, Phone, Play, MonitorUp, MonitorOff, RefreshCw } from 'lucide-react';
import { User } from '@/types/chat';
import { useLanguage } from '../LanguageProvider';

interface CallOverlayProps {
  callState: 'idle' | 'calling' | 'receiving' | 'connected';
  callPeerId: string | null;
  contacts: User[];
  isVideoEnabled: boolean;
  isMediaActive: boolean;
  isPeerMediaActive: boolean;
  isPeerVideoActive: boolean;
  remoteStreamVersion: number;
  isScreenSharing: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  toggleScreenShare: () => void;
  toggleVideo: () => void;
  switchCamera: () => void;
  facingMode: 'user' | 'environment';
  endCall: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  reportMediaActive: () => void;
  reportMediaStatus: (status: { video: boolean, audio: boolean }) => void;
}

export function CallOverlay({
  callState,
  callPeerId,
  contacts,
  isVideoEnabled,
  isMediaActive,
  isPeerMediaActive,
  isPeerVideoActive,
  remoteStreamVersion,
  isScreenSharing,
  localVideoRef,
  remoteVideoRef,
  localStream,
  remoteStream,
  toggleScreenShare,
  toggleVideo,
  switchCamera,
  facingMode,
  endCall,
  acceptCall,
  rejectCall,
  reportMediaActive,
  reportMediaStatus
}: CallOverlayProps) {
  const { t } = useLanguage();
  const [isRemoteVideoPlaying, setIsRemoteVideoPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const peer = contacts.find(c => c.id === callPeerId);

  const hasRemoteVideo = !!(remoteStream && remoteStream.getVideoTracks().length > 0);
  const showRemoteAvatar = !isRemoteVideoPlaying || !isPeerVideoActive || !hasRemoteVideo;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    // Start timer when connected and at least some media is flowing
    if (callState === 'connected' && (isMediaActive || isPeerMediaActive)) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else if (callState === 'idle') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState, isMediaActive, isPeerMediaActive]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (localVideoRef.current && localStream && !isScreenSharing) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      localVideoRef.current.play().catch(err => {
      });
    }
  }, [localStream, localVideoRef, isScreenSharing]);

  // Report media status periodically
  useEffect(() => {
    if (callState !== 'connected') return;

    const report = () => {
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        const audioTrack = localStream.getAudioTracks()[0];
        const status = {
          video: videoTrack ? videoTrack.enabled : false,
          audio: audioTrack ? audioTrack.enabled : true
        };
        reportMediaStatus(status);
      }
    };

    // Initial report
    report();

    const interval = setInterval(report, 3000);

    return () => clearInterval(interval);
  }, [callState, reportMediaStatus, localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      const video = remoteVideoRef.current;
      
      const currentVersion = `${remoteStream.id}-${remoteStreamVersion}`;
      if (video.dataset.version !== currentVersion) {
        // Reassign srcObject to force the browser to recognize new tracks
        // Using the original remoteStream instead of creating a new one fixes Firefox issues
        video.srcObject = null;
        video.srcObject = remoteStream;
        video.dataset.version = currentVersion;
        video.muted = false;
        video.volume = 1;
      }
      
      // Only attempt play if not already playing or if srcObject just changed
      const playVideo = async () => {
        try {
          video.load(); // Force reload the video element
          await video.play();
          setIsRemoteVideoPlaying(true);
          reportMediaActive();
        } catch (err) {
          if (err instanceof Error && err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
          }
          setIsRemoteVideoPlaying(false);
        }
      };

      playVideo();
    }
  }, [remoteStream, remoteVideoRef, reportMediaActive, remoteStreamVersion]);

  useEffect(() => {
    if (callState === 'connected' && remoteVideoRef.current) {
      const video = remoteVideoRef.current;
      
      const handlePlay = () => {
        setIsRemoteVideoPlaying(true);
        reportMediaActive();
      };
      const handlePause = () => {
        setIsRemoteVideoPlaying(false);
      };
      
      video.addEventListener('play', handlePlay);
      video.addEventListener('playing', handlePlay);
      video.addEventListener('pause', handlePause);
      
      // Try to play immediately
      video.play().catch(err => {
        if (err.name !== 'AbortError') {
          setIsRemoteVideoPlaying(false);
        }
      });
      
      return () => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('playing', handlePlay);
        video.removeEventListener('pause', handlePause);
        setIsRemoteVideoPlaying(false);
      };
    }
  }, [callState, remoteVideoRef, reportMediaActive]);

  if (callState === 'idle') return null;

  const handleRemoteVideoClick = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.load();
      remoteVideoRef.current.play().then(() => {
        setIsRemoteVideoPlaying(true);
      }).catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[CallOverlay] Manual play failed:', err);
        }
      });
    }
  };

  const handleRefreshCall = () => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = null;
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.load();
      remoteVideoRef.current.play().catch(err => {
      });
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-neutral-900 flex flex-col items-center justify-center"
      >
        {/* Call Duration Overlay (Top Center) */}
        {callState === 'connected' && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-white font-mono text-sm tracking-wider">{formatDuration(duration)}</span>
          </div>
        )}

        {/* Remote Video (Full Screen) */}
        <div 
          className={`absolute inset-0 flex items-center justify-center overflow-hidden transition-opacity duration-500 ${callState === 'connected' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
          onClick={handleRemoteVideoClick}
        >
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className={`w-full h-full object-cover transition-opacity duration-500 ${showRemoteAvatar ? 'opacity-0 absolute' : 'opacity-100'}`}
          />
          
          {/* Fallback Avatar when remote video is not playing or disabled */}
          {(showRemoteAvatar && callState === 'connected') && (
            <div className="flex flex-col items-center gap-6">
              <div className="w-48 h-48 rounded-full bg-neutral-800 flex items-center justify-center text-6xl font-bold text-white border-4 border-neutral-700 shadow-2xl overflow-hidden relative">
                {peer?.avatar_url ? (
                  <Image 
                    src={peer.avatar_url} 
                    alt="" 
                    fill 
                    className="object-cover" 
                    referrerPolicy="no-referrer"
                    unoptimized
                  />
                ) : (
                  peer?.first_name?.[0] || '?'
                )}
              </div>
              <div className="text-center">
                <h2 className="text-3xl font-bold text-white mb-2">{peer?.first_name} {peer?.last_name}</h2>
                <p className="text-emerald-500 font-medium">{t.modals.callInProgress} {formatDuration(duration)}</p>
              </div>
            </div>
          )}

          {showRemoteAvatar && callState === 'connected' && (
            <div className="absolute bottom-32 z-10 flex flex-col items-center justify-center cursor-pointer">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-2 animate-pulse" onClick={handleRemoteVideoClick}>
                <Play className="w-8 h-8 text-white fill-white" />
              </div>
              <p className="text-white/60 text-sm">{t.modals.tapToStartVideo}</p>
            </div>
          )}
        </div>

        {/* Placeholder / Calling UI */}
        {callState !== 'connected' && (
          <div className="relative z-20 flex flex-col items-center gap-6">
            <div className="w-32 h-32 rounded-full bg-neutral-800 flex items-center justify-center text-4xl font-bold text-white border-4 border-neutral-700 shadow-2xl overflow-hidden relative">
              {peer?.avatar_url ? (
                <Image 
                  src={peer.avatar_url} 
                  alt="" 
                  fill 
                  className="object-cover" 
                  referrerPolicy="no-referrer"
                  unoptimized
                />
              ) : (
                peer?.first_name?.[0] || '?'
              )}
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">{peer?.first_name} {peer?.last_name}</h2>
              <p className="text-neutral-400 animate-pulse">
                {callState === 'calling' ? t.modals.calling : 
                 callState === 'receiving' ? t.modals.incomingCall : 
                 t.modals.connecting} {formatDuration(duration)}
              </p>
            </div>
          </div>
        )}

        {/* Local Video (Picture in Picture) */}
        <motion.div 
          drag
          dragConstraints={{ left: -200, right: 20, top: -20, bottom: 200 }}
          className="absolute top-4 right-4 md:top-6 md:right-6 w-24 sm:w-32 md:w-48 aspect-[3/4] bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-30"
        >
          <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`w-full h-full object-cover origin-center ${facingMode === 'user' ? '-scale-x-100' : ''}`}
          />
          {!isVideoEnabled && (
            <div className="absolute inset-0 bg-neutral-800 flex items-center justify-center">
              <VideoOff className="w-8 h-8 text-neutral-500" />
            </div>
          )}
        </motion.div>

        {/* Controls */}
        <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-6 z-40">
          {callState === 'receiving' ? (
            <>
              <button 
                onClick={() => acceptCall()}
                className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-all shadow-xl hover:scale-110 active:scale-95"
              >
                <Phone className="w-8 h-8" />
              </button>
              <button 
                onClick={() => rejectCall()}
                className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-xl hover:scale-110 active:scale-95"
              >
                <PhoneOff className="w-8 h-8" />
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => switchCamera()}
                className="w-14 h-14 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all shadow-lg hover:scale-110 active:scale-95 md:hidden"
                title="Switch Camera"
              >
                <RefreshCw className="w-6 h-6" />
              </button>
              <button 
                onClick={() => handleRefreshCall()}
                className="w-14 h-14 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all shadow-lg hover:scale-110 active:scale-95 hidden md:flex"
                title={t.modals.refreshCall || "Refresh call"}
              >
                <RefreshCw className="w-6 h-6" />
              </button>
              <button 
                onClick={() => toggleScreenShare()}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110 active:scale-95 ${isScreenSharing ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-white/10 text-white hover:bg-white/20'}`}
                title={isScreenSharing ? t.modals.stopScreenShare || "Stop screen sharing" : t.modals.startScreenShare || "Start screen sharing"}
              >
                {isScreenSharing ? <MonitorOff className="w-6 h-6" /> : <MonitorUp className="w-6 h-6" />}
              </button>
              <button 
                onClick={() => toggleVideo()}
                disabled={isScreenSharing}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110 active:scale-95 ${isScreenSharing ? 'bg-neutral-700 text-neutral-500 opacity-50 cursor-not-allowed' : isVideoEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white hover:bg-red-600'}`}
              >
                {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
              </button>
              <button 
                onClick={() => endCall()}
                className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-xl hover:scale-110 active:scale-95"
              >
                <PhoneOff className="w-8 h-8" />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
