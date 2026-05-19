'use client';

import { useEffect, useState, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { useWebRTC } from '@/hooks/useWebRTC';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Sidebar } from '@/components/chat/Sidebar';
import { MainChatArea } from '@/components/chat/MainChatArea';
import { FeedView } from '@/components/feed/FeedView';
import { CallOverlay } from '@/components/chat/CallOverlay';
import { ChatModals } from '@/components/chat/ChatModals';
import TriggeredRemindersOverlay from '@/components/chat/TriggeredRemindersOverlay';
import { safeLocalStorage } from '@/lib/safeStorage';

export default function ChatApp() {
  useEffect(() => {
    // Import webrtc-adapter only on the client
    import('webrtc-adapter').catch(err => {
      console.warn('WebRTC adapter chunk failed to load. This might be due to a server restart. Refresh the page to fix.', err);
    });

    // Handle chunk loading errors globally
    const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const message = 'message' in event ? event.message : (event as any).reason?.message;
      if (message && message.includes('Loading chunk')) {
        console.warn('Chunk loading error detected. Attempting to recover...', message);
        // We could force a reload here, but let's just log it for now to avoid loops if the server is really down
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, []);

  const chat = useChat();
  const { socket, token, contacts, groups, activeContact, activeGroup, handleContactClick, setMessages, setActiveGroup, setActiveContact, setReplyingTo, user } = chat;
  const webrtc = useWebRTC(socket);
  const { callState, callPeerId, acceptCall, expectCall, rejectCall } = webrtc;
  const { permission, subscribeToPush } = usePushNotifications(token);

  useEffect(() => {
    if (token && permission === 'granted') {
        subscribeToPush(false).catch(err => {
          console.warn('Auto-subscribe to push failed:', err);
        });
    }
  }, [token, permission, subscribeToPush]);

  const [pendingDeepLink, setPendingDeepLink] = useState<string | null>(null);
  const [autoAnswerId, setAutoAnswerId] = useState<string | null>(null);

  useEffect(() => {
    if (autoAnswerId) {
       // Only answer when we are in receiving state AND socket is fully connected
       if (callState === 'receiving' && callPeerId === autoAnswerId && socket?.connected) {
         console.log('[Page] Auto-answering call from:', autoAnswerId);
         // Small delay to ensure server has registered this new socket session
         const timer = setTimeout(() => {
           acceptCall(autoAnswerId);
           setAutoAnswerId(null);
         }, 1000);
         return () => clearTimeout(timer);
       } else if (callState === 'idle' || callState === 'connected') {
         if (callState === 'connected' && callPeerId === autoAnswerId) {
           console.log('[Page] Already connected to:', autoAnswerId, 'clearing auto-answer');
           setAutoAnswerId(null);
           return;
         }
         // Clear if missed or timed out
         const timer = setTimeout(() => {
           if (callState === 'idle' && autoAnswerId) {
             console.log('[Page] Auto-answer timed out (still idle)');
             setAutoAnswerId(null);
           }
         }, 30000); // 30 seconds for warm-up
         return () => clearTimeout(timer);
       }
    }
  }, [autoAnswerId, callState, callPeerId, acceptCall, socket?.connected]);

  // 1. Initial capture of deep link on full page load
  useEffect(() => {
    if (typeof window !== 'undefined') {
       const searchParams = new URLSearchParams(window.location.search);
       if (searchParams.has('chat') || searchParams.has('group')) {
         setPendingDeepLink(window.location.href);
       }
    }
  }, []);

  // 2. Setup long-lived Service Worker listener
  // We use refs inside the listener to always have the latest values without re-subscribing often
  const callStateRef = useRef(callState);
  const callPeerIdRef = useRef(callPeerId);
  const socketRef = useRef(socket);
  const rejectCallRef = useRef(rejectCall);

  useEffect(() => {
    callStateRef.current = callState;
    callPeerIdRef.current = callPeerId;
    socketRef.current = socket;
    rejectCallRef.current = rejectCall;
  }, [callState, callPeerId, socket, rejectCall]);

  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PUSH_NAVIGATE' && event.data.url) {
        console.log('[Page] SW PUSH_NAVIGATE:', event.data.url);
        setPendingDeepLink(event.data.url);
      } else if (event.data && event.data.type === 'PUSH_REJECT_CALL' && event.data.targetId) {
        const targetId = event.data.targetId;
        console.log('[Page] SW PUSH_REJECT_CALL for:', targetId);
        
        // Handle immediate rejection if possible
        if (socketRef.current?.connected) {
           socketRef.current.emit('webrtc:call_reject', { targetId });
        }
        if (rejectCallRef.current) {
           rejectCallRef.current(targetId);
        }
      }
    };
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      };
    }
  }, []); // Only once

  // 3. Process the captured deep link safely
  // We use many refs here to keep the dependency array small and avoid infinite loops
  const contactsRef = useRef(contacts);
  const groupsRef = useRef(groups);
  const activeContactRef = useRef(activeContact);
  const activeGroupRef = useRef(activeGroup);
  
  useEffect(() => {
    contactsRef.current = contacts;
    groupsRef.current = groups;
    activeContactRef.current = activeContact;
    activeGroupRef.current = activeGroup;
  }, [contacts, groups, activeContact, activeGroup]);

  useEffect(() => {
    if (!pendingDeepLink || !token || !socket) return;

    let isActive = true;

    const processUrl = async () => {
      try {
        const urlString = pendingDeepLink; // Snapshot it
        const url = new URL(urlString, window.location.origin);
        const chatId = url.searchParams.get('chat');
        const groupId = url.searchParams.get('group');
        const autoAnswer = url.searchParams.get('answer') === 'true';
        const rejectCallParam = url.searchParams.get('reject_call') === 'true';

        console.log('[Page] Processing Deep Link:', urlString, { chatId, groupId, autoAnswer, rejectCallParam });

        if (rejectCallParam && chatId) {
          console.log('[Page] Handling explicit rejection deep link for:', chatId);
          // Wait for socket if it's not connected
          if (socketRef.current && !socketRef.current.connected) {
            let attempts = 0;
            while (socketRef.current && !socketRef.current.connected && attempts < 50) {
              await new Promise(r => setTimeout(r, 100));
              attempts++;
            }
          }

          if (socketRef.current?.connected) {
            if (callPeerIdRef.current === chatId || callStateRef.current === 'receiving') {
               rejectCallRef.current(chatId);
            } else {
               socketRef.current.emit('webrtc:call_reject', { targetId: chatId });
               rejectCallRef.current(chatId);
            }
          }
          
          setPendingDeepLink(null);
          window.history.replaceState({}, '', '/');
          return; // STOP HERE for rejection
        }

        // Auto-select private chat (Answer/Navigate flow)
        if (chatId) {
           let contact = contactsRef.current.find((c: any) => c.id === chatId);
           
           // If contact not in current list, try to fetch or wait for it
           if (!contact) {
              try {
                console.log('[Page] Contact not in list, searching...', chatId);
                const res = await fetch('/api/contacts', { headers: { 'Authorization': `Bearer ${token}` }});
                if (res.ok) {
                  const data = await res.json();
                  contact = data.find((c: any) => c.id === chatId);
                }
                if (!contact) {
                  const searchRes = await fetch(`/api/users/search?q=${chatId}`, { headers: { 'Authorization': `Bearer ${token}` }});
                  if (searchRes.ok) {
                    const searchData = await searchRes.json();
                    contact = searchData.find((c: any) => c.id === chatId);
                  }
                }
              } catch(e) { console.error(e) }
           }
           
           if (!isActive) return;

           // FORCE NAVIGATION even if we only have the ID (fallback object)
           const navigationContact = contact || { 
             id: chatId, 
             username: 'User', 
             first_name: 'User',
             last_name: '',
             avatar_url: null,
             online: true 
           } as any;
           
           console.log('[Page] Navigating to contact:', navigationContact.id);
           handleContactClick(navigationContact);
           
           if (autoAnswer) {
             console.log('[Page] Deep link auto-answering call from:', chatId);
             expectCall(chatId);
             setAutoAnswerId(chatId);
           }

           setPendingDeepLink(null);
           window.history.replaceState({}, '', '/');
        }
        
        // Auto-select group chat
        else if (groupId) {
           let group = groupsRef.current.find((g: any) => g.id === groupId);
           if (!group) {
              try {
                const res = await fetch('/api/groups', { headers: { 'Authorization': `Bearer ${token}` }});
                if (res.ok) {
                  const data = await res.json();
                  group = data.find((g: any) => g.id === groupId);
                }
              } catch(e) { console.error(e) }
           }

           if (!isActive) return;

           if (group) {
             if (activeGroupRef.current?.id !== groupId) {
               setMessages([]);
               setActiveGroup(group);
               setActiveContact(null);
               setReplyingTo(null);
             }
             setPendingDeepLink(null);
             window.history.replaceState({}, '', '/');
           }
        } 
        else {
           setPendingDeepLink(null);
        }
      } catch (e) {
        console.error('Failed to parse push URL', e);
        setPendingDeepLink(null);
      }
    };
    
    processUrl();

    return () => { isActive = false; };
  }, [pendingDeepLink, token, socket, acceptCall, handleContactClick, setMessages, setActiveGroup, setActiveContact, setReplyingTo]); 


  const [loadingTimeout, setLoadingTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!user) {
        setLoadingTimeout(true);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [user]);

  if (!user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-900/30 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
          {loadingTimeout && (
            <div className="flex flex-col items-center gap-2">
              <div className="text-sm text-neutral-500 animate-pulse">
                Loading taking longer than expected...
              </div>
              <button 
                onClick={() => window.location.href = '/login'}
                className="text-xs text-indigo-500 hover:underline"
              >
                Go to login manually
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex bg-neutral-100 dark:bg-neutral-950 font-sans overflow-hidden no-scrollbar">
      <Sidebar
        user={user!}
        token={chat.token}
        contacts={chat.contacts}
        groups={chat.groups}
        contactCircles={chat.contactCircles}
        setContactCircles={chat.setContactCircles}
        unlockedCircles={chat.unlockedCircles}
        setUnlockedCircles={chat.setUnlockedCircles}
        activeContact={chat.activeContact}
        activeGroup={chat.activeGroup}
        searchQuery={chat.searchQuery}
        isSearching={chat.isSearching}
        searchResults={chat.searchResults}
        messageSearchResults={chat.messageSearchResults}
        handleSearch={chat.handleSearch}
        handleMessageResultClick={chat.handleMessageResultClick}
        handleAddContact={chat.handleAddContact}
        handleContactClick={chat.handleContactClick}
        handleGroupClick={(group) => {
          if (chat.appView === 'feed') chat.setAppView('messages');
          if (chat.activeGroup?.id === group.id) return; // Prevent re-opening the same group
          if (!chat.activeGroup) window.history.pushState({ chatOpen: true }, '', '#chat');
          chat.setMessages([]); // Clear messages synchronously
          chat.setActiveGroup(group);
          chat.setActiveContact(null);
          chat.setReplyingTo(null);
        }}
        handleAvatarClick={() => chat.handleAvatarClick('user', user!.id)}
        handleAvatarChange={chat.handleAvatarChange}
        setShowGroupModal={chat.setShowGroupModal}
        setShowProfileModal={chat.setShowProfileModal}
        setShowContactCirclesModal={chat.setShowContactCirclesModal}
        setShowUserInfoModal={chat.setShowUserInfoModal}
        handleGenerateInvite={chat.handleGenerateInvite}
        handleLogout={chat.handleLogout}
        avatarInputRef={chat.avatarInputRef}
        sidebarView={chat.sidebarView}
        setSidebarView={chat.setSidebarView}
        appView={chat.appView}
        setAppView={chat.setAppView}
        hasUnreadFeed={chat.hasUnreadFeed}
        handleRemoveContact={chat.handleRemoveContact}
        handleClearChat={chat.handleClearChat}
        handleMoveContactToCircle={chat.handleMoveContactToCircle}
        setShowMoveToCircleModal={chat.setShowMoveToCircleModal}
        setMovingContact={chat.setMovingContact}
        setShowAddToGroupModal={chat.setShowAddToGroupModal}
        setTargetContact={chat.setTargetContact}
        reminders={chat.reminders}
        feedPosts={chat.feedPosts}
        selectedFeedUserId={chat.selectedFeedUserId}
        setSelectedFeedUserId={chat.setSelectedFeedUserId}
      />

      {chat.appView === 'feed' ? (
        <FeedView 
          user={user!} 
          token={token || ''} 
          socket={socket} 
          setHasUnreadFeed={chat.setHasUnreadFeed} 
          onBack={() => {
            if (chat.selectedFeedUserId) {
              chat.setSelectedFeedUserId(null);
            } else {
              chat.setAppView('messages');
            }
          }}
          setShowForwardModal={chat.setShowForwardModal}
          setForwardingMessage={chat.setForwardingMessage}
          posts={chat.feedPosts}
          setPosts={chat.setFeedPosts}
          selectedFeedUserId={chat.selectedFeedUserId}
          setSelectedFeedUserId={chat.setSelectedFeedUserId}
        />
      ) : (
      <MainChatArea
        user={user!}
        contacts={chat.contacts}
        activeContact={activeContact}
        activeGroup={activeGroup}
        messages={chat.messages}
        typingUsers={chat.typingUsers}
        socket={chat.socket}
        replyingTo={chat.replyingTo}
        setReplyingTo={chat.setReplyingTo}
        showEmojiPicker={chat.showEmojiPicker}
        setShowEmojiPicker={chat.setShowEmojiPicker}
        reactionMessageId={chat.reactionMessageId}
        setReactionMessageId={chat.setReactionMessageId}
        selectedMessageId={chat.selectedMessageId}
        setSelectedMessageId={chat.setSelectedMessageId}
        setForwardingMessage={chat.setForwardingMessage}
        setShowForwardModal={chat.setShowForwardModal}
        messagesEndRef={chat.messagesEndRef}
        chatFileInputRef={chat.chatFileInputRef}
        handleSendMessage={chat.handleSendMessage}
        handleEditMessage={chat.handleEditMessage}
        handleDeleteMessage={chat.handleDeleteMessage}
        editingMessage={chat.editingMessage}
        setEditingMessage={chat.setEditingMessage}
        handleReaction={chat.handleReaction}
        handleBackClick={chat.handleBackClick}
        setShowUserInfoModal={chat.setShowUserInfoModal}
        setShowGroupInfoModal={chat.setShowGroupInfoModal}
        setShowAddMemberModal={chat.setShowAddMemberModal}
        startCall={webrtc.startCall}
        handleRemoveContact={chat.handleRemoveContact}
        handleClearChat={chat.handleClearChat}
        handleLeaveGroup={chat.handleLeaveGroup}
        setShowMoveToCircleModal={chat.setShowMoveToCircleModal}
        setMovingContact={chat.setMovingContact}
        setShowAddToGroupModal={chat.setShowAddToGroupModal}
        setTargetContact={chat.setTargetContact}
        loadMoreMessages={chat.loadMoreMessages}
        hasMoreMessages={chat.hasMoreMessages}
        isLoadingMore={chat.isLoadingMore}
        scrollPositionsRef={chat.scrollPositionsRef}
        reminders={chat.reminders}
        pinnedMessages={chat.pinnedMessages}
        handleSetReminder={chat.handleSetReminder}
        handleEditReminder={chat.handleEditReminder}
        handleDeleteReminder={chat.handleDeleteReminder}
        handlePinMessage={chat.handlePinMessage}
        handleUnpinMessage={chat.handleUnpinMessage}
        handleAddContact={chat.handleAddContact}
        handleBlockContact={chat.handleBlockContact}
        inChatSearchQuery={chat.inChatSearchQuery}
        isInChatSearching={chat.isInChatSearching}
        handleInChatSearch={chat.handleInChatSearch}
        setInChatSearchQuery={chat.setInChatSearchQuery}
        isSearchOpen={chat.isSearchOpen}
        setIsSearchOpen={chat.setIsSearchOpen}
        highlightedMessageId={chat.highlightedMessageId}
        setHighlightedMessageId={chat.setHighlightedMessageId}
        token={chat.token}
      />
      )}

      <CallOverlay
        callState={webrtc.callState}
        callPeerId={webrtc.callPeerId}
        contacts={chat.contacts}
        isVideoEnabled={webrtc.isVideoEnabled}
        isMediaActive={webrtc.isMediaActive}
        isPeerMediaActive={webrtc.isPeerMediaActive}
        isPeerVideoActive={webrtc.isPeerVideoActive}
        remoteStreamVersion={webrtc.remoteStreamVersion}
        isScreenSharing={webrtc.isScreenSharing}
        facingMode={webrtc.facingMode}
        localVideoRef={webrtc.localVideoRef}
        remoteVideoRef={webrtc.remoteVideoRef}
        localStream={webrtc.localStream}
        remoteStream={webrtc.remoteStream}
        toggleScreenShare={webrtc.toggleScreenShare}
        toggleVideo={webrtc.toggleVideo}
        switchCamera={webrtc.switchCamera}
        endCall={webrtc.endCall}
        rejectCall={webrtc.rejectCall}
        acceptCall={webrtc.acceptCall}
        reportMediaActive={webrtc.reportMediaActive}
        reportMediaStatus={webrtc.reportMediaStatus}
      />

      <input 
        type="file" 
        ref={chat.avatarInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={chat.handleAvatarChange}
      />

      <ChatModals
        user={user!}
        token={token}
        socket={socket}
        contacts={contacts}
        groups={groups}
        messages={chat.messages}
        activeContact={activeContact}
        activeGroup={activeGroup}
        showInviteModal={chat.showInviteModal}
        setShowInviteModal={chat.setShowInviteModal}
        showUserInfoModal={chat.showUserInfoModal}
        setShowUserInfoModal={chat.setShowUserInfoModal}
        showProfileModal={chat.showProfileModal}
        setShowProfileModal={chat.setShowProfileModal}
        showContactCirclesModal={chat.showContactCirclesModal}
        setShowContactCirclesModal={chat.setShowContactCirclesModal}
        contactCircles={chat.contactCircles}
        setContactCircles={chat.setContactCircles}
        unlockedCircles={chat.unlockedCircles}
        setUnlockedCircles={chat.setUnlockedCircles}
        showGroupModal={chat.showGroupModal}
        setShowGroupModal={chat.setShowGroupModal}
        showAddMemberModal={chat.showAddMemberModal}
        setShowAddMemberModal={chat.setShowAddMemberModal}
        showAddToGroupModal={chat.showAddToGroupModal}
        setShowAddToGroupModal={chat.setShowAddToGroupModal}
        showGroupInfoModal={chat.showGroupInfoModal}
        setShowGroupInfoModal={chat.setShowGroupInfoModal}
        showForwardModal={chat.showForwardModal}
        setShowForwardModal={chat.setShowForwardModal}
        showShareModal={chat.showShareModal}
        setShowShareModal={chat.setShowShareModal}
        showMoveToCircleModal={chat.showMoveToCircleModal}
        setShowMoveToCircleModal={chat.setShowMoveToCircleModal}
        inviteCode={chat.inviteCode}
        linkCopied={chat.linkCopied}
        forwardingMessage={chat.forwardingMessage}
        setForwardingMessage={chat.setForwardingMessage}
        sharedFiles={chat.sharedFiles}
        setSharedFiles={chat.setSharedFiles}
        sharedText={chat.sharedText}
        setSharedText={chat.setSharedText}
        movingContact={chat.movingContact}
        setMovingContact={chat.setMovingContact}
        targetContact={chat.targetContact}
        setTargetContact={chat.setTargetContact}
        avatarToCrop={chat.avatarToCrop}
        setAvatarToCrop={chat.setAvatarToCrop}
        handleUpdateProfile={chat.handleUpdateProfile}
        handleChangePassword={chat.handleChangePassword}
        handleCropComplete={chat.handleCropComplete}
        handleForward={chat.handleForward}
        handleAddUserToGroup={chat.handleAddUserToGroup}
        setContacts={chat.setContacts}
        setActiveContact={chat.setActiveContact}
        setGroups={chat.setGroups}
        setActiveGroup={chat.setActiveGroup}
        setReplyingTo={chat.setReplyingTo}
        handleMoveContactToCircle={chat.handleMoveContactToCircle}
        handleAvatarClick={chat.handleAvatarClick}
      />

      <TriggeredRemindersOverlay
        reminders={chat.reminders}
        onSnooze={chat.handleSnoozeReminder}
        onDismiss={chat.handleDismissReminder}
      />
    </div>
  );
}
