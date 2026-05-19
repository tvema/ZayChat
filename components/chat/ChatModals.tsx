'use client';

import { User, Group, Message } from '@/types/chat';
import { InviteModal } from '@/components/InviteModal';
import { UserInfoModal } from '@/components/UserInfoModal';
import { ProfileModal } from '@/components/ProfileModal';
import { GroupModal } from '@/components/GroupModal';
import { AddMemberModal } from '@/components/AddMemberModal';
import { GroupInfoModal } from '@/components/GroupInfoModal';
import ForwardModal from '@/components/ForwardModal';
import { MoveToCircleModal } from '@/components/MoveToCircleModal';
import { AddToGroupModal } from '@/components/AddToGroupModal';
import AvatarCropper from '@/components/AvatarCropper';
import { useGlobalModal } from '@/components/GlobalModalProvider';
import { useLanguage } from '@/components/LanguageProvider';

import { ContactCirclesModal } from './ContactCirclesModal';

import type { Socket } from 'socket.io-client';

interface ChatModalsProps {
  user: User | null;
  token: string | null;
  socket: Socket | null;
  contacts: User[];
  groups: Group[];
  messages: Message[];
  activeContact: User | null;
  activeGroup: Group | null;

  // Modal visibility states
  showInviteModal: boolean;
  setShowInviteModal: (show: boolean) => void;
  showUserInfoModal: boolean;
  setShowUserInfoModal: (show: boolean) => void;
  showProfileModal: boolean;
  setShowProfileModal: (show: boolean) => void;
  showContactCirclesModal: boolean;
  setShowContactCirclesModal: (show: boolean) => void;
  contactCircles: any[];
  setContactCircles: (circles: any[]) => void;
  unlockedCircles: string[];
  setUnlockedCircles: React.Dispatch<React.SetStateAction<string[]>>;
  showGroupModal: boolean;
  setShowGroupModal: (show: boolean) => void;
  showAddMemberModal: boolean;
  setShowAddMemberModal: (show: boolean) => void;
  showAddToGroupModal: boolean;
  setShowAddToGroupModal: (show: boolean) => void;
  showGroupInfoModal: boolean;
  setShowGroupInfoModal: (show: boolean) => void;
  showForwardModal: boolean;
  setShowForwardModal: (show: boolean) => void;
  showShareModal?: boolean;
  setShowShareModal?: (show: boolean) => void;
  showMoveToCircleModal: boolean;
  setShowMoveToCircleModal: (show: boolean) => void;
  handleAvatarClick: (type: 'user' | 'group', id?: string) => void;

  // Modal specific states
  inviteCode: string | null;
  linkCopied: boolean;
  forwardingMessage: Message | null;
  setForwardingMessage: (message: Message | null) => void;
  sharedFiles?: File[];
  setSharedFiles?: (files: File[]) => void;
  sharedText?: string;
  setSharedText?: (text: string) => void;
  movingContact: User | null;
  setMovingContact: (contact: User | null) => void;
  targetContact: User | null;
  setTargetContact: (contact: User | null) => void;
  avatarToCrop: string | null;
  setAvatarToCrop: (avatar: string | null) => void;

  // Handlers
  handleUpdateProfile: (data: any) => Promise<void>;
  handleChangePassword: (data: any) => Promise<void>;
  handleCropComplete: (croppedBlob: Blob) => Promise<void>;
  handleForward: (recipientId: string, isGroup: boolean) => void;
  handleAddUserToGroup: (userId: string, groupId: string, targetUser?: User) => void;
  
  // State setters for updates
  setContacts: React.Dispatch<React.SetStateAction<User[]>>;
  setActiveContact: React.Dispatch<React.SetStateAction<User | null>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setActiveGroup: React.Dispatch<React.SetStateAction<Group | null>>;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  handleMoveContactToCircle: (contactId: string, toCircleType: 'normal' | 'dnd' | 'blacklist') => void;
}

export function ChatModals({
  user,
  token,
  socket,
  contacts,
  groups,
  messages,
  activeContact,
  activeGroup,
  showInviteModal,
  setShowInviteModal,
  showUserInfoModal,
  setShowUserInfoModal,
  showProfileModal,
  setShowProfileModal,
  showContactCirclesModal,
  setShowContactCirclesModal,
  contactCircles,
  setContactCircles,
  unlockedCircles,
  setUnlockedCircles,
  showGroupModal,
  setShowGroupModal,
  showAddMemberModal,
  setShowAddMemberModal,
  showAddToGroupModal,
  setShowAddToGroupModal,
  showGroupInfoModal,
  setShowGroupInfoModal,
  showForwardModal,
  setShowForwardModal,
  showShareModal,
  setShowShareModal,
  showMoveToCircleModal,
  setShowMoveToCircleModal,
  handleAvatarClick,
  inviteCode,
  linkCopied,
  forwardingMessage,
  setForwardingMessage,
  sharedFiles,
  setSharedFiles,
  sharedText,
  setSharedText,
  movingContact,
  setMovingContact,
  targetContact,
  setTargetContact,
  avatarToCrop,
  setAvatarToCrop,
  handleUpdateProfile,
  handleChangePassword,
  handleCropComplete,
  handleForward,
  handleAddUserToGroup,
  setContacts,
  setActiveContact,
  setGroups,
  setActiveGroup,
  setReplyingTo,
  handleMoveContactToCircle
}: ChatModalsProps) {
  const { t } = useLanguage();

  return (
    <>
      <ContactCirclesModal
        show={showContactCirclesModal}
        onClose={() => setShowContactCirclesModal(false)}
        token={token}
        contacts={contacts}
        contactCircles={contactCircles}
        setContactCircles={setContactCircles}
        unlockedCircles={unlockedCircles}
        setUnlockedCircles={setUnlockedCircles}
        onContactClick={(contact) => {
          setActiveContact(contact);
          setActiveGroup(null);
          setShowContactCirclesModal(false);
        }}
      />

      <InviteModal 
        isOpen={showInviteModal} 
        onClose={() => setShowInviteModal(false)} 
        inviteCode={inviteCode} 
        linkCopied={linkCopied} 
      />

      <UserInfoModal 
        isOpen={showUserInfoModal} 
        onClose={() => setShowUserInfoModal(false)} 
        user={activeContact} 
        currentUser={user}
        messages={messages}
        socket={socket}
        token={token || ''}
      />

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={user}
        onUpdateProfile={handleUpdateProfile}
        onChangePassword={handleChangePassword}
        onAvatarClick={() => handleAvatarClick('user', user?.id)}
      />

      {avatarToCrop && (
        <AvatarCropper
          imageSrc={avatarToCrop}
          onCropComplete={handleCropComplete}
          onCancel={() => setAvatarToCrop(null)}
        />
      )}

      <GroupModal
        isOpen={showGroupModal}
        token={token || ''}
        user={user}
        onClose={() => setShowGroupModal(false)}
        onGroupCreated={(group) => {
          setGroups(prev => [...prev, group]);
          setActiveGroup(group);
          setActiveContact(null);
          setReplyingTo(null);
          if (!activeGroup) window.history.pushState({ chatOpen: true }, '', '#chat');
        }}
      />

      {activeGroup && (
        <AddMemberModal
          isOpen={showAddMemberModal}
          token={token || ''}
          group={activeGroup}
          contacts={contacts}
          onClose={() => setShowAddMemberModal(false)}
          onMemberAdded={() => {
            // Optionally refresh group members or count
          }}
        />
      )}

      <AddToGroupModal
        isOpen={showAddToGroupModal}
        onClose={() => {
          setShowAddToGroupModal(false);
          setTargetContact(null);
        }}
        contact={targetContact}
        groups={groups}
        onAdd={handleAddUserToGroup}
      />

      <GroupInfoModal
        isOpen={showGroupInfoModal}
        onClose={() => setShowGroupInfoModal(false)}
        group={activeGroup}
        token={token || ''}
        currentUser={user}
        messages={messages}
        socket={socket}
        onGroupDeleted={(groupId) => {
          setGroups(prev => prev.filter(g => g.id !== groupId));
          if (activeGroup?.id === groupId) {
            setActiveGroup(null);
            window.history.pushState({ chatOpen: false }, '', '#');
          }
        }}
        onAvatarClick={handleAvatarClick}
      />

      <ForwardModal
        isOpen={showForwardModal}
        onClose={() => {
          setShowForwardModal(false);
          setForwardingMessage(null);
        }}
        onForward={handleForward}
        contacts={contacts}
        groups={groups}
      />

      <ForwardModal
        isOpen={showShareModal || false}
        onClose={() => {
          if (setShowShareModal) setShowShareModal(false);
          if (setSharedFiles) setSharedFiles([]);
          if (setSharedText) setSharedText('');
        }}
        onForward={(recipientId, isGroup) => {
          if (isGroup) {
             const group = groups.find(g => g.id === recipientId);
             if (group) setActiveGroup(group);
             setActiveContact(null);
          } else {
             const contact = contacts.find(c => c.id === recipientId);
             if (contact) setActiveContact(contact);
             setActiveGroup(null);
          }
          if (setShowShareModal) setShowShareModal(false);
          window.history.pushState({ chatOpen: true }, '', '#chat');
          
          if (sharedFiles && sharedFiles.length > 0) {
             // Dispatch after a small timeout to allow UI to mount
             setTimeout(() => {
               window.dispatchEvent(new CustomEvent('attach-shared-file', { detail: { file: sharedFiles[0] } }));
               if (setSharedFiles) setSharedFiles([]);
             }, 300);
          } else if (sharedText) {
             setTimeout(() => {
               window.dispatchEvent(new CustomEvent('attach-shared-text', { detail: { text: sharedText } }));
               if (setSharedText) setSharedText('');
             }, 300);
          }
        }}
        contacts={contacts}
        groups={groups}
        title={t.modals.shareTitle}
      />

      <MoveToCircleModal
        isOpen={showMoveToCircleModal}
        onClose={() => {
          setShowMoveToCircleModal(false);
          setMovingContact(null);
        }}
        contact={movingContact}
        onMove={handleMoveContactToCircle}
        currentCircleType={movingContact?.circle_type || 'normal'}
      />
    </>
  );
}
