import { useState } from 'react';
import { User, Message } from '@/types/chat';

export function useChatModals() {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showContactCirclesModal, setShowContactCirclesModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showMoveToCircleModal, setShowMoveToCircleModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [movingContact, setMovingContact] = useState<User | null>(null);
  const [targetContact, setTargetContact] = useState<User | null>(null);
  const [movingFromCircleId, setMovingFromCircleId] = useState<string | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [sharedFiles, setSharedFiles] = useState<File[]>([]);
  const [sharedText, setSharedText] = useState<string>('');
  
  return {
    showInviteModal, setShowInviteModal,
    showUserInfoModal, setShowUserInfoModal,
    showGroupInfoModal, setShowGroupInfoModal,
    showProfileModal, setShowProfileModal,
    showContactCirclesModal, setShowContactCirclesModal,
    showGroupModal, setShowGroupModal,
    showAddMemberModal, setShowAddMemberModal,
    showAddToGroupModal, setShowAddToGroupModal,
    showForwardModal, setShowForwardModal,
    showMoveToCircleModal, setShowMoveToCircleModal,
    showShareModal, setShowShareModal,
    movingContact, setMovingContact,
    targetContact, setTargetContact,
    movingFromCircleId, setMovingFromCircleId,
    forwardingMessage, setForwardingMessage,
    sharedFiles, setSharedFiles,
    sharedText, setSharedText
  };
}
