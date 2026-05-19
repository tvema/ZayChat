'use client';

import Image from 'next/image';
import { Search, UserPlus, Users, Settings, LogOut, ShieldCheck, Sun, Moon, Layers, MoreVertical, UserMinus, Move, FolderPlus, Grid, List, Languages, Bell, Activity, ArrowLeft, MessageSquare, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { ContactMenu } from './ContactMenu';
import { User, Group, Reminder, Message } from '@/types/chat';
import { useRef, useEffect, useState, useMemo } from 'react';
import { formatLastSeen } from '@/lib/chatUtils';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/components/LanguageProvider';
import { useGlobalModal } from '@/components/GlobalModalProvider';

interface SidebarProps {
  user: User;
  token: string | null;
  contacts: User[];
  groups: Group[];
  contactCircles: any[];
  setContactCircles: (circles: any[]) => void;
  unlockedCircles: string[];
  setUnlockedCircles: React.Dispatch<React.SetStateAction<string[]>>;
  activeContact: User | null;
  activeGroup: Group | null;
  searchQuery: string;
  isSearching: boolean;
  searchResults: User[];
  messageSearchResults: { chatId: string, message: Message, isGroup: boolean }[];
  handleSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMessageResultClick: (chatId: string, message: Message, isGroup: boolean) => void;
  handleAddContact: (contactId: string) => void;
  handleContactClick: (contact: User) => void;
  handleGroupClick: (group: Group) => void;
  handleAvatarClick: () => void;
  handleAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowGroupModal: (show: boolean) => void;
  setShowProfileModal: (show: boolean) => void;
  setShowContactCirclesModal: (show: boolean) => void;
  setShowUserInfoModal: (show: boolean) => void;
  handleGenerateInvite: () => void;
  handleLogout: () => void;
  avatarInputRef: React.RefObject<HTMLInputElement | null>;
  appView?: 'messages' | 'feed';
  setAppView?: (view: 'messages' | 'feed') => void;
  hasUnreadFeed?: boolean;
  feedPosts?: any[];
  selectedFeedUserId?: string | null;
  setSelectedFeedUserId?: (id: string | null) => void;
  sidebarView: 'chats' | 'groups';
  setSidebarView: (view: 'chats' | 'groups') => void;
  handleRemoveContact: (contactId: string) => void;
  handleClearChat: (contactId: string, isGroup?: boolean) => void;
  handleMoveContactToCircle: (contactId: string, toCircleType: 'normal' | 'dnd' | 'blacklist') => void;
  setShowMoveToCircleModal: (show: boolean) => void;
  setMovingContact: (contact: User | null) => void;
  setShowAddToGroupModal: (show: boolean) => void;
  setTargetContact: (contact: User | null) => void;
  reminders: Reminder[];
}

export function Sidebar({
  user,
  token,
  contacts,
  groups,
  contactCircles,
  setContactCircles,
  unlockedCircles,
  setUnlockedCircles,
  activeContact,
  activeGroup,
  searchQuery,
  isSearching,
  searchResults,
  messageSearchResults,
  handleSearch,
  handleMessageResultClick,
  handleAddContact,
  handleContactClick,
  handleGroupClick,
  handleAvatarClick,
  handleAvatarChange,
  setShowGroupModal,
  setShowProfileModal,
  setShowContactCirclesModal,
  setShowUserInfoModal,
  handleGenerateInvite,
  handleLogout,
  avatarInputRef,
  appView,
  setAppView,
  hasUnreadFeed,
  feedPosts = [],
  selectedFeedUserId = null,
  setSelectedFeedUserId,
  sidebarView,
  setSidebarView,
  handleRemoveContact,
  handleClearChat,
  handleMoveContactToCircle,
  setShowMoveToCircleModal,
  setMovingContact,
  setShowAddToGroupModal,
  setTargetContact,
  reminders
}: SidebarProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { showAlert } = useGlobalModal();
  const [mounted, setMounted] = useState(false);
  const [unlockingCircleId, setUnlockingCircleId] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [contextMenuContact, setContextMenuContact] = useState<{ id: string, x: number, y: number } | null>(null);

  const [expandedCircles, setExpandedCircles] = useState({
    normal: true,
    dnd: false,
    blacklist: false
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const normalContacts = contacts.filter(c => !c.circle_type || c.circle_type === 'normal');
  const dndContacts = contacts.filter(c => c.circle_type === 'dnd');
  const blacklistContacts = contacts.filter(c => c.circle_type === 'blacklist');

  const feedUsers = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(feedPosts)) return [];

    // Always ensure current user is in the list
    map.set(user.id, {
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      avatar_url: user.avatar_url,
      has_unread: false,
      latest_post: new Date(0).toISOString() // Base case if no posts
    });

    feedPosts.forEach(post => {
      if (!map.has(post.user_id)) {
        map.set(post.user_id, {
          id: post.user_id,
          username: post.username,
          first_name: post.first_name,
          last_name: post.last_name,
          avatar_url: post.avatar_url,
          has_unread: false,
          latest_post: post.created_at
        });
      }
      const entry = map.get(post.user_id);
      if (!post.is_viewed && post.user_id !== user.id) {
        entry.has_unread = true;
      }
      if (new Date(post.created_at) > new Date(entry.latest_post)) {
        entry.latest_post = post.created_at;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      // Current user is always first
      if (a.id === user.id) return -1;
      if (b.id === user.id) return 1;
      // Then unread
      if (a.has_unread && !b.has_unread) return -1;
      if (!a.has_unread && b.has_unread) return 1;
      // Then by latest post
      return new Date(b.latest_post).getTime() - new Date(a.latest_post).getTime();
    });
  }, [feedPosts, user]);

  const visibleContacts = contacts; // For now. Wait, maybe blacklist contacts are filtered out if not in chat list? No, they are shown in blacklist accordion.

  const now = new Date();
  const hasTriggeredReminder = (chatId: string) => {
    return reminders.some(r => r.chat_id === chatId && !r.is_dismissed && now >= new Date(r.remind_at));
  };

  const sortedContacts = [...visibleContacts].sort((a, b) => {
    // 0. Triggered reminders first
    const aTriggered = hasTriggeredReminder(a.id);
    const bTriggered = hasTriggeredReminder(b.id);
    if (aTriggered && !bTriggered) return -1;
    if (!aTriggered && bTriggered) return 1;

    // 1. Online first
    if (a.is_online && !b.is_online) return -1;
    if (!a.is_online && b.is_online) return 1;

    // 2. Sort by last_message_timestamp (descending)
    const timeA = a.last_message_timestamp ? new Date(a.last_message_timestamp).getTime() : 0;
    const timeB = b.last_message_timestamp ? new Date(b.last_message_timestamp).getTime() : 0;
    
    if (timeA !== timeB) {
      return timeB - timeA;
    }

    // 3. Fallback to name
    return (a.first_name || '').localeCompare(b.first_name || '');
  });

  const sortedGroups = [...groups].sort((a, b) => {
    const aTriggered = hasTriggeredReminder(a.id);
    const bTriggered = hasTriggeredReminder(b.id);
    if (aTriggered && !bTriggered) return -1;
    if (!aTriggered && bTriggered) return 1;

    const timeA = (a as any).last_message_timestamp ? new Date((a as any).last_message_timestamp).getTime() : 0;
    const timeB = (b as any).last_message_timestamp ? new Date((b as any).last_message_timestamp).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return a.name.localeCompare(b.name);
  });

  const handleUnlockCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockingCircleId || !unlockPassword) return;

    try {
      const res = await fetch(`/api/contact-circles/${unlockingCircleId}/unlock`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: unlockPassword })
      });

      if (res.ok) {
        setUnlockedCircles(prev => [...prev, unlockingCircleId]);
        setUnlockingCircleId(null);
        setUnlockPassword('');
      } else {
        showAlert(t('modals.incorrectPassword'));
      }
    } catch (error) {
      console.error('Error unlocking circle:', error);
      showAlert(t('modals.failedUnlock'));
    }
  };

  return (
    <aside className={`w-full md:w-80 min-w-0 min-h-0 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col shrink-0 z-20 ${((appView === 'messages' && (activeContact || activeGroup)) || (appView === 'feed' && selectedFeedUserId)) ? 'hidden md:flex' : 'flex'}`}>
      {/* User Header */}
      <div className="border-b border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 sticky top-0 z-10">
        {/* Row 1: Avatar and Name */}
        <div className="p-4 flex items-center gap-3">
          <div className="relative group cursor-pointer" onClick={() => setShowProfileModal(true)}>
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold overflow-hidden border-2 border-white dark:border-neutral-800 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
              {user.avatar_url ? (
                <div className="relative w-full h-full">
                  <Image 
                    src={user.avatar_url} 
                    alt="Avatar" 
                    fill 
                    className="object-cover" 
                    referrerPolicy="no-referrer"
                    unoptimized
                  />
                </div>
              ) : (
                user.first_name?.[0] || '?'
              )}
            </div>
          </div>
          <div 
            className="flex flex-col min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setShowProfileModal(true)}
          >
            <span className="font-semibold text-neutral-800 dark:text-neutral-100 leading-tight truncate">{user.first_name} {user.last_name}</span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              {t.chat.online}
            </span>
          </div>
          <button 
            onClick={(e) => {
              e.preventDefault();
              handleLogout();
            }}
            className="p-2 text-neutral-500 dark:text-neutral-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-full transition-colors"
            title={t.common.logout}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative group flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-neutral-500 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text"
              placeholder={t.common.search}
              value={searchQuery}
              onChange={handleSearch}
              className="w-full pl-10 pr-4 py-2 bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl text-sm text-neutral-800 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
          </div>
          <button 
            onClick={(e) => {
              e.preventDefault();
              handleGenerateInvite();
            }}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-sm shadow-indigo-200 dark:shadow-none shrink-0"
            title={t.chat.inviteFriend}
          >
            <UserPlus className="w-5 h-5" />
          </button>
        </div>

        {/* View Toggle */}
        <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
          <button
            onClick={() => {
              setSidebarView('chats');
              if (setAppView) setAppView('messages');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-lg transition-all ${sidebarView === 'chats' && appView !== 'feed' ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {t.chat.chats || 'Чаты'}
          </button>
          <button
            onClick={() => {
              setSidebarView('groups');
              if (setAppView) setAppView('messages');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-lg transition-all ${sidebarView === 'groups' && appView !== 'feed' ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
          >
            <Users className="w-3.5 h-3.5" />
            {t.chat.groups || 'Группы'}
          </button>
          <button
            onClick={() => {
              if (setAppView) setAppView('feed');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-lg transition-all ${appView === 'feed' ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm relative' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 relative'}`}
          >
            <Activity className="w-3.5 h-3.5" />
            {t.feed?.title || 'Лента'}
            {hasUnreadFeed && appView !== 'feed' && (
              <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm"></span>
            )}
          </button>
        </div>
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800">
        {isSearching ? (
          <div className="px-2 py-2">
            <h3 className="px-3 py-2 text-[11px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              {t.common.search}
            </h3>
            
            {/* Users / Results */}
            {searchResults.length > 0 && (
              <div className="mb-4">
                <div className="px-3 py-1 text-[10px] text-neutral-400 uppercase font-medium">{t.chat.contacts}</div>
                {searchResults.map(result => (
                  <button
                    key={result.id}
                    onClick={() => handleAddContact(result.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-xl transition-all group"
                  >
                    <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 font-bold overflow-hidden shrink-0 border border-neutral-200 dark:border-neutral-700">
                      {result.avatar_url ? (
                        <div className="relative w-full h-full">
                          <Image src={result.avatar_url} alt="" fill className="object-cover" referrerPolicy="no-referrer" unoptimized />
                        </div>
                      ) : (
                        result.first_name?.[0] || '?'
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="font-medium text-neutral-800 dark:text-neutral-100 truncate">{result.first_name} {result.last_name}</div>
                      <div className="text-xs truncate">
                        {result.is_online ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t.chat.online}</span>
                        ) : (
                          <span className="text-neutral-500 dark:text-neutral-400">
                            {result.last_seen ? `${t.chat.lastSeen} ${formatLastSeen(result.last_seen, t)}` : t.common.notAvailable}
                          </span>
                        )}
                      </div>
                    </div>
                    {contacts.find(c => c.id === result.id) ? (
                      <div className="text-[10px] text-indigo-500 font-bold uppercase">{t.chat.added || 'Added'}</div>
                    ) : (
                      <UserPlus className="w-5 h-5 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Messages Results */}
            {messageSearchResults.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] text-neutral-400 uppercase font-medium">{t.chat.messages || 'Messages'}</div>
                {messageSearchResults.map(({ chatId, message, isGroup }) => {
                  const contact = contacts.find(c => c.id === chatId);
                  const group = groups.find(g => g.id === chatId);
                  const name = isGroup ? (group?.name || 'Group') : (contact ? `${contact.first_name} ${contact.last_name}` : 'User');
                  
                  return (
                    <button
                      key={message.id}
                      onClick={() => handleMessageResultClick(chatId, message, isGroup)}
                      className="w-full flex items-start gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-xl transition-all group"
                    >
                      <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/10 flex items-center justify-center text-indigo-500 font-bold shrink-0 border border-indigo-100 dark:border-indigo-900/20">
                         {isGroup ? <Users size={16} /> : <Search size={16} />}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="font-medium text-neutral-800 dark:text-neutral-100 text-xs flex items-center justify-between">
                          <span className="truncate max-w-[140px]">{name}</span>
                          <span className="text-[9px] text-neutral-400 shrink-0">
                            {new Date(message.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-0.5 italic">
                          {(() => {
                            const content = message.content;
                            if (content && content.startsWith('{') && content.endsWith('}')) {
                              try {
                                const parsed = JSON.parse(content);
                                return parsed.text || parsed.content || content;
                              } catch (e) {
                                return content;
                              }
                            }
                            return content;
                          })()}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {searchResults.length === 0 && messageSearchResults.length === 0 && (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Search className="w-6 h-6 text-neutral-300 dark:text-neutral-600" />
                </div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{t.common.error}</p>
              </div>
            )}
          </div>
        ) : appView === 'feed' ? (
          <div className="px-2 py-2 space-y-1">
            <div className="mb-4">
              <div className="px-3 py-2 flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Моя лента</h3>
              </div>
              {feedUsers.find(u => u.id === user.id) && (
                <button
                  onClick={() => {
                    if (setSelectedFeedUserId) setSelectedFeedUserId(user.id);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all relative ${selectedFeedUserId === user.id ? 'bg-indigo-50 dark:bg-indigo-900/20 shadow-sm' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'}`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border-2 border-neutral-300 dark:border-neutral-600`}>
                      {user.avatar_url ? (
                        <div className="relative w-full h-full">
                          <Image src={user.avatar_url} alt="" fill className="object-cover" referrerPolicy="no-referrer" unoptimized />
                        </div>
                      ) : (
                        <div className="w-full h-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 font-bold">
                          {user.first_name?.[0] || '?'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className={`font-medium truncate ${selectedFeedUserId === user.id ? 'text-indigo-900 dark:text-indigo-100' : 'text-neutral-800 dark:text-neutral-100'}`}>
                      {user.first_name} {user.last_name || ''}
                    </div>
                  </div>
                </button>
              )}
            </div>
            
            <div className="mb-4">
              <div className="px-3 py-2 flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Истории</h3>
              </div>
              {feedUsers.filter(u => u.id !== user.id).length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                  Нет новых историй
                </div>
              ) : (
                feedUsers.filter(u => u.id !== user.id).map(feedUser => (
                  <button
                    key={feedUser.id}
                    onClick={() => {
                      if (setSelectedFeedUserId) setSelectedFeedUserId(feedUser.id);
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all relative ${selectedFeedUserId === feedUser.id ? 'bg-indigo-50 dark:bg-indigo-900/20 shadow-sm' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'} ${!feedUser.has_unread ? 'opacity-60' : ''}`}
                  >
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border-2 ${feedUser.has_unread ? 'border-indigo-500' : 'border-neutral-300 dark:border-neutral-600'}`}>
                        {feedUser.avatar_url ? (
                          <div className="relative w-full h-full">
                            <Image src={feedUser.avatar_url} alt="" fill className="object-cover" referrerPolicy="no-referrer" unoptimized />
                          </div>
                        ) : (
                          <div className="w-full h-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 font-bold">
                            {feedUser.first_name?.[0] || '?'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className={`font-medium truncate ${selectedFeedUserId === feedUser.id ? 'text-indigo-900 dark:text-indigo-100' : 'text-neutral-800 dark:text-neutral-100'}`}>
                        {feedUser.first_name} {feedUser.last_name || ''}
                      </div>
                      <div className="text-xs text-neutral-500 truncate">
                        {feedUser.has_unread ? 'Новые истории' : 'Просмотрено'}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="px-2 py-2 space-y-1">
            {/* Groups Section */}
            {sidebarView === 'groups' && (
              <div className="mb-4">
                <div className="px-3 py-2 flex items-center justify-between">
                  <h3 className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{t.chat.groups}</h3>
                  <button 
                    onClick={() => setShowGroupModal(true)}
                    className="p-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors"
                    title={t.chat.createGroup}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {sortedGroups.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    Нет групп
                  </div>
                )}
                {sortedGroups.map(group => (
                  <button
                  key={group.id}
                  onClick={() => handleGroupClick(group)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeGroup?.id === group.id ? 'bg-indigo-50 dark:bg-indigo-900/20 shadow-sm' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'}`}
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold shrink-0 border border-indigo-200 dark:border-indigo-800 overflow-hidden relative">
                    {group.avatar_url ? (
                      <Image 
                        src={group.avatar_url} 
                        alt="" 
                        fill 
                        className="object-cover" 
                        referrerPolicy="no-referrer"
                        unoptimized
                        onError={(e) => {
                          const img = e.currentTarget;
                          img.style.display = 'none';
                          const parent = img.parentElement;
                          if (parent && group) {
                            const existingFallback = parent.querySelector('.fallback-avatar');
                            if (!existingFallback) {
                              const span = document.createElement('span');
                              span.className = 'fallback-avatar';
                              span.innerText = (group.name && group.name[0]) || '?';
                              parent.appendChild(span);
                            }
                          }
                        }}
                      />
                    ) : (
                      group.name[0]
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className={`font-medium truncate ${activeGroup?.id === group.id ? 'text-indigo-900 dark:text-indigo-100' : 'text-neutral-800 dark:text-neutral-100'}`}>{group.name}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{group.member_count} {t.chat.members}</div>
                  </div>
                  {group.unread_count !== undefined && group.unread_count > 0 && (
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-in zoom-in duration-300">
                      {group.unread_count}
                    </div>
                  )}
                  {hasTriggeredReminder(group.id) && (
                    <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse">
                      <Bell size={12} />
                    </div>
                  )}
                </button>
              ))}
            </div>
            )}

            {/* Contacts Section */}
            {sidebarView === 'chats' && (
              <div>
                <div className="px-3 py-2 flex items-center justify-between">
                  <h3 className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                    {t.chat.contacts || 'Контакты'}
                  </h3>
                </div>

                <div className="space-y-4">
                  {[
                    { key: 'normal', name: 'Обычные контакты', items: normalContacts },
                    { key: 'dnd', name: 'Не беспокоить', items: dndContacts },
                    { key: 'blacklist', name: 'Чёрный список', items: blacklistContacts }
                  ].map(circle => circle.items.length > 0 && (
                    <div key={circle.key} className="space-y-1">
                      <button 
                        onClick={() => setExpandedCircles(prev => ({ ...prev, [circle.key]: !prev[circle.key as keyof typeof prev] }))}
                        className="w-full px-3 py-1 flex items-center justify-between group hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors rounded-lg"
                      >
                        <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                          {expandedCircles[circle.key as keyof typeof expandedCircles] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          {circle.name}
                        </span>
                        <span className="text-[10px] text-neutral-400">{circle.items.length}</span>
                      </button>
                      
                      {expandedCircles[circle.key as keyof typeof expandedCircles] && circle.items.sort((a, b) => {
                        const aTriggered = hasTriggeredReminder(a.id);
                        const bTriggered = hasTriggeredReminder(b.id);
                        if (aTriggered && !bTriggered) return -1;
                        if (!aTriggered && bTriggered) return 1;
                        if (a.is_online && !b.is_online) return -1;
                        if (!a.is_online && b.is_online) return 1;
                        const timeA = a.last_message_timestamp ? new Date(a.last_message_timestamp).getTime() : 0;
                        const timeB = b.last_message_timestamp ? new Date(b.last_message_timestamp).getTime() : 0;
                        if (timeA !== timeB) return timeB - timeA;
                        return (a.first_name || '').localeCompare(b.first_name || '');
                      }).map(contact => (
                        <div key={contact.id} className="relative group">
                          <button
                            onClick={() => handleContactClick(contact)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all relative ${activeContact?.id === contact.id ? 'bg-indigo-50 dark:bg-indigo-900/20 shadow-sm' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'}`}
                          >
                            <div className="relative shrink-0">
                              <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 font-bold overflow-hidden border border-neutral-200 dark:border-neutral-700">
                                {contact.avatar_url ? (
                                  <div className="relative w-full h-full">
                                    <Image src={contact.avatar_url} alt="" fill className="object-cover" referrerPolicy="no-referrer" unoptimized />
                                  </div>
                                ) : (
                                  contact.first_name?.[0] || '?'
                                )}
                              </div>
                              {contact.is_online ? (
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-neutral-900 rounded-full shadow-sm"></div>
                              ) : (
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-neutral-300 dark:bg-neutral-600 border-2 border-white dark:border-neutral-900 rounded-full shadow-sm"></div>
                              )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <div className={`font-medium truncate ${activeContact?.id === contact.id ? 'text-indigo-900 dark:text-indigo-100' : 'text-neutral-800 dark:text-neutral-100'}`}>{contact.first_name} {contact.last_name}</div>
                              <div className="text-xs truncate">
                                {contact.is_online ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t.chat.online}</span>
                                ) : (
                                  <span className="text-neutral-500 dark:text-neutral-400">
                                    {contact.last_seen ? formatLastSeen(contact.last_seen, t) : t('common.notAvailable')}
                                  </span>
                                )}
                              </div>
                            </div>
                            {(contact.unread_count ?? 0) > 0 && (
                              <div className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-in zoom-in duration-300">
                                {contact.unread_count}
                              </div>
                            )}
                            {hasTriggeredReminder(contact.id) && (
                              <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse">
                                <Bell size={12} />
                              </div>
                            )}
                          </button>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ContactMenu 
                              onInfo={() => {
                                handleContactClick(contact);
                                setShowUserInfoModal(true);
                              }}
                              onMove={() => {
                                setMovingContact(contact);
                                setShowMoveToCircleModal(true);
                              }}
                              onAddGroup={() => {
                                setTargetContact(contact);
                                setShowAddToGroupModal(true);
                              }}
                              onClearChat={() => handleClearChat(contact.id)}
                              onDelete={() => handleRemoveContact(contact.id)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
