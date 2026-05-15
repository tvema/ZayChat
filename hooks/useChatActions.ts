import { useState, useCallback, useRef, ReactNode } from 'react';
import { useGlobalModal } from '@/components/GlobalModalProvider';
import { User, Message, Group } from '@/types/chat';
import { generateImageMetadata, generateVideoMetadata, compressImage } from '@/lib/chatUtils';
import { importKey, decryptAESKeyWithRSA, encryptText, encryptAESKeyWithRSA, encryptFile, arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/crypto';
import { keyRing } from '@/lib/keyRing';

export function useChatActions(token: string | null, activeContact: User | null, activeGroup: Group | null, messages: Message[], socket: any, user: User | null, groups: Group[], contacts: User[], setMessages: any, playMessageSound: (isIncoming: boolean) => void, chatFileInputRef: React.RefObject<HTMLInputElement | null>, replyingTo: Message | null, setReplyingTo: any, setShowEmojiPicker: any, forwardingMessage: Message | null, setShowForwardModal: any, setForwardingMessage: any) {
  const { showAlert } = useGlobalModal();

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!socket || !newContent.trim()) return;
    
    const msg = messages.find((m: Message) => m.id === messageId);
    let finalContent = newContent;
    let finalEncryptionData = msg?.encryption_data;

    if (msg && msg.encryption_data && user) {
      try {
        let aesKey: CryptoKey | null = null;
        
        if (msg.group_id) {
          const group = groups.find((g: Group) => g.id === msg.group_id);
          if (!group || !group.encrypted_keys) throw new Error('Group keys not found');
          let keysObj: Record<string, string>;
          try {
            keysObj = JSON.parse(group.encrypted_keys);
          } catch (e) {
            keysObj = { "1": group.encrypted_keys };
          }
          const encryptedGroupKey = keysObj[msg.encryption_data.key_version?.toString() || "1"];
          if (!encryptedGroupKey) throw new Error('Group key version not found');
          aesKey = await keyRing.getAesKey(encryptedGroupKey);
        } else {
          const encryptedAesKey = msg.encryption_data.keys[user.id];
          aesKey = await keyRing.getAesKey(encryptedAesKey);
        }
        
        if (!aesKey) throw new Error("Could not get aes key");
        
        const newTextIv = window.crypto.getRandomValues(new Uint8Array(12));
        
        finalContent = await encryptText(newContent, aesKey, newTextIv);
        finalEncryptionData = {
          ...msg.encryption_data,
          textIv: arrayBufferToBase64(newTextIv.buffer)
        };
      } catch (e) {
        console.error("Failed to encrypt edited message", e);
        showAlert("Failed to edit encrypted message");
        return;
      }
    }

    socket.emit('message:edit', {
      messageId,
      content: finalContent,
      encryptionData: finalEncryptionData,
      chatId: activeContact?.id || null,
      groupId: activeGroup?.id || null
    });
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!socket) return;
    socket.emit('message:delete', {
      messageId,
      chatId: activeContact?.id || null,
      groupId: activeGroup?.id || null
    });
  };

  const handleSendMessage = async (content: string, rawFile?: File, sendAsOriginal?: boolean, forceUnencrypted: boolean = false) => {
    setShowEmojiPicker(false);
    if ((!content.trim() && !rawFile) || (!activeContact && !activeGroup) || !socket) return;
    
    let file = rawFile;
    if (file && !sendAsOriginal) {
      // Show compression state artificially if needed, but since it's fast we just await
      file = await compressImage(file);
    }
    
    const isE2EE = (activeContact && activeContact.public_key && user?.public_key) || (activeGroup && activeGroup.encrypted_keys && activeGroup.current_key_version);

    if (forceUnencrypted) {
      if (file) {
        const formData = new FormData();
        formData.append('file', file, encodeURIComponent(file.name));

        try {
          const resText = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload');
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                window.dispatchEvent(new CustomEvent('file-upload-progress', { 
                  detail: { name: file.name, progress: percentComplete, status: 'uploading' }
                }));
              }
            };
            
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.responseText);
              } else {
                reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
              }
            };
            
            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.send(formData);
          });

          let data;
          try {
            if (!resText) throw new Error("Empty response body");
            data = JSON.parse(resText);
          } catch(e: any) {
             throw new Error("Invalid JSON from server");
          }

          let mediaMetadata = {};
          if (file.type.startsWith('image/')) {
            mediaMetadata = await generateImageMetadata(file);
          } else if (file.type.startsWith('video/')) {
            mediaMetadata = await generateVideoMetadata(file);
          }

          const metadata = {
            type: 'file',
            url: data.url,
            mime: file.type || 'application/octet-stream',
            name: file.name,
            size: file.size,
            text: content.trim() || undefined,
            isEncrypted: false,
            ...mediaMetadata
          };
          
          socket.emit('message:send', {
            receiverId: activeContact?.id || null,
            groupId: activeGroup?.id || null,
            content: JSON.stringify(metadata),
            replyTo: replyingTo?.id
          });
          
          playMessageSound(false);
          if (chatFileInputRef.current) chatFileInputRef.current.value = '';
          setReplyingTo(null);
        } catch (err: any) {
          console.error('Failed to upload unencrypted file:', err);
          showAlert(`Failed to upload file: ${err.message || 'Unknown error'}`);
        }
      } else {
        // Unencrypted text message not supported via UI bypass right now, only files.
        showAlert('Невозможно отправить текстовое сообщение без шифрования.');
      }
      return;
    }

    if (isE2EE) {
      try {
        let aesKey: CryptoKey;
        let encryptionData: any = {};
        
        if (activeGroup) {
          let keysObj: Record<string, string>;
          try {
            keysObj = JSON.parse(activeGroup.encrypted_keys!);
          } catch (e) {
            keysObj = { "1": activeGroup.encrypted_keys! };
          }
          const encryptedGroupKey = keysObj[activeGroup.current_key_version?.toString() || "1"];
          if (!encryptedGroupKey) throw new Error('Cannot decrypt group key');
          
          const key = await keyRing.getAesKey(encryptedGroupKey);
          if (!key) throw new Error("Could not decrypt aes key");
          aesKey = key;
          encryptionData = { key_version: activeGroup.current_key_version };
        } else if (activeContact && activeContact.public_key && user?.public_key) {
          aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
          const receiverPublicKey = await importKey(activeContact.public_key as string, 'public');
          const senderPublicKey = await importKey(user.public_key as string, 'public');

          const encryptedKeyForReceiver = await encryptAESKeyWithRSA(aesKey, receiverPublicKey);
          const encryptedKeyForSender = await encryptAESKeyWithRSA(aesKey, senderPublicKey);
          
          encryptionData = {
            keys: {
              [activeContact.id]: encryptedKeyForReceiver,
              [user.id]: encryptedKeyForSender
            }
          };
        } else {
          throw new Error('Invalid E2EE state');
        }

        const textIv = window.crypto.getRandomValues(new Uint8Array(12));
        const fileIv = window.crypto.getRandomValues(new Uint8Array(12));
        
        encryptionData.textIv = arrayBufferToBase64(textIv.buffer);
        encryptionData.fileIv = arrayBufferToBase64(fileIv.buffer);
        encryptionData.iv = arrayBufferToBase64(fileIv.buffer); // For backward compatibility
        
        let messageText = content;
        let fileToUpload: Blob | null = null;

        if (file) {
          const fileBuffer = await file.arrayBuffer();
          const { encryptedFile } = await encryptFile(fileBuffer, aesKey, fileIv);
          fileToUpload = encryptedFile;

          const formData = new FormData();
          const safeFileName = encodeURIComponent(file.name);
          if (fileToUpload) {
            formData.append('file', fileToUpload, safeFileName);
          } else {
             formData.append('file', file, safeFileName);
          }

          const resText = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload');
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                window.dispatchEvent(new CustomEvent('file-upload-progress', { 
                  detail: { name: file.name, progress: percentComplete, status: 'uploading' }
                }));
              }
            };
            
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.responseText);
              } else {
                reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
              }
            };
            
            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.send(formData);
          });

          let data;
          try {
            if (!resText) throw new Error("Empty response body");
            try {
               data = JSON.parse(resText);
            } catch(jsonErr: any) {
               console.error("RAW UPLOAD RESPONSE:", resText);
               throw new Error(`Invalid JSON from server (encrypted upload). Raw response: ${resText.substring(0, 100)}`);
            }
          } catch(e: any) {
             throw new Error(e.message);
          }
          
          let mediaMetadata = {};
          if (file.type.startsWith('image/')) {
            mediaMetadata = await generateImageMetadata(file);
          } else if (file.type.startsWith('video/')) {
            mediaMetadata = await generateVideoMetadata(file);
          }

          const metadata = {
            type: 'file',
            url: data.url,
            mime: file.type || 'application/octet-stream',
            name: file.name,
            size: file.size,
            text: content.trim() || undefined,
            isEncrypted: true,
            ...mediaMetadata
          };
          messageText = JSON.stringify(metadata);
        }

        const encryptedTextBase64 = await encryptText(messageText, aesKey, textIv);

        socket.emit('message:send', {
          receiverId: activeContact?.id || null,
          groupId: activeGroup?.id || null,
          content: encryptedTextBase64,
          replyTo: replyingTo?.id,
          encryptionData
        });

        playMessageSound(false);
        if (chatFileInputRef.current) chatFileInputRef.current.value = '';
        setReplyingTo(null);
      } catch (err: any) {
        console.error('Failed to send encrypted message:', err);
        showAlert(`Failed to send encrypted message: ${err.message || 'Unknown error'}`);
      }
    } else {
      // Unencrypted fallback completely REMOVED.
      // We enforce E2EE for all messages within this secure messenger.
      showAlert('Ошибка отправки: Невозможно установить безопасное E2E-соединение. Убедитесь, что у вашего собеседника обновлено приложение и созданы ключи шифрования.');
    }
  };

  const handleForward = async (recipientId: string, isGroup: boolean) => {
    if (!forwardingMessage || !socket) return;

    try {
      // Find the recipient contact or group to check for E2EE
      const targetContact = contacts.find(c => c.id === recipientId);
      const targetGroup = groups.find(g => g.id === recipientId);
      
      const isE2EE = (targetContact && targetContact.public_key && user?.public_key) || 
                     (targetGroup && targetGroup.encrypted_keys && targetGroup.current_key_version);

      let contentToForward = forwardingMessage.content;

      // If the message is currently encrypted, we must decrypt it first before we can re-forward it (if needed)
      // or if we are forwarding to a non-E2EE chat (which is rare now but possible).
      if (forwardingMessage.encryption_data && user) {
        try {
          const encData = typeof forwardingMessage.encryption_data === 'string' ? JSON.parse(forwardingMessage.encryption_data) : forwardingMessage.encryption_data;
          let currentAesKey: CryptoKey | null = null;
          if (forwardingMessage.group_id) {
             const group = groups.find(g => g.id === forwardingMessage.group_id);
             if (group && group.encrypted_keys) {
                let keysObj: Record<string, string>;
                try {
                  keysObj = JSON.parse(group.encrypted_keys);
                } catch (e) {
                  keysObj = { "1": group.encrypted_keys };
                }
                const encryptedGroupKey = keysObj[encData.key_version?.toString() || "1"];
                if (encryptedGroupKey) {
                   currentAesKey = await keyRing.getAesKey(encryptedGroupKey);
                }
             }
          } else {
             const encryptedAesKey = encData.keys && encData.keys[user.id];
             if (encryptedAesKey) {
                currentAesKey = await keyRing.getAesKey(encryptedAesKey);
             }
          }

          if (currentAesKey) {
            // contentToForward is ALREADY decrypted in the UI state!
            // We just need to parse it and attach the fileKey for the new recipient
            try {
              console.log("[handleForward] Parsing contentToForward:", contentToForward);
              const parsed = JSON.parse(contentToForward);
              if (parsed && (parsed.type === 'file' || parsed.url || parsed.fileId) && parsed.isEncrypted) {
                 if (!parsed.fileKey) {
                    const rawKey = await window.crypto.subtle.exportKey('raw', currentAesKey);
                    parsed.fileKey = arrayBufferToBase64(rawKey);
                 }
                 if (!parsed.fileIv) {
                    parsed.fileIv = encData?.fileIv || encData?.iv;
                 }
                 console.log("[handleForward] Attaching E2EE keys to forwarded file object. parsed.fileIv len:", parsed.fileIv?.length, "parsed.fileKey len:", parsed.fileKey?.length);
                 contentToForward = JSON.stringify(parsed);
              } else {
                 console.log("[handleForward] parsed object condition failed:", {
                    isObj: !!parsed,
                    isFile: (parsed.type === 'file' || parsed.url || parsed.fileId),
                    isEnc: parsed.isEncrypted
                 })
              }
            } catch (jsonErr) {
               console.error("[handleForward] JSON Parse error for contentToForward:", jsonErr);
            }
          } else {
             console.log("[handleForward] NO currentAesKey found! forwardingMessage.group_id:", forwardingMessage?.group_id, "encryption_data.keys:", forwardingMessage?.encryption_data?.keys);
          }
        } catch (e) {
          console.error("Failed to decrypt message for forwarding", e);
          // Fallback: if we can't decrypt, we can't forward it securely anyway if target is E2EE
        }
      }

      if (isE2EE) {
        let aesKey: CryptoKey;
        let encryptionData: any = {};
        
        if (targetGroup) {
          let keysObj: Record<string, string>;
          try {
            keysObj = JSON.parse(targetGroup.encrypted_keys!);
          } catch (e) {
            keysObj = { "1": targetGroup.encrypted_keys! };
          }
          const encryptedGroupKey = keysObj[targetGroup.current_key_version?.toString() || "1"];
          if (!encryptedGroupKey) throw new Error('Cannot decrypt group key');
          
          const key = await keyRing.getAesKey(encryptedGroupKey);
          if (!key) throw new Error("Could not decrypt aes key");
          aesKey = key;
          encryptionData = { key_version: targetGroup.current_key_version };
        } else if (targetContact && targetContact.public_key && user?.public_key) {
          aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
          const receiverPublicKey = await importKey(targetContact.public_key as string, 'public');
          const senderPublicKey = await importKey(user.public_key as string, 'public');

          const encryptedKeyForReceiver = await encryptAESKeyWithRSA(aesKey, receiverPublicKey);
          const encryptedKeyForSender = await encryptAESKeyWithRSA(aesKey, senderPublicKey);
          
          encryptionData = {
            keys: {
              [targetContact.id]: encryptedKeyForReceiver,
              [user.id]: encryptedKeyForSender
            }
          };
        } else {
          throw new Error('Invalid E2EE state for forward');
        }

        const textIv = window.crypto.getRandomValues(new Uint8Array(12));
        encryptionData.textIv = arrayBufferToBase64(textIv.buffer);
        
        const encryptedTextBase64 = await encryptText(contentToForward, aesKey, textIv);

        socket.emit('message:send', {
          receiverId: isGroup ? null : recipientId,
          groupId: isGroup ? recipientId : null,
          content: encryptedTextBase64,
          forwardedFrom: forwardingMessage.sender_id,
          encryptionData
        });
      } else {
        // Plaintext forward (e.g. if target doesn't support E2EE yet)
        socket.emit('message:send', {
          receiverId: isGroup ? null : recipientId,
          groupId: isGroup ? recipientId : null,
          content: contentToForward,
          forwardedFrom: forwardingMessage.sender_id
        });
      }

      playMessageSound(false);
      setShowForwardModal(false);
      setForwardingMessage(null);
    } catch (err: any) {
      console.error('Failed to forward message:', err);
      showAlert(`Failed to forward message: ${err.message || 'Unknown error'}`);
    }
  };

  return { handleEditMessage, handleDeleteMessage, handleSendMessage, handleForward };
}
