import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Socket } from 'socket.io-client';
import { saveFile, getFile } from '@/lib/db';
import { useGlobalModal } from '@/components/GlobalModalProvider';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.ekiga.net' },
  { urls: 'stun:stun.ideasip.com' },
  { urls: 'stun:stun.schlund.de' },
  { urls: 'stun:stun.voiparound.com' },
  { urls: 'stun:stun.voipbuster.com' },
  { urls: 'stun:stun.voipstunt.com' },
  { urls: 'stun:stun.voxgratia.org' },
];

export function useWebRTC(
  socket: Socket | null
) {
  const { showAlert } = useGlobalModal();
  const [callState, setCallState_] = useState<'idle' | 'calling' | 'receiving' | 'connected'>('idle');
  const [callPeerId, setCallPeerId_] = useState<string | null>(null);
  const [autoAnswerPeerId, setAutoAnswerPeerId] = useState<string | null>(null);
  const callStateRef = useRef(callState);
  const callPeerIdRef = useRef(callPeerId);

  const setCallState = useCallback((state: 'idle' | 'calling' | 'receiving' | 'connected') => {
    console.log(`[Call WebRTC] State transition: ${callStateRef.current} -> ${state}`);
    callStateRef.current = state;
    setCallState_(state);
  }, []);

  const setCallPeerId = useCallback((id: string | null) => {
    callPeerIdRef.current = id;
    setCallPeerId_(id);
  }, []);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMediaActive, setIsMediaActive] = useState(false);
  const [isPeerMediaActive, setIsPeerMediaActive] = useState(false);
  const [isPeerVideoActive, setIsPeerVideoActive] = useState(true);
  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callPcRef = useRef<RTCPeerConnection | null>(null);
  const callCandidatesRef = useRef<any[]>([]);
  const callOfferRef = useRef<any | null>(null);
  const callAnswerRef = useRef<any | null>(null);
  const isSettingUpPcRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRejectedCallRef = useRef<string | null>(null);

  const reportMediaActive = useCallback(() => {
    if (callPeerIdRef.current && socket) {
      socket.emit('webrtc:media_active', { targetId: callPeerIdRef.current });
    }
    // Update state only if it was false to minimize re-renders
    setIsMediaActive(prev => {
      if (!prev) return true;
      return prev;
    });
  }, [socket]);

  const reportMediaStatus = useCallback((status: { video: boolean, audio: boolean }) => {
    const target = callPeerIdRef.current;
    if (target && socket) {
      socket.emit('webrtc:media_status', { targetId: target, status });
    }
  }, [socket]);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const incomingFiles = useRef<Map<string, { chunks: ArrayBuffer[], receivedSize: number, totalSize: number, mime: string, name: string }>>(new Map());
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const fileSendQueue = useRef<Map<string, { fileId: string, blob: Blob }[]>>(new Map());
  const isSending = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    // Refs managed by useCallback
  }, []);

  const initAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const stopCallSound = useCallback(() => {
    if (soundIntervalRef.current) {
      clearInterval(soundIntervalRef.current);
      soundIntervalRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      audioCtxRef.current.suspend().catch(console.error);
    }
  }, []);

  const playDialingSound = useCallback(() => {
    stopCallSound();
    try {
      const ctx = initAudioCtx();
      const playBeep = () => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine'; osc1.frequency.value = 425;
        osc2.type = 'sine'; osc2.frequency.value = 475;
        osc1.connect(gain); osc2.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime + 1.0);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.1);
        osc1.start(ctx.currentTime); osc2.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 1.1); osc2.stop(ctx.currentTime + 1.1);
      };
      playBeep();
      soundIntervalRef.current = setInterval(playBeep, 4000);
    } catch (e) { console.error('Audio play error', e); }
  }, [stopCallSound]);

  const playRingingSound = useCallback(() => {
    stopCallSound();
    try {
      const ctx = initAudioCtx();
      const playRing = () => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'square'; osc1.frequency.value = 750;
        osc2.type = 'square'; osc2.frequency.value = 800;
        osc1.connect(gain); osc2.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.4);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45);
        gain.gain.setValueAtTime(0, ctx.currentTime + 0.6);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.65);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + 1.0);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.05);
        osc1.start(ctx.currentTime); osc2.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 1.1); osc2.stop(ctx.currentTime + 1.1);
      };
      playRing();
      soundIntervalRef.current = setInterval(playRing, 3000);
    } catch (e) { console.error('Audio play error', e); }
  }, [stopCallSound]);

  const processSendQueue = useCallback(function processSendQueue(peerId: string) {
    const dc = dataChannels.current.get(peerId);
    if (!dc || dc.readyState !== 'open') return;
    
    if (isSending.current.get(peerId)) return;
    
    const queue = fileSendQueue.current.get(peerId) || [];
    if (queue.length === 0) return;
    
    isSending.current.set(peerId, true);
    const { fileId, blob } = queue.shift()!;
    
    try {
      dc.send(JSON.stringify({ type: 'start', fileId, size: blob.size, mime: blob.type, name: (blob as any).name || 'file' }));
      
      const chunkSize = 16384;
      let offset = 0;
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          if (e.target?.result) {
            dc.send(e.target.result as ArrayBuffer);
            offset += chunkSize;
            if (offset < blob.size) {
              readSlice(offset);
            } else {
              dc.send(JSON.stringify({ type: 'end', fileId }));
              isSending.current.set(peerId, false);
              processSendQueue(peerId);
            }
          }
        } catch (err) {
          console.error('DataChannel send error:', err);
          isSending.current.set(peerId, false);
        }
      };
      
      const readSlice = (o: number) => {
        if (dc.bufferedAmount > 1024 * 1024) { // 1MB
          dc.bufferedAmountLowThreshold = 65536;
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            readSlice(o);
          };
          return;
        }
        const slice = blob.slice(o, o + chunkSize);
        reader.readAsArrayBuffer(slice);
        
        window.dispatchEvent(new CustomEvent('file-send-progress', { 
          detail: { 
            fileId, 
            progress: Math.round((o / blob.size) * 100),
            sent: o,
            total: blob.size
          } 
        }));
      };
      
      readSlice(0);
    } catch (err) {
      console.error('DataChannel start error:', err);
      isSending.current.set(peerId, false);
    }
  }, []);

  const setupDataChannel = useCallback((dc: RTCDataChannel, peerId: string) => {
    dc.binaryType = 'arraybuffer';
    let currentFileId: string | null = null;

    dc.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.type === 'start') {
          currentFileId = msg.fileId;
          incomingFiles.current.set(msg.fileId, {
            chunks: [],
            receivedSize: 0,
            totalSize: msg.size,
            mime: msg.mime,
            name: msg.name
          });
          
          if (msg.size === 0) {
            const blob = new Blob([], { type: msg.mime });
            incomingFiles.current.delete(msg.fileId);
            await saveFile(msg.fileId, blob);
            window.dispatchEvent(new CustomEvent('file-downloaded', { detail: { fileId: msg.fileId } }));
            currentFileId = null;
          }
        } else if (msg.type === 'end') {
          const fileData = incomingFiles.current.get(msg.fileId);
          if (fileData) {
            const blob = new Blob(fileData.chunks, { type: fileData.mime });
            incomingFiles.current.delete(msg.fileId);
            await saveFile(msg.fileId, blob);
            window.dispatchEvent(new CustomEvent('file-downloaded', { detail: { fileId: msg.fileId } }));
          }
          if (currentFileId === msg.fileId) {
            currentFileId = null;
          }
        }
      } else if (event.data instanceof ArrayBuffer) {
        if (currentFileId) {
          const fileData = incomingFiles.current.get(currentFileId);
          if (fileData) {
            fileData.chunks.push(event.data);
            fileData.receivedSize += event.data.byteLength;
            
            window.dispatchEvent(new CustomEvent('file-progress', { 
              detail: { 
                fileId: currentFileId, 
                progress: Math.round((fileData.receivedSize / fileData.totalSize) * 100),
                received: fileData.receivedSize,
                total: fileData.totalSize
              } 
            }));

            if (fileData.receivedSize >= fileData.totalSize) {
              const blob = new Blob(fileData.chunks, { type: fileData.mime });
              const savedFileId = currentFileId;
              currentFileId = null;
              incomingFiles.current.delete(savedFileId);
              
              saveFile(savedFileId, blob).then(() => {
                window.dispatchEvent(new CustomEvent('file-downloaded', { detail: { fileId: savedFileId } }));
              });
            }
          }
        }
      }
    };
  }, []);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const toggleScreenShare = useCallback(async () => {
    if (!callPcRef.current) return;

    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
        }

        // Revert to camera video track
        if (localStreamRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            const sender = callPcRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
              await sender.replaceTrack(videoTrack);
            }
          }
        }
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;

        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Handle user clicking "Stop sharing" on the browser's native UI
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
          }
          
          if (callPcRef.current && localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
              const sender = callPcRef.current.getSenders().find(s => s.track?.kind === 'video');
              if (sender) {
                sender.replaceTrack(videoTrack).catch(err => console.error('Failed to revert track', err));
              }
            }
          }
          if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
        };

        const sender = callPcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else {
          callPcRef.current.addTrack(screenTrack, localStreamRef.current || screenStream);
        }
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        
        setIsScreenSharing(true);
      }
    } catch (err) {
      console.error('Failed to toggle screen share', err);
    }
  }, [isScreenSharing]);

  const toggleVideo = useCallback(async () => {
    if (!localStream) return;
    
    if (isVideoEnabled) {
      // Turn OFF video
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = false;
        videoTrack.stop();
        localStream.removeTrack(videoTrack);
      }
      setIsVideoEnabled(false);
      
      // Remove from peer connection if it exists
      if (callPcRef.current) {
        const sender = callPcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          callPcRef.current.removeTrack(sender);
        }
      }
      
      reportMediaStatus({
        video: false,
        audio: localStream.getAudioTracks()[0]?.enabled ?? true
      });
    } else {
      // Turn ON video
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingModeRef.current } });
        const newVideoTrack = stream.getVideoTracks()[0];
        
        localStream.addTrack(newVideoTrack);
        setIsVideoEnabled(true);
        
        if (callPcRef.current) {
          // Add track back to peer connection
          const sender = callPcRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack).catch(console.error);
          } else {
            callPcRef.current.addTrack(newVideoTrack, localStream);
            
            // Renegotiate!
            const offer = await callPcRef.current.createOffer();
            await callPcRef.current.setLocalDescription(offer);
            socket?.emit('webrtc:call_signal', { targetId: callPeerIdRef.current, signal: offer });
          }
        }
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = null;
          localVideoRef.current.srcObject = localStream;
        }
        
        reportMediaStatus({
          video: true,
          audio: localStream.getAudioTracks()[0]?.enabled ?? true
        });
      } catch (err) {
        console.error('Failed to turn on video', err);
      }
    }
  }, [localStream, isVideoEnabled, reportMediaStatus, socket]);

  const gettingMediaPromiseRef = useRef<Promise<MediaStream> | null>(null);

  const facingModeRef = useRef<'user' | 'environment'>('user');
  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  const getMediaStream = useCallback(async (audioOnly: boolean = false, requestedFacingMode?: 'user' | 'environment') => {
    if (gettingMediaPromiseRef.current) {
      return gettingMediaPromiseRef.current;
    }

    const targetMode = requestedFacingMode || facingModeRef.current;

    const promise = (async () => {
      try {
        if (audioOnly) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          setIsVideoEnabled(false);
          return stream;
        }
        
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: targetMode }, audio: true });
          setIsVideoEnabled(true);
          setFacingMode(targetMode);
          return stream;
        } catch (videoErr) {
          console.warn('Failed to get video, falling back to audio only', videoErr);
          const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          setIsVideoEnabled(false);
          return stream;
        }
      } catch (err) {
        console.error('Failed to get any media devices', err);
        throw err;
      } finally {
        gettingMediaPromiseRef.current = null;
      }
    })();
    
    gettingMediaPromiseRef.current = promise;
    return promise;
  }, []);

  const switchCamera = useCallback(async () => {
    if (!localStream) return;
    const newMode = facingModeRef.current === 'user' ? 'environment' : 'user';
    
    // If video is currently off, just remember the preference for when it turns on
    if (!isVideoEnabled) {
      setFacingMode(newMode);
      return;
    }
    
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newMode } });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = localStream.getVideoTracks()[0];
      
      if (newVideoTrack) {
        newVideoTrack.enabled = true;
      }
      
      if (oldVideoTrack) {
        localStream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      localStream.addTrack(newVideoTrack);
      
      if (callPcRef.current) {
        const sender = callPcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(newVideoTrack).catch(err => console.error('Failed to replace track', err));
        } else {
          callPcRef.current.addTrack(newVideoTrack, localStream);
          const offer = await callPcRef.current.createOffer();
          await callPcRef.current.setLocalDescription(offer);
          socket?.emit('webrtc:call_signal', { targetId: callPeerIdRef.current, signal: offer });
        }
      }
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
        localVideoRef.current.srcObject = localStream;
      }
      
      setFacingMode(newMode);
    } catch (e) {
      console.error('Failed to switch camera', e);
    }
  }, [localStream, isVideoEnabled, socket]);

  const expectCall = useCallback((peerId: string) => {
    console.log('[Call WebRTC] expectCall: expecting from', peerId);
    if (callStateRef.current === 'connected' && callPeerIdRef.current === peerId) {
      console.log('[Call WebRTC] expectCall: already connected to this peer, ignoring');
      return;
    }
    if (lastRejectedCallRef.current === peerId) {
      lastRejectedCallRef.current = null;
    }
    setCallPeerId(peerId);
    setCallState('receiving');
  }, [setCallPeerId, setCallState]);

  const cleanupCall = useCallback((reason: string = 'unknown') => {
    console.log(`[Call WebRTC] cleanupCall called. Reason: ${reason}. Current state: ${callStateRef.current}`);
    stopCallSound();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(track => track.stop());
      remoteStreamRef.current = null;
    }
    setRemoteStream(null);

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);

    if (callPcRef.current) {
      console.log('[Call WebRTC] Closing PeerConnection');
      const pc = callPcRef.current;
      // Detach listeners before closing to prevent recursion (onconnectionstatechange)
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.close();
      callPcRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setCallState('idle');
    setCallPeerId(null);
    setRemoteStreamVersion(0);
    setIsVideoEnabled(true);
    setIsMediaActive(false);
    callCandidatesRef.current = [];
    callOfferRef.current = null;
    callAnswerRef.current = null;
    isSettingUpPcRef.current = false;
  }, [stopCallSound, setCallState, setCallPeerId]);

  const setupCallPeerConnection = useCallback(async (targetId: string, isInitiator: boolean) => {
    if (isSettingUpPcRef.current) {
      console.log('[Call WebRTC] Already setting up PC, skipping');
      return;
    }
    
    isSettingUpPcRef.current = true;
    console.log(`[Call WebRTC] setupCallPeerConnection starting. Initiator: ${isInitiator}, Target: ${targetId}`);
    
    try {
      if (callPcRef.current) {
        console.log('[Call WebRTC] Closing existing PC before new setup');
        callPcRef.current.close();
        callPcRef.current = null;
      }

      const pc = new RTCPeerConnection({ 
        iceServers: ICE_SERVERS,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });
      callPcRef.current = pc;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.ontrack = (event) => {
        let stream = remoteStreamRef.current;
        if (!stream) {
          stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream();
          remoteStreamRef.current = stream;
          setRemoteStream(stream);
        }
        
        // Ensure the track is added to our stream
        if (!stream.getTracks().find(t => t.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        
        setRemoteStreamVersion(v => v + 1);

        event.track.onunmute = () => {
          setRemoteStreamVersion(v => v + 1);
        };

        event.track.onmute = () => {
          setRemoteStreamVersion(v => v + 1);
        };
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit('webrtc:call_signal', { targetId, signal: { type: 'candidate', candidate: event.candidate } });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          if (pc.connectionState === 'failed' && isInitiator) {
            pc.createOffer({ 
              iceRestart: true
            }).then(offer => {
              pc.setLocalDescription(offer);
              socket?.emit('webrtc:call_signal', { targetId, signal: offer });
            }).catch(err => {
              console.error('[Call WebRTC] ICE restart failed:', err);
              cleanupCall('ICE restart failed');
            });
          } else if (pc.connectionState === 'failed') {
            // We could also trigger it here, but let's wait for initiator first
          } else {
            cleanupCall(`Connection state changed to: ${pc.connectionState}`);
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
      };

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('webrtc:call_signal', { targetId, signal: offer });
      } else if (callOfferRef.current) {
        const offer = callOfferRef.current;
        callOfferRef.current = null;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket?.emit('webrtc:call_signal', { targetId, signal: answer });
      }

      // Process any buffered signals that arrived during setup
      const processBufferedSignals = async () => {
        if (!callPcRef.current) return;
        const pc = callPcRef.current;

        // 1. Handle buffered answer if we are initiator
        if (isInitiator && callAnswerRef.current) {
          const answer = callAnswerRef.current;
          callAnswerRef.current = null;
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        } else if (!isInitiator && callOfferRef.current) {
          const offer = callOfferRef.current;
          callOfferRef.current = null;
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket?.emit('webrtc:call_signal', { targetId, signal: answer });
        }

        // 2. Handle buffered candidates
        const candidates = callCandidatesRef.current;
        if (candidates.length > 0) {
          for (const c of candidates) {
            try {
              if (pc.remoteDescription && pc.signalingState !== 'closed') {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              } else {
                // Keep it buffered if still not ready
                callCandidatesRef.current.push(c);
              }
            } catch (e) {
              console.warn('[Call WebRTC] Error adding buffered ICE candidate:', e);
            }
          }
          // Only clear if we actually processed them (this is a bit simplified)
          callCandidatesRef.current = callCandidatesRef.current.filter(c => !candidates.includes(c));
        }
      };

      await processBufferedSignals();
    } finally {
      isSettingUpPcRef.current = false;
    }
  }, [socket, cleanupCall]);

  const startCall = useCallback(async (targetId: string, audioOnly: boolean = false) => {
    try {
      const stream = await getMediaStream(audioOnly);
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      setCallPeerId(targetId);
      setCallState('calling');
      playDialingSound();

      socket?.emit('webrtc:call_request', { targetId, audioOnly });
    } catch (err) {
      console.error('Failed to get media devices', err);
      showAlert('Could not access microphone. Please check your browser permissions.');
    }
  }, [socket, playDialingSound, getMediaStream, showAlert]);

  const acceptCall = useCallback(async (explicitTargetId?: any) => {
    // If called from onClick={acceptCall}, explicitTargetId will be a React Event object
    const targetId = (typeof explicitTargetId === 'string') ? explicitTargetId : undefined;
    const peerId = targetId || callPeerIdRef.current;
    const currentState = callStateRef.current;
    
    console.log(`[Call WebRTC] acceptCall: Attempting to answer. Target: ${peerId}, CurrentState: ${currentState}, ExplicitID: ${targetId}`);
    
    if (!peerId) {
      console.error('[Call WebRTC] acceptCall: No peerId found');
      cleanupCall('Accept failed - no peerId');
      return;
    }
    
    if (!socket) {
      console.error('[Call WebRTC] acceptCall: Socket is null');
      cleanupCall('Accept failed - no socket');
      return;
    }

    if (currentState !== 'receiving' && !targetId) {
      console.warn(`[Call WebRTC] acceptCall: Invalid state for non-explicit accept: ${currentState}`);
      return;
    }
    
    stopCallSound();
    
    try {
      if (!socket.connected) {
        console.warn('[Call WebRTC] acceptCall: Socket not connected, waiting for connection...');
        let attempts = 0;
        while (!socket.connected && attempts < 100) { // 10 seconds max
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
      }

      if (!socket.connected) {
        console.error('[Call WebRTC] acceptCall: Socket still not connected after 10s wait');
        cleanupCall('Accept failed - socket connection timeout');
        return;
      }
      
      let stream = localStreamRef.current;
      if (!stream) {
        try {
          console.log('[Call WebRTC] acceptCall: Getting media stream...');
          stream = await getMediaStream();
          localStreamRef.current = stream;
          setLocalStream(stream);
        } catch(mediaErr) {
          console.error('[Call WebRTC] acceptCall: Failed to get media devices', mediaErr);
          showAlert('Could not access microphone/camera. Proceeding in receive-only mode.');
        }
      }
      
      console.log(`[Call WebRTC] acceptCall: Emitting webrtc:call_accept to ${peerId}`);
      socket.emit('webrtc:call_accept', { targetId: peerId });
      setCallState('connected');
      
      if (targetId) {
        setCallPeerId(targetId);
      }
      await setupCallPeerConnection(peerId, false);
    } catch (err) {
      console.error('[Call WebRTC] acceptCall: Error during total setup flow', err);
      cleanupCall('Accept failed - internal error');
    }
  }, [socket, stopCallSound, setupCallPeerConnection, getMediaStream, showAlert, setCallState, setCallPeerId, cleanupCall]);

  const rejectCall = useCallback((explicitTargetId?: any) => {
    const targetId = (typeof explicitTargetId === 'string') ? explicitTargetId : undefined;
    const target = targetId || callPeerIdRef.current;
    console.log(`[Call WebRTC] rejectCall called for target: ${target}. Current state: ${callStateRef.current}`);
    
    if (target) {
      lastRejectedCallRef.current = target;
      setTimeout(() => { 
        if (lastRejectedCallRef.current === target) {
          lastRejectedCallRef.current = null;
        }
      }, 4000);
      socket?.emit('webrtc:call_reject', { targetId: target });
    }
    cleanupCall('Explicit reject');
  }, [socket, cleanupCall]);

  const endCall = useCallback((explicitTargetId?: any) => {
    const targetId = (typeof explicitTargetId === 'string') ? explicitTargetId : undefined;
    const target = targetId || callPeerIdRef.current;
    if (target) {
      console.log(`[Call WebRTC] endCall called for target: ${target}`);
      socket?.emit('webrtc:call_end', { targetId: target });
    }
    cleanupCall('Explicit end');
  }, [socket, cleanupCall]);

  useEffect(() => {
    if (!socket) return;

    const handleRequestFile = async (data: { requesterId: string, fileId: string }) => {
      const { requesterId, fileId } = data;
      const blob = await getFile(fileId);
      if (!blob) return;

      const queue = fileSendQueue.current.get(requesterId) || [];
      queue.push({ fileId, blob });
      fileSendQueue.current.set(requesterId, queue);

      let pc = peerConnections.current.get(requesterId);
      if (!pc) {
        pc = new RTCPeerConnection({ 
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10,
          bundlePolicy: 'max-bundle',
          iceTransportPolicy: 'all'
        });
        peerConnections.current.set(requesterId, pc);

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('webrtc:signal', { targetId: requesterId, signal: { type: 'candidate', candidate: event.candidate } });
          }
        };

        const currentPc = pc;
        currentPc.onconnectionstatechange = () => {
          if (currentPc.connectionState === 'failed' || currentPc.connectionState === 'disconnected' || currentPc.connectionState === 'closed') {
            currentPc.close();
            peerConnections.current.delete(requesterId);
            dataChannels.current.delete(requesterId);
            isSending.current.delete(requesterId);
            window.dispatchEvent(new CustomEvent('webrtc-failed', { detail: { peerId: requesterId } }));
          }
        };

        const dc = pc.createDataChannel('fileTransfer');
        dataChannels.current.set(requesterId, dc);
        setupDataChannel(dc, requesterId);
        
        dc.onopen = () => {
          processSendQueue(requesterId);
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:signal', { targetId: requesterId, signal: offer });
      } else {
        const dc = dataChannels.current.get(requesterId);
        if (dc && dc.readyState === 'open') {
          processSendQueue(requesterId);
        } else if (dc) {
          dc.onopen = () => {
            processSendQueue(requesterId);
          };
        }
      }
    };

    const handleSignal = async (data: { senderId: string, signal: any }) => {
      const { senderId, signal } = data;
      let pc = peerConnections.current.get(senderId);

      if (!pc) {
        pc = new RTCPeerConnection({ 
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10,
          bundlePolicy: 'max-bundle',
          iceTransportPolicy: 'all'
        });
        peerConnections.current.set(senderId, pc);

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('webrtc:signal', { targetId: senderId, signal: { type: 'candidate', candidate: event.candidate } });
          }
        };

        const currentPc = pc;
        currentPc.onconnectionstatechange = () => {
          if (currentPc.connectionState === 'failed' || currentPc.connectionState === 'disconnected' || currentPc.connectionState === 'closed') {
            currentPc.close();
            peerConnections.current.delete(senderId);
            dataChannels.current.delete(senderId);
            isSending.current.delete(senderId);
            window.dispatchEvent(new CustomEvent('webrtc-failed', { detail: { peerId: senderId } }));
          }
        };

        pc.ondatachannel = (event) => {
          const dc = event.channel;
          dataChannels.current.set(senderId, dc);
          setupDataChannel(dc, senderId);
          dc.onopen = () => {
            processSendQueue(senderId);
          };
        };
      }

      try {
        if (signal.type === 'offer') {
          if (pc.signalingState !== 'stable') return;
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:signal', { targetId: senderId, signal: answer });
          
          const candidates = pendingCandidates.current.get(senderId) || [];
          for (const c of candidates) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidates.current.set(senderId, []);
        } else if (signal.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
          }
          
          const candidates = pendingCandidates.current.get(senderId) || [];
          for (const c of candidates) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidates.current.set(senderId, []);
        } else if (signal.type === 'candidate') {
          if (pc.remoteDescription && pc.signalingState !== 'closed') {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            const candidates = pendingCandidates.current.get(senderId) || [];
            candidates.push(signal.candidate);
            pendingCandidates.current.set(senderId, candidates);
          }
        }
      } catch (e) {
        console.error('WebRTC Error:', e);
      }
    };

    const handleCallRequest = async (data: { requesterId: string, audioOnly?: boolean }) => {
      console.log(`[Call WebRTC] handleCallRequest: Received from ${data.requesterId}. Current state: ${callStateRef.current}`);
      
      // If we get a request from the same peer we just rejected, and we are idle, 
      // it means they are calling again intentionally. Allow it.
      if (lastRejectedCallRef.current === data.requesterId && callStateRef.current === 'idle') {
        console.log('[Call WebRTC] handleCallRequest: Peer calling again after reject, clearing marker');
        lastRejectedCallRef.current = null;
      }

      if (lastRejectedCallRef.current === data.requesterId) {
        console.log('[Call WebRTC] handleCallRequest: Freshly rejected, ignoring');
        return;
      }
      
      if (callStateRef.current !== 'idle') {
        if (callPeerIdRef.current === data.requesterId) {
          console.log('[Call WebRTC] handleCallRequest: Already busy with/connected to same peer, ignoring duplicate');
          return;
        }
        console.warn(`[Call WebRTC] handleCallRequest: Already busy with ${callPeerIdRef.current}, rejecting ${data.requesterId}`);
        socket?.emit('webrtc:call_reject', { targetId: data.requesterId });
        return;
      }
      
      console.log(`[Call WebRTC] handleCallRequest: Setting state to receiving for ${data.requesterId}`);
      setCallPeerId(data.requesterId);
      setCallState('receiving');
      playRingingSound();

      try {
        console.log('[Call WebRTC] handleCallRequest: Pre-fetching media stream...');
        const stream = await getMediaStream(data.audioOnly);
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch (err) {
        console.error('[Call WebRTC] handleCallRequest: Media error', err);
      }
    };

    const handleCallAccept = async (data: { accepterId: string }) => {
      console.log(`[Call WebRTC] handleCallAccept from ${data.accepterId}. State: ${callStateRef.current}, Peer: ${callPeerIdRef.current}`);
      if (callStateRef.current === 'calling' && callPeerIdRef.current === data.accepterId) {
        stopCallSound();
        setCallState('connected');
        await setupCallPeerConnection(data.accepterId, true);
      } else if (callStateRef.current === 'connected' && callPeerIdRef.current === data.accepterId) {
        console.log('[Call WebRTC] handleCallAccept: Already connected, ensuring setup');
        await setupCallPeerConnection(data.accepterId, true);
      } else {
        console.warn(`[Call WebRTC] handleCallAccept ignored: state or peer mismatch`);
      }
    };

    const handleCallReject = (data?: any) => {
      console.log(`[Call WebRTC] Received webrtc:call_reject from ${data?.rejecterId || 'server'}`);
      cleanupCall('Remote rejected');
    };

    const handleCallEnd = (data?: any) => {
      console.log(`[Call WebRTC] Received webrtc:call_end from ${data?.enderId || 'server'}`);
      cleanupCall('Remote ended');
    };

    const handleCallHandledElsewhere = (data: { targetId: string }) => {
      console.log(`[Call WebRTC] handleCallHandledElsewhere for ${data.targetId}. State: ${callStateRef.current}`);
      if (callStateRef.current === 'receiving' && callPeerIdRef.current === data.targetId) {
        cleanupCall('Handled elsewhere');
      }
    };

    const handleCallIdle = () => {
      console.log(`[Call WebRTC] Received webrtc:call_idle. State: ${callStateRef.current}`);
      // Only cleanup if we are truly receiving but server thinks we are idle
      if (callStateRef.current === 'receiving') {
        // cleanupCall('Call went idle');
      }
    };

    const handleMediaActive = (data: { senderId: string }) => {
      if (data.senderId === callPeerIdRef.current) {
        setIsPeerMediaActive(true);
      }
    };

    const handleMediaStatus = (data: { senderId: string, status: { video: boolean, audio: boolean } }) => {
      if (data.senderId === callPeerIdRef.current) {
        setIsPeerVideoActive(data.status.video);
        if (data.status.video || data.status.audio) {
          setIsPeerMediaActive(true);
        }
      }
    };

        const handleCallSignal = async (data: { senderId: string, signal: any }) => {
      const pc = callPcRef.current;
      const isSettingUp = isSettingUpPcRef.current;
      
      // Buffer signals if PC is not ready or currently being set up
      if (!pc || isSettingUp) {
        if (data.signal.type === 'offer') {
          callOfferRef.current = data.signal;
        } else if (data.signal.type === 'answer') {
          callAnswerRef.current = data.signal;
        } else if (data.signal.type === 'candidate') {
          callCandidatesRef.current.push(data.signal.candidate);
        }
        return;
      }
      
      if (data.senderId !== callPeerIdRef.current) {
        console.warn(`[Call WebRTC] Signal sender mismatch: ${data.senderId} !== ${callPeerIdRef.current}`);
        return;
      }

      try {
        if (data.signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:call_signal', { targetId: data.senderId, signal: answer });
          
          // Process candidates that were waiting for remote description
          const candidates = callCandidatesRef.current;
          if (candidates.length > 0) {
            for (const c of candidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              } catch (e) {
                console.warn('[Call WebRTC] Error adding buffered ICE candidate:', e);
              }
            }
            callCandidatesRef.current = [];
          }
        } else if (data.signal.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          }
          
          // Process candidates that were waiting for remote description
          const candidates = callCandidatesRef.current;
          if (candidates.length > 0) {
            for (const c of candidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              } catch (e) {
                console.warn('[Call WebRTC] Error adding buffered ICE candidate:', e);
              }
            }
            callCandidatesRef.current = [];
          }
        } else if (data.signal.type === 'candidate') {
          if (data.signal.candidate) {
            if (pc.remoteDescription && pc.signalingState !== 'closed') {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
              } catch (e) {
                console.warn('[Call WebRTC] Error adding ICE candidate:', e);
              }
            } else {
              callCandidatesRef.current.push(data.signal.candidate);
            }
          }
        }
      } catch (e) {
        console.error('[Call WebRTC] Call signaling error:', e);
      }
    };

    const handleUserOffline = (data: { userId: string, lastSeen: string }) => {
      const pc = peerConnections.current.get(data.userId);
      if (pc) {
        pc.close();
        peerConnections.current.delete(data.userId);
        dataChannels.current.delete(data.userId);
        fileSendQueue.current.delete(data.userId);
        isSending.current.delete(data.userId);
        window.dispatchEvent(new CustomEvent('webrtc-failed', { detail: { peerId: data.userId } }));
      }
    };

    const handleCallRestoredRequester = (data: { targetId: string, audioOnly: boolean }) => {
      console.log('[Call WebRTC] call_restored_requester:', data);
      if (callStateRef.current === 'idle') {
        setCallPeerId(data.targetId);
        setCallState('calling');
        setIsVideoEnabled(!data.audioOnly);
        playRingingSound();
      }
    };

    socket.on('webrtc:request_file', handleRequestFile);
    socket.on('webrtc:signal', handleSignal);
    socket.on('webrtc:call_request', handleCallRequest);
    socket.on('webrtc:call_idle', handleCallIdle);
    socket.on('webrtc:call_accept', handleCallAccept);
    socket.on('webrtc:call_reject', handleCallReject);
    socket.on('webrtc:call_end', handleCallEnd);
    socket.on('webrtc:call_restored_requester', handleCallRestoredRequester);
    socket.on('webrtc:call_handled_elsewhere', handleCallHandledElsewhere);
    socket.on('webrtc:call_signal', handleCallSignal);
    socket.on('webrtc:media_active', handleMediaActive);
    socket.on('webrtc:media_status', handleMediaStatus);
    socket.on('user:offline', handleUserOffline);

    const handleConnect = () => {
      console.log('[Call WebRTC] Socket connected, emitting ready');
      socket.emit('webrtc:ready');
    };
    socket.on('connect', handleConnect);
    
    if (socket.connected) {
      socket.emit('webrtc:ready');
    }

    return () => {
      console.log('[Call WebRTC] Detaching listeners (not cleaning up call)');
      socket.off('connect', handleConnect);
      socket.off('webrtc:request_file', handleRequestFile);
      socket.off('webrtc:signal', handleSignal);
      socket.off('webrtc:call_request', handleCallRequest);
      socket.off('webrtc:call_idle', handleCallIdle);
      socket.off('webrtc:call_accept', handleCallAccept);
      socket.off('webrtc:call_reject', handleCallReject);
      socket.off('webrtc:call_end', handleCallEnd);
      socket.off('webrtc:call_restored_requester', handleCallRestoredRequester);
      socket.off('webrtc:call_handled_elsewhere', handleCallHandledElsewhere);
      socket.off('webrtc:call_signal', handleCallSignal);
      socket.off('webrtc:media_active', handleMediaActive);
      socket.off('webrtc:media_status', handleMediaStatus);
      socket.off('user:offline', handleUserOffline);
    };
  }, [socket, processSendQueue, setupDataChannel, playRingingSound, stopCallSound, setupCallPeerConnection, cleanupCall, getMediaStream]);

  // Separate effect for true component unmount
  useEffect(() => {
    return () => {
      // We check a ref to see if it's a real unmount or just a dependency change might be tricky here,
      // but in Next.js App Router, the page only unmounts on navigation.
      // If we are still receiving or connected, we might want to keep it during socket flip.
      // So we ONLY cleanup if it's NOT a socket flip.
      // Actually, a simple ref to track "is actually unmounting"
    };
  }, []);

  // Watchdog for media activity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (callState === 'connected' && !isMediaActive) {
      timeout = setTimeout(async () => {
        if (callState === 'connected' && !isMediaActive) {
          console.warn('[Call WebRTC] Watchdog: No media activity detected after 8s. Attempting ICE restart.');
          if (callPcRef.current) {
            try {
              const offer = await callPcRef.current.createOffer({ 
                iceRestart: true
              });
              await callPcRef.current.setLocalDescription(offer);
              socket?.emit('webrtc:call_signal', { targetId: callPeerIdRef.current, signal: offer });
            } catch (err) {
              console.error('[Call WebRTC] ICE restart failed:', err);
            }
          }
        }
      }, 8000);
    }
    return () => clearTimeout(timeout);
  }, [callState, isMediaActive, socket]);

  const value = useMemo(() => ({
    callState,
    callPeerId,
    isVideoEnabled,
    localVideoRef,
    remoteVideoRef,
    localStream,
    remoteStream,
    isMediaActive,
    isPeerMediaActive,
    isPeerVideoActive,
    remoteStreamVersion,
    isScreenSharing,
    facingMode,
    switchCamera,
    toggleScreenShare,
    toggleVideo,
    startCall,
    acceptCall,
    expectCall,
    rejectCall,
    endCall,
    reportMediaActive,
    reportMediaStatus
  }), [
    callState,
    callPeerId,
    isVideoEnabled,
    localStream,
    remoteStream,
    isMediaActive,
    isPeerMediaActive,
    isPeerVideoActive,
    remoteStreamVersion,
    isScreenSharing,
    facingMode,
    switchCamera,
    toggleScreenShare,
    toggleVideo,
    startCall,
    acceptCall,
    expectCall,
    rejectCall,
    endCall,
    reportMediaActive,
    reportMediaStatus
  ]);

  return value;
}
