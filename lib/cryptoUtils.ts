import { Message, Group } from '@/types/chat';
import { encryptFile, decryptFile, decryptAESKeyWithRSA, importKey, base64ToArrayBuffer, encryptText, decryptText, encryptAESKeyWithRSA, arrayBufferToBase64, encryptPrivateKeyWithPassword } from '@/lib/crypto';
import { keyRing } from '@/lib/keyRing';

export const decryptMessageIfNeeded = async (msg: Message, currentUserId?: string, groups?: Group[]): Promise<Message> => {
  if (!msg.encryption_data) return msg;
  if (!currentUserId) return msg;

  try {
    const encData = typeof msg.encryption_data === 'string' ? JSON.parse(msg.encryption_data) : msg.encryption_data;
    
    let encryptedAesKeyToUse: string | undefined;

    if (msg.group_id) {
      if (!groups) return msg;
      const group = groups.find(g => g.id === msg.group_id);
      if (!group || !group.encrypted_keys) return msg;
      
      let keysObj: Record<string, string>;
      try {
        keysObj = JSON.parse(group.encrypted_keys);
      } catch (e) {
        keysObj = { "1": group.encrypted_keys };
      }
      encryptedAesKeyToUse = keysObj[encData.key_version?.toString() || "1"];
    } else {
      if (!encData.keys || !encData.keys[currentUserId]) return msg;
      encryptedAesKeyToUse = encData.keys[currentUserId];
    }
    
    if (!encryptedAesKeyToUse) return msg;
    
    const aesKey = await keyRing.getAesKey(encryptedAesKeyToUse);
    if (!aesKey) return msg;
    
    const textIvBase64 = encData.textIv || encData.iv;
    if (!textIvBase64) return msg;

    const iv = new Uint8Array(base64ToArrayBuffer(textIvBase64));
    const decryptedText = await decryptText(msg.content, aesKey, iv);

    return {
      ...msg,
      encrypted_content: msg.encrypted_content || msg.content,
      content: decryptedText,
      encryption_data: encData
    };
  } catch (e) {
    console.error('Failed to decrypt message', msg.id, e);
    return { ...msg, content: '🔒 [Encrypted Message]' };
  }
};
