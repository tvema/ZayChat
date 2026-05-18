'use client';
import { safeLocalStorage } from '@/lib/safeStorage';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Download, FileIcon, PlayCircle, Lock, Type } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { getFile } from '@/lib/db';
import { ImageViewer } from './ImageViewer';
import { Portal } from './Portal';
import { AnimatePresence } from 'motion/react';
import { useLanguage } from '@/components/LanguageProvider';
import { decryptFile, decryptAESKeyWithRSA, importKey, base64ToArrayBuffer } from '@/lib/crypto';
import { keyRing } from '@/lib/keyRing';

export const FileAttachment = ({ fileData, senderId, socket, isThumbnail = false, encryptionData, activeGroup, messageId }: { fileData: any, senderId: string, socket: Socket | null, isThumbnail?: boolean, encryptionData?: any, activeGroup?: any, messageId?: string }) => {
  const { t } = useLanguage();
  const [blobUrl, setBlobUrl] = useState<string | null>(fileData.url || null);
  const blobUrlRef = useRef<string | null>(fileData.url || null);
  const rawBlobRef = useRef<Blob | null>(null);
  const [loading, setLoading] = useState(!fileData.url || fileData.isEncrypted);
  const [hasError, setHasError] = useState(false);
  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => {
    blobUrlRef.current = blobUrl;
  }, [blobUrl]);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDecrypting, setIsDecrypting] = useState(false);
  
  const [transcription, setTranscription] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const handleViewerAction = (e: any) => {
      if (isViewerOpen) {
        if (e.detail?.action === 'reply') {
           window.dispatchEvent(new CustomEvent('message-action-request', { detail: { messageId, action: 'reply' } }));
        } else if (e.detail?.action === 'forward') {
           window.dispatchEvent(new CustomEvent('message-action-request', { detail: { messageId, action: 'forward' } }));
        }
      }
    };
    window.addEventListener('image-viewer-action', handleViewerAction);
    return () => window.removeEventListener('image-viewer-action', handleViewerAction);
  }, [isViewerOpen, messageId]);

  const handleTranscribe = async () => {
    if (!blobUrl || isTranscribing) return;
    setIsTranscribing(true);
    try {
      // Fetch the decrypted blob
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          // Extract base64 without prefix
          const base64data = result.split(',')[1];
          resolve(base64data);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const base64Audio = await base64Promise;

      const token = safeLocalStorage.getItem('token');
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          base64Audio,
          mimeType: blob.type || fileData.mime || "audio/webm",
          senderId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Transcription failed on server');
      }

      const data = await response.json();
      setTranscription(data.transcription || 'Не получается транскрибировать');
    } catch (e: any) {
      console.warn("Transcription error:", e);
      setTranscription(e.message === 'Transcription failed on server' ? 'Не получается транскрибировать' : e.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const autoDownload = !fileData.mime?.startsWith('video/') && !fileData.mime?.startsWith('audio/');
  const [shouldDownload, setShouldDownload] = useState(autoDownload);

  useEffect(() => {
    const onTranscribeRequested = (e: any) => {
      if (e.detail?.messageId === messageId) {
        handleTranscribe();
      }
    };
    window.addEventListener('transcribe-requested', onTranscribeRequested);
    return () => window.removeEventListener('transcribe-requested', onTranscribeRequested);
  }, [messageId, blobUrl, isTranscribing]);

  useEffect(() => {
    let isMounted = true;
    let currentBlobUrl: string | null = null;
    
    const isReadyUnencrypted = fileData.url && (!fileData.isEncrypted || fileData.url.startsWith('blob:'));

    const loadFile = async () => {
      // 1. Try to load from IndexedDB cache first
      const uniqueId = fileData.url || fileData.fileId;
      if (uniqueId) {
        try {
          const cachedBlob = await getFile(uniqueId);
          if (cachedBlob && isMounted) {
            rawBlobRef.current = cachedBlob;
            currentBlobUrl = URL.createObjectURL(cachedBlob);
            setBlobUrl(currentBlobUrl);
            setLoading(false);
            setHasError(false);
            return; // Found in cache, no need to download!
          }
        } catch (e) {
          console.error("Failed to read from cache", e);
        }
      }

      // 2. If it's a video and user hasn't clicked download yet, wait
      if (!shouldDownload) {
        return;
      }

      if (fileData.url && fileData.isEncrypted && encryptionData) {
        // Handle E2EE file decryption
        try {
          setIsDecrypting(false); // Make sure it's strictly false initially
          // Use XHR to track download progress of the encrypted file
          const encryptedBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
             const xhr = new XMLHttpRequest();
             xhr.open('GET', fileData.url);
             xhr.responseType = 'arraybuffer';
             
             xhr.onprogress = (e) => {
                if (e.lengthComputable && isMounted) {
                   const percentComplete = Math.round((e.loaded / e.total) * 100);
                   setProgress(percentComplete);
                }
             };
             
             xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                   resolve(xhr.response);
                } else {
                   reject(new Error(`Failed to download: ${xhr.status}`));
                }
             };
             
             xhr.onerror = () => reject(new Error('Network error'));
             xhr.send();
          });
          
          setIsDecrypting(true); // NOW we are actually decrypting
          
          const userStr = safeLocalStorage.getItem('user');
          
          if (userStr) {
            const user = JSON.parse(userStr);
            let aesKey: CryptoKey | null = null;
            let ivBase64: string | undefined;

            if (fileData.fileKey && fileData.fileIv) {
               console.log('[FileAttachment] Found fileKey and fileIv in fileData, using explicit file key', { fileKeyLen: fileData.fileKey.length, fileIvLen: fileData.fileIv.length });
               const rawKey = new Uint8Array(base64ToArrayBuffer(fileData.fileKey));
               aesKey = await window.crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
               ivBase64 = fileData.fileIv;
            } else {
              let encryptedAesKey: string | undefined;
              console.log('[FileAttachment] No fileKey/fileIv in fileData. Falling back to encryptionData.', { hasEncryptionData: !!encryptionData, hasGroup: !!activeGroup });
              
              if (activeGroup && activeGroup.encrypted_keys) {
                let keysObj: Record<string, string>;
                try {
                  keysObj = JSON.parse(activeGroup.encrypted_keys);
                } catch (e) {
                  keysObj = { "1": activeGroup.encrypted_keys };
                }
                encryptedAesKey = keysObj[encryptionData?.key_version?.toString() || "1"];
              } else if (encryptionData?.keys) {
                encryptedAesKey = encryptionData.keys[user.id];
              }
              
              if (encryptedAesKey) {
                aesKey = await keyRing.getAesKey(encryptedAesKey);
                ivBase64 = encryptionData?.fileIv || encryptionData?.iv;
                console.log('[FileAttachment] Found encryptedAesKey, decrypted aesKey?', !!aesKey, 'ivBase64:', !!ivBase64);
              } else {
                console.log('[FileAttachment] No encryptedAesKey found. encryptionData.keys:', encryptionData?.keys, 'user.id:', user.id);
              }
            }
            
            if (aesKey && ivBase64) {
              const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
              
              const decryptedBlob = await decryptFile(encryptedBuffer, aesKey, iv);
              if (isMounted) {
                rawBlobRef.current = decryptedBlob;
                currentBlobUrl = URL.createObjectURL(decryptedBlob);
                setBlobUrl(currentBlobUrl);
                setLoading(false);
                setHasError(false);
                // SAVE TO CACHE!
                if (uniqueId) {
                  import('@/lib/db').then(({ saveFile }) => {
                    saveFile(uniqueId, decryptedBlob).catch(e => console.error("Failed to cache file", e));
                  });
                }
              }
            } else {
               console.error("No encrypted AES key found for this user or missing IV");
               setHasError(true);
            }
          }
        } catch (e) {
          console.error("Failed to decrypt file", e);
          setHasError(true);
        } finally {
          if (isMounted) setIsDecrypting(false);
        }
        return;
      }

      // Request file via WebRTC (unencrypted p2p)
      if (socket && isMounted && fileData.fileId) {
        setHasError(false);
        socket.emit('webrtc:request_file', {
          targetId: senderId,
          fileId: fileData.fileId
        });
      }
    };
    
    if (!isReadyUnencrypted) {
      loadFile();
    }

    const handleFileDownloaded = (e: any) => {
      if (e.detail.fileId === fileData.fileId && isMounted) {
        loadFile();
      }
    };

    const handleFileProgress = (e: any) => {
      if (e.detail.fileId === fileData.fileId && isMounted) {
        setProgress(e.detail.progress);
      }
    };

    const handleWebrtcFailed = (e: any) => {
      if (e.detail.peerId === senderId && isMounted && loading) {
        setHasError(true);
      }
    };

    const handleUserOnline = (data: any) => {
      if (data.userId === senderId && isMounted && loading) {
        loadFile();
      }
    };

    const handleSaveFileRequested = async (e: any) => {
      console.log('FileAttachment save-file-requested event:', e.detail, 'isThumbnail:', isThumbnail, 'messageId:', messageId, 'my expected messageId:', messageId);
      if (isThumbnail) return;
      const targetId = fileData.fileId || fileData.url;
      console.log('Comparing targetId:', targetId, 'with event fileId:', e.detail.fileId);
      
      // If messageId is provided in the event, ensure it matches this instance's messageId
      if (e.detail.messageId && messageId && e.detail.messageId !== messageId) {
          console.log('Message ID mismatch. Expected:', messageId, 'Got:', e.detail.messageId);
          return;
      }
      
      console.log('Event matches this attachment. isMounted:', isMounted);
      
      if (e.detail.fileId === targetId && isMounted) {
        const currentBlob = blobUrlRef.current;
        const currentLoading = loadingRef.current;
        console.log('Current blob:', currentBlob, 'Loading:', currentLoading);
        if (currentBlob && !currentLoading) {
          console.log('Proceeding with blob download block...');
          try {
            // Fetch blob from the object URL so we have the actual data for Web Share API if needed
            let blob: Blob | null = rawBlobRef.current;
            console.log('Native Share blob:', blob);
            
            if (navigator.share) {
               try {
                 if (!blob && currentBlob.startsWith('blob:')) {
                   console.log('Fetching blob for sharing');
                   const response = await fetch(currentBlob);
                   blob = await response.blob();
                   rawBlobRef.current = blob;
                 }
                 if (blob) {
                   const fileName = fileData.name || 'file';
                   let mimeType = blob.type || fileData.mime || 'application/octet-stream';
                   
                   // Infer mime from extension if octet-stream or empty so mobile OS recognizes it
                   if (!mimeType || mimeType === 'application/octet-stream') {
                     const ext = fileName.toLowerCase().split('.').pop();
                     if (ext === 'mp4') mimeType = 'video/mp4';
                     else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
                     else if (ext === 'png') mimeType = 'image/png';
                     else if (ext === 'gif') mimeType = 'image/gif';
                     else if (ext === 'mp3') mimeType = 'audio/mpeg';
                     else if (ext === 'pdf') mimeType = 'application/pdf';
                   }

                   const file = new File([blob], fileName, { type: mimeType });
                   
                   console.log('Invoking navigator.share with type:', mimeType);
                   await navigator.share({
                     files: [file],
                     title: fileName,
                   });
                   return; // Success using native share
                 } else if (!currentBlob.startsWith('blob:')) {
                   console.log('Invoking navigator.share for URL');
                   await navigator.share({
                     url: currentBlob,
                     title: fileData.name || 'File from ZState',
                   });
                   return;
                 }
               } catch (err: any) {
                 console.log('Web Share API failed, falling back to download link', err);
                 if (err.name === 'AbortError') {
                   // User cancelled native share. Do not fallback to download dialog.
                   return;
                 }
               }
            }

            // Fallback to traditional anchor tag download
            const isBlobUrl = currentBlob.startsWith('blob:');
            const downloadUrl = isBlobUrl 
              ? currentBlob 
              : `/api/download?url=${encodeURIComponent(currentBlob)}&filename=${encodeURIComponent(fileData.name || 'file')}`;
              
            console.log('Generated download loop. isBlobUrl:', isBlobUrl, 'downloadUrl:', downloadUrl);

            if (isBlobUrl) {
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = downloadUrl;
                a.download = fileData.name || 'file';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                console.log('Opening standard URL via anchor');
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = downloadUrl;
                a.download = fileData.name || 'file';
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
          } catch (err: any) {
            console.error('Save failed:', err);
            alert('Не удалось сохранить файл: ' + err.message);
          }
        } else if (fileData.url && (!fileData.isEncrypted || fileData.url.startsWith('blob:'))) {
           console.log('Proceeding with the fallback/direct URL download block');
           // Direct download link for unencrypted or already processed blob url
          try {
             // ...

            const isBlobUrl = fileData.url.startsWith('blob:');
            const downloadUrl = isBlobUrl 
              ? fileData.url 
              : `/api/download?url=${encodeURIComponent(fileData.url)}&filename=${encodeURIComponent(fileData.name || 'file')}`;

            if (isBlobUrl) {
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = downloadUrl;
                a.download = fileData.name || 'file';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = downloadUrl;
                a.download = fileData.name || 'file';
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
          } catch (err: any) {
            alert('Не удалось скачать файл: ' + err.message);
          }
        } else {
          // It might not be loaded in THIS component, but could be in cache!
          const uniqueId = fileData.url || fileData.fileId;
          if (uniqueId) {
            console.log('Attachment not loaded in this instance. Checking cache directly for', uniqueId);
            import('@/lib/db').then(async ({ getFile }) => {
               try {
                 const cachedBlob = await getFile(uniqueId);
                 if (cachedBlob) {
                    const fileName = fileData.name || 'file';
                    let mimeType = cachedBlob.type || fileData.mime || 'application/octet-stream';
                    
                    if (!mimeType || mimeType === 'application/octet-stream') {
                      const ext = fileName.toLowerCase().split('.').pop();
                      if (ext === 'mp4') mimeType = 'video/mp4';
                      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
                      else if (ext === 'png') mimeType = 'image/png';
                      else if (ext === 'gif') mimeType = 'image/gif';
                      else if (ext === 'mp3') mimeType = 'audio/mpeg';
                      else if (ext === 'pdf') mimeType = 'application/pdf';
                    }
                    const file = new File([cachedBlob], fileName, { type: mimeType });
                    
                    if (navigator.share) {
                       try {
                          console.log('Invoking navigator.share from cache check');
                          await navigator.share({ files: [file], title: fileName });
                          return;
                       } catch (err: any) {
                          console.log('Web share from cache failed', err);
                          if (err.name === 'AbortError') return;
                       }
                    }
                    
                    const u = URL.createObjectURL(cachedBlob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = u;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(u), 1000);
                 } else {
                    alert('Нельзя скачать файл, так как он еще не загружен.');
                 }
               } catch(e) {
                 alert('Нельзя скачать файл, так как он еще не загружен.');
               }
            }).catch(() => {
               alert('Нельзя скачать файл, так как он еще не загружен.');
            });
          } else {
            alert('Нельзя скачать файл, так как он еще не загружен.');
          }
        }
      }
    };

    window.addEventListener('save-file-requested', handleSaveFileRequested);
    window.addEventListener('file-downloaded', handleFileDownloaded);
    window.addEventListener('file-progress', handleFileProgress);
    window.addEventListener('file-send-progress', handleFileProgress);
    window.addEventListener('webrtc-failed', handleWebrtcFailed);
    socket?.on('user:online', handleUserOnline);

    return () => {
      isMounted = false;
      window.removeEventListener('save-file-requested', handleSaveFileRequested);
      window.removeEventListener('file-downloaded', handleFileDownloaded);
      window.removeEventListener('file-progress', handleFileProgress);
      window.removeEventListener('file-send-progress', handleFileProgress);
      window.removeEventListener('webrtc-failed', handleWebrtcFailed);
      socket?.off('user:online', handleUserOnline);
      if (currentBlobUrl && (!fileData.url || fileData.isEncrypted)) URL.revokeObjectURL(currentBlobUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileData.fileId, fileData.url, fileData.isEncrypted, senderId, socket, retryCount, shouldDownload]);

  const getContainerDimensions = () => {
    if (!fileData.width || !fileData.height) return null;
    const maxWidth = 500;
    const maxHeight = 256; 
    let w = fileData.width;
    let h = fileData.height;
    
    if (w > maxWidth) {
       h = Math.round(h * (maxWidth / w));
       w = maxWidth;
    }
    if (h > maxHeight) {
       w = Math.round(w * (maxHeight / h));
       h = maxHeight;
    }
    
    return { 
      width: w, 
      maxWidth: '100%', 
      height: 'auto', 
      aspectRatio: `${fileData.width}/${fileData.height}` 
    };
  };

  const containerStyle = getContainerDimensions();
  const hasDimensions = !!containerStyle;

  if (isThumbnail) {
    if (loading) {
      if ((fileData.mime?.startsWith('image/') || fileData.mime?.startsWith('video/')) && fileData.thumbnail) {
        return (
          <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-neutral-200">
            <Image 
              src={fileData.thumbnail} 
              alt="loading" 
              fill 
              className="object-cover" 
              unoptimized
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
              {isDecrypting ? <Lock size={16} className="text-white animate-pulse" /> : <Download size={16} className={hasError ? 'text-red-400' : 'text-white animate-pulse'} />}
            </div>
          </div>
        );
      }
      return (
        <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center border border-neutral-200 shrink-0">
          {isDecrypting ? <Lock size={20} className="text-indigo-400 animate-pulse" /> : <Download size={20} className={hasError ? 'text-red-400' : 'text-neutral-400 animate-pulse'} />}
        </div>
      );
    }
    if (fileData.mime.startsWith('image/')) {
      return (
        <div className="relative w-12 h-12 shrink-0">
          <Image 
            src={blobUrl!} 
            alt={fileData.name} 
            fill 
            className="object-cover rounded-lg border border-neutral-200" 
            referrerPolicy="no-referrer"
            unoptimized={fileData.isEncrypted || blobUrl?.startsWith('blob:')}
          />
        </div>
      );
    }
    if (fileData.mime.startsWith('video/')) {
      return (
        <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 flex items-center justify-center">
          {fileData.thumbnail && (
            <Image 
              src={fileData.thumbnail} 
              alt={fileData.name} 
              fill 
              className="object-cover opacity-50 absolute inset-0 z-0" 
              unoptimized
            />
          )}
          <PlayCircle size={20} className="text-white drop-shadow-md z-10" />
        </div>
      );
    }
    if (fileData.mime.startsWith('audio/')) {
      return (
        <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center border border-indigo-100 shrink-0">
          <PlayCircle size={20} className="text-indigo-500" />
        </div>
      );
    }
    return (
      <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center border border-neutral-200 shrink-0">
        <FileIcon size={20} className="text-neutral-500" />
      </div>
    );
  }

  const isImage = fileData.mime?.startsWith('image/');
  const isVideo = fileData.mime?.startsWith('video/');

  if (isImage || isVideo) {
    let appliedStyle: React.CSSProperties = { 
      WebkitTouchCallout: 'none', 
      WebkitUserSelect: 'none', 
      userSelect: 'none' 
    };
    
    if (hasDimensions && containerStyle) {
      appliedStyle = { ...appliedStyle, ...containerStyle };
    } else if (loading) {
      // Conservative default for files without metadata to prevent collapsing
      // 256px perfectly matches max-h-64 used by the loaded image
      appliedStyle = { ...appliedStyle, width: '250px', height: '256px' };
    } else {
      appliedStyle = { ...appliedStyle, minWidth: '200px' };
    }

    return (
      <>
        <div 
          className={`rounded-xl overflow-hidden border border-neutral-200 max-w-full bg-neutral-50 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity relative min-h-[100px] ${!loading && !hasDimensions ? 'h-auto' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (loading && !shouldDownload) {
              setShouldDownload(true);
            } else if (!loading && isImage) {
              setIsViewerOpen(true);
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
          style={appliedStyle}
        >
          {fileData.thumbnail && (
            <Image
              src={fileData.thumbnail}
              alt={loading ? "loading" : "placeholder"}
              fill
              className={`object-cover absolute inset-0 z-0 pointer-events-none select-none transition-opacity duration-300 ${!loading && isVideo ? 'blur-[2px] opacity-50' : ''}`}
              unoptimized
            />
          )}

          {loading && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center z-10 transition-opacity duration-300 ${fileData.thumbnail ? 'bg-black/20 backdrop-blur-[1px]' : 'bg-black/5'}`}>
              {isDecrypting ? (
                <Lock size={24} className="text-white/90 animate-pulse drop-shadow-md mb-2" />
              ) : hasError ? (
                <Download size={24} className="text-red-400 mb-2" />
              ) : (
                <div className="flex flex-col items-center justify-center gap-1">
                  {isVideo && !shouldDownload ? (
                    <Download size={24} className="text-white/80 drop-shadow-md cursor-pointer" />
                  ) : (
                    <Download size={24} className="text-white/80 animate-bounce drop-shadow-md" />
                  )}
                  {progress > 0 && progress < 100 && (
                    <span className="text-xs font-bold text-white drop-shadow-md bg-black/40 px-2 py-0.5 rounded-full">{progress}%</span>
                  )}
                </div>
              )}
              {isVideo && !isDecrypting && !hasError && (
                <PlayCircle size={32} className="text-white/60 drop-shadow-md mt-1 cursor-pointer" />
              )}
            </div>
          )}

          {!loading && blobUrl && isImage && (
            <Image 
              src={blobUrl} 
              alt={fileData.name} 
              width={hasDimensions ? fileData.width : 500}
              height={hasDimensions ? fileData.height : 300}
              className="w-full h-auto max-w-full max-h-64 object-contain transition-opacity duration-500 ease-in-out z-10 relative pointer-events-none select-none" 
              referrerPolicy="no-referrer"
              unoptimized={fileData.isEncrypted || blobUrl.startsWith('blob:')}
            />
          )}

          {!loading && blobUrl && isVideo && (
            <video 
              src={blobUrl} 
              controls 
              className="w-full h-auto max-w-full max-h-64 object-contain z-10 relative" 
              style={hasDimensions && containerStyle ? { width: '100%', height: '100%' } : undefined} 
            />
          )}
        </div>

        {isImage && !loading && blobUrl && (
          <Portal>
            <AnimatePresence>
              {isViewerOpen && (
                <ImageViewer src={blobUrl} alt={fileData.name} onClose={() => setIsViewerOpen(false)} />
              )}
            </AnimatePresence>
          </Portal>
        )}
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-3 bg-white/50 rounded-xl border border-neutral-200">
        <div className={`w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center ${hasError ? '' : 'animate-pulse'}`}>
          {isDecrypting ? <Lock size={20} className="text-indigo-400" /> : <Download size={20} className={hasError ? 'text-red-400' : 'text-neutral-400'} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-700 truncate">{fileData.name}</p>
          {hasError ? (
            <button 
              onClick={() => {
                setHasError(false);
                setProgress(0);
                if (fileData.url && fileData.isEncrypted) {
                  setRetryCount(c => c + 1);
                } else {
                  socket?.emit('webrtc:request_file', { targetId: senderId, fileId: fileData.fileId });
                }
              }}
              className="text-xs text-red-500 hover:text-red-600 font-medium"
            >
              {t('modals.transferFailed')}
            </button>
          ) : (
            <div className="w-full mt-1">
              <div className="flex justify-between text-[10px] text-neutral-500 mb-1">
                <span>{isDecrypting ? t.common?.decrypting || 'Decrypting...' : (progress > 0 ? t.modals?.transferring || 'Downloading...' : (!shouldDownload ? 'Ready to download' : t.modals?.waitingForPeer || 'Connecting...'))}</span>
                <span>{isDecrypting ? '' : `${progress}%`}</span>
              </div>
              {!isDecrypting && (
                <div className="w-full bg-neutral-200 rounded-full h-1.5 overflow-hidden relative">
                  <div className="absolute top-0 left-0 bottom-0 bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
              )}
              {!shouldDownload && (
                <button 
                  onClick={() => setShouldDownload(true)}
                  className="mt-2 text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-100 font-medium hover:bg-indigo-100 transition-colors w-full"
                >
                  Download File
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (fileData.mime.startsWith('audio/')) {
    return (
      <div className="flex flex-col gap-2 max-w-full">
        <div className="flex items-center gap-2">
          <div className="rounded-xl overflow-hidden border border-neutral-200 justify-center min-w-[200px] flex-1 bg-neutral-50 flex items-center p-2">
            <audio src={blobUrl!} controls className="w-full h-10" />
          </div>
        </div>
        {isTranscribing && (
          <div className="flex items-center gap-2 p-2 text-sm text-indigo-600">
            <Type size={16} className="animate-pulse" />
            <span>{t('common.transcribing') || 'Transcribing...'}</span>
          </div>
        )}
        {transcription && (
          <div className="bg-white/80 dark:bg-black/20 p-3 rounded-lg text-sm text-neutral-800 dark:text-neutral-200 border border-neutral-100 dark:border-neutral-800">
            {transcription}
          </div>
        )}
      </div>
    );
  }

  return (
    <a href={blobUrl!} download={fileData.name} className="flex items-center gap-3 p-3 bg-white hover:bg-neutral-50 rounded-xl border border-neutral-200 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
        <FileIcon size={20} />
      </div>
      <div>
        <p className="text-sm font-medium text-neutral-700 truncate max-w-[150px]">{fileData.name}</p>
        <p className="text-xs text-neutral-500">{(fileData.size / 1024).toFixed(1)} KB</p>
      </div>
    </a>
  );
};
