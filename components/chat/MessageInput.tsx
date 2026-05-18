'use client';
import { safeLocalStorage } from '@/lib/safeStorage';


import { useState, useRef, useEffect } from 'react';
import ContentEditable, { ContentEditableEvent } from 'react-contenteditable';
import { extractTextFromHTML } from '@/lib/richText';
import { Paperclip, SmilePlus, Send, X, Edit2, Mic, Square, Trash2, Type, Camera } from 'lucide-react';
import type { Theme as EmojiTheme } from 'emoji-picker-react';
import dynamic from 'next/dynamic';
const EmojiPicker = dynamic(() => import('emoji-picker-react').then(mod => mod.default), { ssr: false });
import { User, Message, Group } from '@/types/chat';
import { FileAttachment } from '@/components/FileAttachment';
import type { Socket } from 'socket.io-client';
import { useTheme } from 'next-themes';
import { useLanguage } from '../LanguageProvider';
import { CameraModal } from '../CameraModal';
import { CUSTOM_EMOJIS } from '@/lib/chatComponents';

interface MessageInputProps {
  handleSendMessage: (content: string, file?: File, sendAsOriginal?: boolean, forceUnencrypted?: boolean) => Promise<void> | void;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (show: boolean) => void;
  replyingTo: Message | null;
  setReplyingTo: (msg: Message | null) => void;
  editingMessage?: Message | null;
  setEditingMessage?: (msg: Message | null) => void;
  handleEditMessage?: (messageId: string, content: string) => void;
  chatFileInputRef: React.RefObject<HTMLInputElement | null>;
  user: User;
  activeContact: User | null;
  activeGroup: Group | null;
  socket: Socket | null;
  token: string | null;
  droppedFile?: File | null;
  onClearDroppedFile?: () => void;
}

export function MessageInput({
  handleSendMessage,
  showEmojiPicker,
  setShowEmojiPicker,
  replyingTo,
  setReplyingTo,
  editingMessage,
  setEditingMessage,
  handleEditMessage,
  chatFileInputRef,
  user,
  activeContact,
  activeGroup,
  socket,
  token,
  droppedFile,
  onClearDroppedFile
}: MessageInputProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [input, setInput] = useState('');
  const [htmlContent, setHtmlContent] = useState('');

  const parseInputToHTML = (text: string) => {
     let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
     html = html.replace(/\n/g, '<br/>');
     CUSTOM_EMOJIS.forEach((emoji) => {
         const replaceStr = `:${emoji}:`;
         const imgHtml = `<img src="/эмодзи зайчат/${emoji}.png" alt="${emoji}" title="${emoji}" width="28" height="28" style="display:inline-block; vertical-align:text-bottom; margin:0 2px;" class="custom-emoji cursor-default select-none pointer-events-none" unselectable="on" contenteditable="false" />`;
         html = html.split(replaceStr).join(imgHtml);
     });
     return html;
  };

  useEffect(() => {
      const computedHtml = parseInputToHTML(input);
      if (extractTextFromHTML(htmlContent) !== input) {
          setHtmlContent(computedHtml);
      }
  }, [input, htmlContent]);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [sendAsOriginal, setSendAsOriginal] = useState(false);
  const [sendUnencrypted, setSendUnencrypted] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{name: string, progress: number, status: string} | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSubmittingFeed, setIsSubmittingFeed] = useState(false);

  useEffect(() => {
    const handleProgress = (e: any) => {
      setUploadProgress(e.detail);
      if (e.detail.progress >= 100) {
        setTimeout(() => setUploadProgress(null), 1500); // clear after a while
      }
    };
    window.addEventListener('file-upload-progress', handleProgress);
    return () => window.removeEventListener('file-upload-progress', handleProgress);
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const audioFile = new File([audioBlob], `voice-message-${Date.now()}.webm`, { type: 'audio/webm' });
          handleSendMessage('', audioFile);
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert(t.modals?.micAccessError || 'Microphone access denied or not available.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null; // Prevent sending
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      audioChunksRef.current = [];
    }
  };

  const transcribeVoiceToText = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = async () => {
        mediaRecorderRef.current!.stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
        
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setIsTranscribingVoice(true);
          try {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
              reader.onloadend = () => {
                const base64data = reader.result as string;
                const base64 = base64data.split(',')[1];
                resolve(base64);
              };
            });
            reader.readAsDataURL(audioBlob);
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
                mimeType: 'audio/webm'
              })
            });
            if (response.ok) {
              const data = await response.json();
              console.log('Transcription received:', data);
              const text = data.transcription?.trim() || 'No transcription received';
              setInput(prev => prev ? prev + ' ' + text : text);
            } else {
              const errText = await response.text();
              console.warn('Transcription failed:', errText);
              alert(t.common?.error || 'Transcription failed');
            }
          } catch (error) {
            console.warn('Transcription error:', error);
            alert(t.common?.error || 'Transcription failed');
          } finally {
            setIsTranscribingVoice(false);
          }
        }
        audioChunksRef.current = [];
      };
      mediaRecorderRef.current.stop();
    }
  };

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (droppedFile) {
      setPendingFile(droppedFile);
      if (droppedFile.type.startsWith('image/') || droppedFile.type.startsWith('video/')) {
        setPreviewUrl(URL.createObjectURL(droppedFile));
      } else {
        setPreviewUrl(null);
      }
      if (onClearDroppedFile) {
        onClearDroppedFile();
      }
    }
  }, [droppedFile, onClearDroppedFile]);

  useEffect(() => {
    if (editingMessage) {
      let initialText = editingMessage.content;
      const trimmed = initialText.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.type === 'file' || parsed.url || parsed.fileId) {
            initialText = parsed.text || '';
          }
        } catch (e) {}
      }
      setInput(initialText);
      // Robust focus with timeout
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          if ((textareaRef.current as any).value !== undefined && (textareaRef.current as any).setSelectionRange) {
              (textareaRef.current as any).setSelectionRange((textareaRef.current as any).value.length, (textareaRef.current as any).value.length);
          } else {
             const el = textareaRef.current as any;
             const range = document.createRange();
             const sel = window.getSelection();
             range.selectNodeContents(el);
             range.collapse(false);
             sel?.removeAllRanges();
             sel?.addRange(range);
          }
        }
      }, 100);
    } else if (!replyingTo) {
      setInput('');
    }
  }, [editingMessage]);

  useEffect(() => {
    if (replyingTo) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 100);
    }
  }, [replyingTo]);

  const handleInputChange = (e: any) => {
    const val = typeof e.target.value === 'string' ? e.target.value : '';
    setHtmlContent(val);
    const newText = extractTextFromHTML(val);
    setInput(newText);
    
    if (socket && (activeContact || activeGroup)) {
      const chatId = activeGroup?.id || activeContact?.id;
      socket.emit('typing:start', { 
        receiverId: activeContact?.id, 
        groupId: activeGroup?.id,
        chatId
      });

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing:stop', { 
          receiverId: activeContact?.id, 
          groupId: activeGroup?.id,
          chatId
        });
      }, 2000);
    }
  };

  useEffect(() => {
    const handleAttachSharedFile = (e: any) => {
      if (e.detail?.file) {
        const file = e.detail.file;
        setPendingFile(file);
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          setPreviewUrl(URL.createObjectURL(file));
        } else {
          setPreviewUrl(null);
        }
      }
    };
    const handleAttachSharedText = (e: CustomEvent) => {
      if (e.detail && e.detail.text) {
        setInput(prev => prev ? prev + '\n' + e.detail.text : e.detail.text);
        if (textareaRef.current) textareaRef.current.focus();
      }
    };
    window.addEventListener('attach-shared-file', handleAttachSharedFile as EventListener);
    window.addEventListener('attach-shared-text', handleAttachSharedText as EventListener);
    return () => {
       window.removeEventListener('attach-shared-file', handleAttachSharedFile as EventListener);
       window.removeEventListener('attach-shared-text', handleAttachSharedText as EventListener);
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setPendingFile(file);
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        setPreviewUrl(null);
      }
      if (chatFileInputRef.current) {
        chatFileInputRef.current.value = '';
      }
    }
  };

  const clearPendingFile = () => {
    setPendingFile(null);
    setSendUnencrypted(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const uploadAndPostToFeed = async (file: File) => {
    if (!token) return;
    setIsSubmittingFeed(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        const mediaUrl = uploadData.fileId || uploadData.url;
        const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

        const res = await fetch('/api/feed', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({
            content: '',
            media_url: mediaUrl,
            media_type: mediaType
          })
        });

        if (res.ok) {
          // Success! We might want to show a small toast or just close
          console.log('Posted to feed successfully');
        }
      }
    } catch (e) {
      console.error('Failed to post to feed from camera:', e);
    }
    setIsSubmittingFeed(false);
  };

  const onSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    let isFileMessage = false;
    const trimmedEditing = editingMessage ? editingMessage.content.trim() : '';
    if (editingMessage && trimmedEditing.startsWith('{') && trimmedEditing.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmedEditing);
        if (parsed.type === 'file' || parsed.url || parsed.fileId) {
          isFileMessage = true;
        }
      } catch (e) {}
    }

    if (!input.trim() && !pendingFile && !isFileMessage) return;
    
    if (editingMessage && handleEditMessage && setEditingMessage) {
      let newContent = input;
      if (isFileMessage) {
        try {
          const parsed = JSON.parse(trimmedEditing);
          parsed.text = input.trim();
          newContent = JSON.stringify(parsed);
        } catch (e) {}
      }
      handleEditMessage(editingMessage.id, newContent);
      setEditingMessage(null);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

    if (socket && (activeContact || activeGroup)) {
      const chatId = activeGroup?.id || activeContact?.id;
      socket.emit('typing:stop', { 
        receiverId: activeContact?.id, 
        groupId: activeGroup?.id,
        chatId
      });
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }

    const isForcedUnencrypted = pendingFile && pendingFile.type.startsWith('video/') && pendingFile.size > 20 * 1024 * 1024;
    const finalSendUnencrypted = isForcedUnencrypted ? true : sendUnencrypted;

    handleSendMessage(input, pendingFile || undefined, sendAsOriginal, finalSendUnencrypted);
    setInput('');
    clearPendingFile();
    setSendAsOriginal(false);
    setSendUnencrypted(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handlePaste = (e: any) => {
    // @ts-ignore
    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      // @ts-ignore
      const file = e.clipboardData.files[0];
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        e.preventDefault();
        setPendingFile(file);
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        e.preventDefault();
        setPendingFile(file);
        setPreviewUrl(null);
      }
    }
  };

  return (
    <footer className="p-4 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 shrink-0 relative">
      {showEmojiPicker && (
        <div className="absolute bottom-full left-4 mb-2 z-50 shadow-2xl rounded-2xl overflow-hidden border border-neutral-100 dark:border-neutral-800 max-w-[calc(100vw-32px)]">
          <EmojiPicker 
            onEmojiClick={(emojiData: any) => {
              if (emojiData.isCustom) {
                const customId = emojiData.names?.[0] || emojiData.unified || emojiData.id;
                setInput(prev => prev + `:${customId}:`);
              } else {
                setInput(prev => prev + emojiData.emoji);
              }
              setShowEmojiPicker(false);
              setTimeout(() => {
                textareaRef.current?.focus();
              }, 0);
            }} 
            customEmojis={CUSTOM_EMOJIS.map(name => ({
              id: name,
              names: [name],
              imgUrl: `/эмодзи зайчат/${name}.png`
            }))}
            width="100%" 
            theme={(theme === 'dark' ? 'dark' : 'light') as EmojiTheme}
          />
        </div>
      )}
      {showEmojiPicker && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowEmojiPicker(false)}
        />
      )}
      {editingMessage && setEditingMessage && (
        <div className="max-w-4xl mx-auto mb-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 flex items-start justify-between relative z-50 border border-indigo-100 dark:border-indigo-800/30">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1 flex items-center gap-1">
              <Edit2 size={12} /> {t('common.edit') || 'Edit Message'}
            </p>
            <div className="text-sm text-neutral-600 dark:text-neutral-300">
              <span className="whitespace-pre-wrap break-words line-clamp-2">
                {(() => {
                  const trimmed = editingMessage.content.trim();
                  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    try {
                      const parsed = JSON.parse(trimmed);
                      if (parsed.type === 'file' || parsed.url || parsed.fileId) {
                        return parsed.text || t('modals.fileAttachment');
                      }
                    } catch (e) {}
                  }
                  return editingMessage.content;
                })()}
              </span>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => {
              setEditingMessage(null);
              setInput('');
            }}
            className="p-1 text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {replyingTo && !editingMessage && (
        <div className="max-w-4xl mx-auto mb-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-3 flex items-start justify-between relative z-50 border border-neutral-200 dark:border-neutral-700">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
              {t('modals.replyingTo')} {replyingTo.sender_id === user.id ? t('modals.yourself') : (replyingTo.sender_username || activeContact?.first_name || 'User')}
            </p>
            <div className="text-sm text-neutral-600 dark:text-neutral-300">
              {(() => {
                const trimmed = replyingTo.content.trim();
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                  try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.type === 'file' || parsed.url || parsed.fileId) {
                      return (
                        <div className="flex flex-col gap-1">
                          <FileAttachment fileData={parsed} senderId={replyingTo.sender_id} socket={socket} isThumbnail={true} encryptionData={replyingTo.encryption_data} activeGroup={activeGroup} />
                          {parsed.text && <span className="whitespace-pre-wrap break-words line-clamp-1">{parsed.text}</span>}
                        </div>
                      );
                    }
                  } catch (e) {}
                  return <span className="truncate">{t('modals.fileAttachment')}</span>;
                }
                return <span className="whitespace-pre-wrap break-words line-clamp-2">{replyingTo.content}</span>;
              })()}
            </div>
          </div>
          <button 
            type="button"
            onClick={() => setReplyingTo(null)}
            className="p-1 text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {pendingFile && (
        <div className="max-w-4xl mx-auto mb-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-3 flex items-start justify-between relative z-50 border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-4 min-w-0 pr-4">
            {previewUrl ? (
              pendingFile.type.startsWith('video/') ? (
                <video src={previewUrl} className="w-24 h-24 object-cover rounded-lg border border-neutral-200 dark:border-neutral-700" controls={false} />
              ) : (
                <img src={previewUrl} alt="Preview" className="w-24 h-24 object-cover rounded-lg border border-neutral-200 dark:border-neutral-700" />
              )
            ) : (
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center shrink-0">
                <Paperclip size={28} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">{pendingFile.name}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{(pendingFile.size / 1024 / 1024).toFixed(2)} MB</p>
              {pendingFile.type.startsWith('image/') && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-neutral-600 dark:text-neutral-300">
                  <input 
                    type="checkbox" 
                    checked={sendAsOriginal} 
                    onChange={(e) => setSendAsOriginal(e.target.checked)}
                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                  />
                  <span>Отправить без сжатия (оригинал)</span>
                </label>
              )}
              {pendingFile.type.startsWith('video/') && (
                <div className="mt-2 text-xs">
                  <label className={`flex items-center gap-2 cursor-pointer font-medium ${pendingFile.size > 20 * 1024 * 1024 ? 'text-red-600 dark:text-red-400 opacity-90' : 'text-orange-600 dark:text-orange-400'}`}>
                    <input 
                      type="checkbox" 
                      checked={pendingFile.size > 20 * 1024 * 1024 ? true : sendUnencrypted} 
                      disabled={pendingFile.size > 20 * 1024 * 1024}
                      onChange={(e) => setSendUnencrypted(e.target.checked)}
                      className="rounded border-orange-300 text-orange-600 focus:ring-orange-500 bg-white"
                    />
                    <span>Отправить без шифрования (включит стриминг)</span>
                  </label>
                  {pendingFile.size > 20 * 1024 * 1024 ? (
                    <p className="mt-1 text-red-500/80 dark:text-red-400/80 ml-5">
                      Это видео слишком велико ({'>'} 20МБ) для E2E-шифрования. Оно будет отправлено в открытом виде для мгновенного стриминга.
                    </p>
                  ) : (
                    <p className="mt-1 text-orange-500/80 dark:text-orange-400/80 ml-5">
                      Вы можете снять замочек, чтобы видео проигрывалось мгновенно по кусочкам. Идеально для длинных видео ("с котиками").
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <button 
            type="button"
            onClick={clearPendingFile}
            className="p-1 text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}
      
      {uploadProgress && (
        <div className="max-w-4xl mx-auto mb-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-3 relative z-50 border border-indigo-100 dark:border-indigo-800 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1.5">
              <span className="truncate pr-4">Отправка {uploadProgress.name}</span>
              <span className="shrink-0">{uploadProgress.progress}%</span>
            </div>
            <div className="w-full bg-indigo-100 dark:bg-indigo-900 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-200 ease-out" 
                style={{ width: `${uploadProgress.progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="flex items-end gap-2 max-w-4xl mx-auto relative z-50">
        <div className="flex-1 min-w-0 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-transparent focus-within:border-indigo-300 dark:focus-within:border-indigo-500 focus-within:bg-white dark:focus-within:bg-neutral-900 focus-within:ring-4 focus-within:ring-indigo-50 dark:focus-within:ring-indigo-900/20 transition-all flex items-end px-2 py-1">
          {!isRecording ? (
            <>
              <input type="file" ref={chatFileInputRef} onChange={handleFileSelect} className="hidden" />
              <button 
                type="button" 
                onClick={() => setIsCameraOpen(true)}
                className="md:hidden p-2 mb-1 text-neutral-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                title="Camera"
              >
                <Camera size={20} />
              </button>
              <button 
                type="button" 
                onClick={() => chatFileInputRef.current?.click()}
                className="p-2 mb-1 text-neutral-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                title={t.modals?.attachFile}
              >
                <Paperclip size={20} />
              </button>
              <button 
                type="button" 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2 mb-1 text-neutral-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                <SmilePlus size={20} />
              </button>
              <ContentEditable
                innerRef={textareaRef as any}
                html={htmlContent}
                disabled={isTranscribingVoice}
                onChange={(e) => {
                  handleInputChange(e);
                  setTimeout(() => {
                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto';
                      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
                    }
                  }, 0);
                }}
                onKeyDown={(e: any) => {
                    handleKeyDown(e);
                }}
                onPaste={handlePaste as any}
                className={"flex-1 bg-transparent border-none py-2.5 px-3 focus:outline-none text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 min-h-[44px] max-h-32 text-[15px] leading-relaxed break-words overflow-y-auto whitespace-pre-wrap outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-neutral-400 empty:before:pointer-events-none empty:before:block"}
                data-placeholder={isTranscribingVoice ? (t.common?.transcribing || 'Transcribing...') : (t.modals?.typeMessage || 'Type a message...')}
              />
            </>
          ) : (
            <div className="flex-1 min-h-[44px] flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                <span className="text-red-500 font-mono font-medium">{formatRecordingTime(recordingSeconds)}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={transcribeVoiceToText}
                  className="text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2"
                  title={t.common?.transcribe || 'Voice to Text'}
                >
                  <Type size={20} />
                </button>
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400 transition-colors p-2"
                  title={t.common?.cancel || 'Cancel'}
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
        
        {(!input.trim() && !pendingFile && !isRecording) ? (
          <button 
            type="button"
            onClick={startRecording}
            disabled={isTranscribingVoice}
            className="w-12 h-12 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center shrink-0 hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isTranscribingVoice ? <Type size={20} className="animate-pulse" /> : <Mic size={20} />}
          </button>
        ) : (
          <button 
            type={isRecording ? "button" : "submit"}
            onClick={isRecording ? stopRecording : undefined}
            disabled={(!isRecording && !input.trim() && !pendingFile) || isTranscribingVoice}
            className="w-12 h-12 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center shrink-0 hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Send size={20} className={isRecording ? "" : "ml-1"} />
          </button>
        )}
      </form>
      <CameraModal 
        isOpen={isCameraOpen} 
        onClose={() => setIsCameraOpen(false)} 
        onCapture={(file) => {
          setPendingFile(file);
          setPreviewUrl(URL.createObjectURL(file));
        }}
        onPostToFeed={uploadAndPostToFeed}
      />
    </footer>
  );
}
