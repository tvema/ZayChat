'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { Image as ImageIcon, MessageCircle, Heart, Send, X, Video, ArrowLeft, Camera, MoreHorizontal, Download, Share2, Forward, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useLanguage } from '@/components/LanguageProvider';
import { generateImageMetadata, generateVideoMetadata } from '@/lib/chatUtils';
import { CameraModal } from '../CameraModal';
import { ImageViewer } from '../ImageViewer';
import { Portal } from '../Portal';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { useTheme } from 'next-themes';
import { StoryViewer } from './StoryViewer';

interface FeedPost {
  id: string;
  user_id: string;
  content: string;
  media_url: string;
  media_type: string;
  media_width?: number;
  media_height?: number;
  created_at: string;
  username: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
  likes_count: number;
  comments_count: number;
  is_liked: number;
}

interface FeedComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  username: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
}

export function FeedView({ 
  user,
  token,
  socket,
  setHasUnreadFeed,
  onBack,
  setShowForwardModal,
  setForwardingMessage,
  posts,
  setPosts,
  selectedFeedUserId,
  setSelectedFeedUserId
}: { 
  user: any,
  token: string,
  socket?: any,
  setHasUnreadFeed?: (v: boolean) => void,
  onBack?: () => void,
  setShowForwardModal: (v: boolean) => void,
  setForwardingMessage: (msg: any) => void,
  posts: any[],
  setPosts: React.Dispatch<React.SetStateAction<any[]>>,
  selectedFeedUserId: string | null,
  setSelectedFeedUserId: (id: string | null) => void
}) {
  const { t } = useLanguage();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const [newPostContent, setNewPostContent] = useState('');
  const [newPostMedia, setNewPostMedia] = useState<File | null>(null);
  const [newPostDuration, setNewPostDuration] = useState(24);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string>('');
  const [viewerAlt, setViewerAlt] = useState<string>('');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, FeedComment[]>>({});
  const [newCommentContent, setNewCommentContent] = useState('');

  useEffect(() => {
    if (!selectedFeedUserId && user?.id) {
      if (window.innerWidth >= 768) {
        setSelectedFeedUserId(user.id);
      }
    }
  }, [selectedFeedUserId, user?.id, setSelectedFeedUserId]);

  useEffect(() => {
    if (setHasUnreadFeed) setHasUnreadFeed(false);
  }, [setHasUnreadFeed]);

  useEffect(() => {
    if (!socket) return;
    
    // Like Update
    const handleLikeUpdate = (data: { postId: string, userId: string, isLiked: boolean }) => {
      setPosts(prev => prev.map(p => {
        if (p.id === data.postId) {
          // If the update was for our own user, we already handled it optimistically
          if (data.userId === user?.id) return p;
          return {
            ...p,
            likes_count: p.likes_count + (data.isLiked ? 1 : -1)
          };
        }
        return p;
      }));
    };
    
    // New Comment
    const handleNewComment = (data: { postId: string, comment: FeedComment }) => {
      setCommentsMap(prev => {
        const postComments = prev[data.postId] || [];
        if (postComments.find(c => c.id === data.comment.id)) return prev;
        return {
          ...prev,
          [data.postId]: [...postComments, data.comment]
        };
      });
      setPosts(prev => prev.map(p => {
        if (p.id === data.postId) {
          return {
            ...p,
            comments_count: p.comments_count + 1
          };
        }
        return p;
      }));
    };
    
    // Post deleted
    const handlePostDeleted = (data: { postId: string }) => {
      setPosts(prev => prev.filter(p => p.id !== data.postId));
    };
    
    socket.on('feed:like_update', handleLikeUpdate);
    socket.on('feed:new_comment', handleNewComment);
    socket.on('feed:post_deleted', handlePostDeleted);
    
    return () => {
      socket.off('feed:like_update', handleLikeUpdate);
      socket.off('feed:new_comment', handleNewComment);
      socket.off('feed:post_deleted', handlePostDeleted);
    };
  }, [socket, user?.id]);

  const handleLike = async (postId: string) => {
    try {
      // Optimistic update
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          const liked = !p.is_liked;
          return {
            ...p,
            is_liked: liked ? 1 : 0,
            likes_count: p.likes_count + (liked ? 1 : -1)
          };
        }
        return p;
      }));

      await fetch(`/api/feed/${postId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {}
  };

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() && !newPostMedia) return;

    setIsSubmitting(true);
    try {
      let mediaUrl = null;
      let mediaType = null;
      let mediaWidth = null;
      let mediaHeight = null;

      if (newPostMedia) {
        let meta: any = {};
        if (newPostMedia.type.startsWith('image/')) {
           meta = await generateImageMetadata(newPostMedia);
        } else if (newPostMedia.type.startsWith('video/')) {
           meta = await generateVideoMetadata(newPostMedia);
        }
        mediaWidth = meta.width || null;
        mediaHeight = meta.height || null;

        const formData = new FormData();
        formData.append('file', newPostMedia);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          mediaUrl = uploadData.fileId || uploadData.url;
          mediaType = newPostMedia.type.startsWith('video/') ? 'video' : 'image';
        }
      }

      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          content: newPostContent,
          media_url: mediaUrl,
          media_type: mediaType,
          media_width: mediaWidth,
          media_height: mediaHeight,
          duration_hours: newPostDuration
        })
      });

      if (res.ok) {
        const newPost = await res.json();
        setPosts(prev => {
          if (prev.find(p => p.id === newPost.id)) return prev;
          return [newPost, ...prev];
        });
        setNewPostContent('');
        setNewPostMedia(null);
        setPreviewUrl(null);
        setNewPostDuration(24);
      }
    } catch (e) {}
    setIsSubmitting(false);
  };

  const uploadAndPostToFeed = async (file: File) => {
    setIsSubmitting(true);
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
            content: '', // Empty content for direct camera posts
            media_url: mediaUrl,
            media_type: mediaType
          })
        });

        if (res.ok) {
          const newPost = await res.json();
          setPosts(prev => {
            if (prev.find(p => p.id === newPost.id)) return prev;
            return [newPost, ...prev];
          });
        }
      }
    } catch (e) {
      console.error('Failed to post to feed from camera:', e);
    }
    setIsSubmitting(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setNewPostMedia(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const loadComments = async (postId: string) => {
    if (activeCommentsPostId === postId) {
      setActiveCommentsPostId(null);
      return;
    }
    setActiveCommentsPostId(postId);
    try {
      const res = await fetch(`/api/feed/${postId}/comments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCommentsMap(prev => ({ ...prev, [postId]: data }));
      }
    } catch (e) {}
  };

  const handleCommentSubmit = async (e: React.FormEvent, postId: string, content?: string) => {
    e.preventDefault();
    const finalContent = content || newCommentContent;
    if (!finalContent.trim()) return;

    try {
      const res = await fetch(`/api/feed/${postId}/comments`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ content: finalContent })
      });

      if (res.ok) {
        const newComment = await res.json();
        setCommentsMap(prev => {
          const postComments = prev[postId] || [];
          if (postComments.find(c => c.id === newComment.id)) return prev;
          return {
            ...prev,
            [postId]: [...postComments, newComment]
          };
        });
        if (!content) {
          setNewCommentContent('');
        }
      }
    } catch (e) {}
  };

  const openMenu = (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 200;
    let left = rect.right - menuWidth;
    if (left < 10) left = 10;

    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left: left,
      zIndex: 100
    });
    setActiveMenuId(activeMenuId === postId ? null : postId);
  };

  const handleForwardPost = (post: FeedPost) => {
    // Construct a pseudo-message for the forward modal
    const messageContent = post.media_url ? JSON.stringify({
      type: 'file',
      url: post.media_url,
      mime: post.media_type === 'video' ? 'video/mp4' : 'image/jpeg',
      name: post.media_type === 'video' ? 'video.mp4' : 'image.jpg',
      text: post.content
    }) : post.content;

    setForwardingMessage({
      id: `feed-${post.id}`,
      sender_id: post.user_id,
      content: messageContent,
      sender_username: post.username,
      created_at: post.created_at,
      status: 'sent',
      reactions: []
    });
    setShowForwardModal(true);
    setActiveMenuId(null);
  };

  const handleDownload = async (url: string, filename: string, mediaType?: string) => {
    try {
      let finalFilename = filename;
      if (mediaType === 'video' && !filename.includes('.')) {
        finalFilename += '.mp4';
      } else if (mediaType === 'image' && !filename.includes('.')) {
        finalFilename += '.jpg';
      }
      
      const isBlobUrl = url.startsWith('blob:');
      const downloadUrl = isBlobUrl 
        ? url 
        : `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(finalFilename)}`;

      if (isBlobUrl) {
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = downloadUrl;
          a.download = finalFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      } else {
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = downloadUrl;
          a.download = finalFilename;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      }

    } catch (err: any) {
      console.error('Download completely failed:', err);
    }
    setActiveMenuId(null);
  };

  const handleDeletePost = async (postId: string) => {
    try {
      const res = await fetch(`/api/feed/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== postId));
      }
    } catch (e) {
      console.error('Failed to delete post:', e);
    }
    setActiveMenuId(null);
  };

  const handleNextUser = () => {
    if (!selectedFeedUserId || selectedFeedUserId === user?.id) return;
    
    // Reconstruct list of other users
    const map = new Map();
    posts.forEach(post => {
      if (post.user_id === user?.id) return; // Skip selves
      if (!map.has(post.user_id)) {
        map.set(post.user_id, {
          id: post.user_id,
          has_unread: false,
          latest_post: post.created_at
        });
      }
      const entry = map.get(post.user_id);
      if (!post.is_viewed) entry.has_unread = true;
      if (new Date(post.created_at) > new Date(entry.latest_post)) {
        entry.latest_post = post.created_at;
      }
    });
    
    const otherUsers = Array.from(map.values()).sort((a, b) => {
      if (a.has_unread && !b.has_unread) return -1;
      if (!a.has_unread && b.has_unread) return 1;
      return new Date(b.latest_post).getTime() - new Date(a.latest_post).getTime();
    }).map(u => u.id);

    const currentIndex = otherUsers.indexOf(selectedFeedUserId);
    if (currentIndex >= 0 && currentIndex < otherUsers.length - 1) {
      // Go to next user
      setSelectedFeedUserId(otherUsers[currentIndex + 1]);
    } else {
      // Reached the end, close viewer
      setSelectedFeedUserId(user?.id || null);
    }
  };

  return (
    <div 
      className={`flex-1 h-full bg-indigo-50/50 dark:bg-indigo-950/20 overflow-y-auto relative ${!selectedFeedUserId ? 'hidden md:block' : 'block'}`}
      style={{ backgroundImage: `url("${mounted && resolvedTheme === 'dark' ? '/bunny_wallpaper_dark.jpg' : '/bunny_wallpaper_light.jpg'}")`, backgroundSize: '400px', backgroundRepeat: 'repeat' }}
    >
      <AnimatePresence>
        {selectedFeedUserId && selectedFeedUserId !== user?.id && (
          <StoryViewer
            key={selectedFeedUserId}
            posts={posts.filter(p => p.user_id === selectedFeedUserId)}
            user={user}
            token={token}
            onClose={() => setSelectedFeedUserId(null)}
            onNextUser={handleNextUser}
            handleLike={handleLike}
            openComments={loadComments}
            commentsMap={commentsMap}
            loadComments={loadComments}
            handleCommentSubmit={handleCommentSubmit}
            markAsViewed={(postId) => {
              setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_viewed: true } : p));
            }}
          />
        )}
      </AnimatePresence>

      {/* Mobile Header with Back Button */}
      {onBack && (
        <div className="md:hidden sticky top-0 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 z-10 p-3 flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-neutral-800 dark:text-neutral-100">{t('feed.title')}</span>
        </div>
      )}
      
      <div className="max-w-2xl mx-auto p-4 md:py-8 space-y-6">
        
        {/* Create Post Area */}
        {selectedFeedUserId === user?.id && (
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-4">
            <form onSubmit={handlePostSubmit}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 overflow-hidden relative border border-neutral-200 dark:border-neutral-700">
                  {user?.avatar_url ? (
                    <Image src={user.avatar_url} alt="Avatar" fill className="object-cover" unoptimized />
                  ) : (
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">{user?.first_name?.[0] || '?'}</span>
                  )}
                </div>
              <div className="flex-1">
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder={t('feed.whatsNew')}
                  className="w-full bg-transparent resize-none outline-none text-neutral-800 dark:text-neutral-100 min-h-[60px]"
                />
                
                {previewUrl && (
                  <div className="relative mt-2 rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 max-h-80 flex items-center justify-center">
                    <button 
                      type="button"
                      onClick={() => {
                        setNewPostMedia(null);
                        setPreviewUrl(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 z-10 transition-colors"
                    >
                      <X size={16} />
                    </button>
                    {newPostMedia?.type.startsWith('video/') ? (
                      <video src={previewUrl} controls className="max-h-80 w-auto" />
                    ) : (
                      <img src={previewUrl} alt="Preview" className="max-h-80 w-auto object-contain" />
                    )}
                  </div>
                )}
                
                <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-700/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm font-medium transition-colors"
                    >
                      <ImageIcon size={18} className="text-emerald-500" />
                      {t('feed.photoVideo')}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm font-medium transition-colors"
                    >
                      <Camera size={18} className="text-indigo-500" />
                      {t('modals.camera')}
                    </button>
                    <select
                      value={newPostDuration}
                      onChange={(e) => setNewPostDuration(Number(e.target.value))}
                      className="bg-transparent border border-neutral-200 dark:border-neutral-700 rounded-full px-2 py-1 text-xs text-neutral-600 dark:text-neutral-400 outline-none"
                    >
                      <option value={12}>12 ч</option>
                      <option value={24}>24 ч</option>
                      <option value={48}>48 ч</option>
                    </select>
                    <input  
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*,video/*" 
                      onChange={handleFileSelect}
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isSubmitting || (!newPostContent.trim() && !newPostMedia)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-1.5 rounded-full font-medium text-sm disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    {t('feed.publish')}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
        )}

        {/* Posts Feed */}
        {selectedFeedUserId !== user?.id ? (
          <div className="text-center py-10 text-neutral-500">
            <div className="bg-neutral-100 dark:bg-neutral-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
              <Video size={24} className="text-neutral-400" />
            </div>
            <p>Выберите пользователя из списка слева,</p>
            <p className="text-sm mt-1">чтобы посмотреть его истории</p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.filter(p => p.user_id === user?.id).map(post => (
              <div key={post.id} className="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 overflow-hidden relative">
                      {post.avatar_url ? (
                        <Image src={post.avatar_url} alt="Avatar" fill className="object-cover" unoptimized />
                      ) : (
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">{post.first_name?.[0] || '?'}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-neutral-800 dark:text-neutral-100 text-sm leading-tight">
                        {post.first_name} {post.last_name}
                      </h3>
                      <span className="text-xs text-neutral-500">{new Date(post.created_at).toLocaleString([], {hour: '2-digit', minute:'2-digit', year: 'numeric', month: 'numeric', day: 'numeric'})}</span>
                    </div>
                    
                    <button 
                      onClick={(e) => openMenu(e, post.id)}
                      className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {post.content && (
                    <p className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap mb-3 text-[15px] break-words [word-break:break-word]">
                      {post.content}
                    </p>
                  )}
                </div>
                
                {post.media_url && (
                  <div 
                    className="relative w-full bg-neutral-100 dark:bg-neutral-900 max-h-[500px] flex items-center justify-center overflow-hidden"
                    style={post.media_width && post.media_height ? { 
                      aspectRatio: `${post.media_width}/${post.media_height}`
                    } : undefined}
                  >
                    {post.media_type === 'video' ? (
                      <video 
                        src={post.media_url} 
                        controls 
                        playsInline
                        preload="metadata"
                        className="h-full max-h-[500px] w-full bg-black/5 object-contain"
                      />
                    ) : (
                      <img 
                        src={post.media_url} 
                        alt="Post media" 
                        className="h-full max-h-[500px] w-full object-contain cursor-pointer"
                        onClick={() => {
                          setViewerUrl(post.media_url);
                          setViewerAlt(post.content || 'Post media');
                          setIsViewerOpen(true);
                        }}
                      />
                    )}
                  </div>
                )}
                
                <div className="p-2 border-t border-neutral-100 dark:border-neutral-700/50 flex flex-col">
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleLike(post.id)}
                      className="flex flex-1 items-center justify-center gap-2 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Heart size={20} className={post.is_liked ? "fill-red-500 text-red-500" : "text-neutral-500"} />
                      <span className={post.is_liked ? "text-red-500" : "text-neutral-500"}>{post.likes_count || t('feed.like')}</span>
                    </button>
                    <button 
                      onClick={() => loadComments(post.id)}
                      className="flex flex-1 items-center justify-center gap-2 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 rounded-lg text-sm font-medium text-neutral-500 transition-colors"
                    >
                      <MessageCircle size={20} />
                      <span>{post.comments_count || t('feed.comments')}</span>
                    </button>
                  </div>
                  
                  {/* Comments Section */}
                  {activeCommentsPostId === post.id && (
                    <div className="mt-3 px-2 pb-2">
                      <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                        {(commentsMap[post.id] || []).map(comment => (
                          <div key={comment.id} className="flex gap-2 text-sm">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 overflow-hidden relative">
                              {comment.avatar_url ? (
                                <Image src={comment.avatar_url} alt="Avatar" fill className="object-cover" unoptimized />
                              ) : (
                                <span className="text-indigo-600 dark:text-indigo-400 font-bold text-xs">{comment.first_name?.[0] || '?'}</span>
                              )}
                            </div>
                            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-tl-none px-3 py-2">
                              <h4 className="font-semibold text-neutral-800 dark:text-neutral-200 text-xs">{comment.first_name} {comment.last_name}</h4>
                              <p className="text-neutral-700 dark:text-neutral-300">{comment.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <form onSubmit={(e) => handleCommentSubmit(e, post.id)} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newCommentContent}
                          onChange={(e) => setNewCommentContent(e.target.value)}
                          placeholder={t('feed.writeComment')}
                          className="flex-1 bg-neutral-100 dark:bg-neutral-800 border-none rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/30 outline-none"
                        />
                        <button 
                          type="submit"
                          disabled={!newCommentContent.trim()}
                          className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-full disabled:opacity-50 transition-colors"
                        >
                          <Send size={18} />
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {posts.filter(p => p.user_id === user?.id).length === 0 && (
              <div className="text-center py-10 text-neutral-500">
                <div className="bg-neutral-100 dark:bg-neutral-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Camera size={24} className="text-neutral-400" />
                </div>
                <p>{t('feed.noPostsTitle') || 'Здесь пока пусто'}</p>
                <p className="text-sm mt-1">Опубликуйте первую историю</p>
              </div>
            )}
          </div>
        )}
      </div>
      <CameraModal 
        isOpen={isCameraOpen} 
        onClose={() => setIsCameraOpen(false)} 
        onCapture={(file) => {
          setNewPostMedia(file);
          setPreviewUrl(URL.createObjectURL(file));
        }}
        onPostToFeed={uploadAndPostToFeed}
      />

      <Portal>
        <AnimatePresence>
          {isViewerOpen && (
            <ImageViewer src={viewerUrl} alt={viewerAlt} onClose={() => setIsViewerOpen(false)} />
          )}
        </AnimatePresence>
      </Portal>

      {activeMenuId && typeof document !== 'undefined' && createPortal(
        <Fragment>
          <div className="fixed inset-0 z-[90]" onClick={() => setActiveMenuId(null)} />
          <div 
            style={menuStyle}
            className="w-48 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-100 dark:border-neutral-700 py-1 overflow-hidden"
          >
            {posts.find(p => p.id === activeMenuId)?.media_url && (
              <button 
                onClick={() => {
                  const post = posts.find(p => p.id === activeMenuId);
                  if (post) handleDownload(post.media_url, `post_${post.id}`, post.media_type);
                }}
                className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> {t('modals.saveToDevice')}
              </button>
            )}
            <button 
              onClick={() => {
                const post = posts.find(p => p.id === activeMenuId);
                if (post) handleForwardPost(post);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors"
            >
              <Forward className="w-4 h-4" />
              <span>{t('modals.forward')}</span>
            </button>

            <button 
              onClick={() => {
                const post = posts.find(p => p.id === activeMenuId);
                if (post) {
                  const shareUrl = `${window.location.origin}/post/${post.id}`;
                  if (navigator.share) {
                    navigator.share({ title: 'Check out this post', url: shareUrl }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(shareUrl);
                    alert(t('modals.linkCopied'));
                  }
                }
                setActiveMenuId(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <Share2 className="w-4 h-4" /> {t('modals.shareTitle') || 'Share'}
            </button>
            {posts.find(p => p.id === activeMenuId)?.user_id === user?.id && (
              <button 
                onClick={() => {
                  if (activeMenuId && confirm('Удалить этот пост?')) {
                    handleDeletePost(activeMenuId);
                  }
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Удалить
              </button>
            )}
          </div>
        </Fragment>,
        document.body
      )}
    </div>
  );
}
