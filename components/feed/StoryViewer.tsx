import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, ChevronLeft, ChevronRight, Heart, MessageCircle } from 'lucide-react';
import Image from 'next/image';
import { useLanguage } from '@/components/LanguageProvider';

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
  is_viewed?: boolean;
}

interface FeedComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
}

export function StoryViewer({
  posts,
  user,
  token,
  onClose,
  handleLike,
  openComments,
  commentsMap,
  loadComments,
  handleCommentSubmit,
  markAsViewed,
  onNextUser
}: {
  posts: FeedPost[];
  user: any;
  token: string;
  onClose: () => void;
  handleLike: (postId: string) => void;
  openComments: (postId: string) => void;
  commentsMap: Record<string, FeedComment[]>;
  loadComments: (postId: string) => void;
  handleCommentSubmit: (e: React.FormEvent, postId: string, content?: string) => void;
  markAsViewed?: (postId: string) => void;
  onNextUser?: () => void;
}) {
  const { t } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState('');
  const STORY_DURATION = 5000; // 5 seconds per slide (for images/text)

  // Use natural sort order: older posts first for stories
  const sortedPosts = [...posts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const currentPost = sortedPosts[currentIndex];

  const handleNext = useCallback(() => {
    if (currentIndex < sortedPosts.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setProgress(0);
    } else {
      if (onNextUser) {
        onNextUser();
      } else {
        onClose();
      }
    }
  }, [currentIndex, sortedPosts.length, onClose, onNextUser]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  // Mark view
  useEffect(() => {
    if (currentPost && !currentPost.is_viewed && currentPost.user_id !== user.id) {
      if (markAsViewed) markAsViewed(currentPost.id);
      fetch(`/api/feed/${currentPost.id}/view`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
  }, [currentPost, token, user.id, markAsViewed]);

  // Auto advance timer
  useEffect(() => {
    if (isPaused || !currentPost) return;

    if (currentPost.media_type === 'video') {
      // If it's a video, progress is handled by the video playing
      return;
    }

    const intervalTime = 16.66; // ~60fps
    const step = (100 / STORY_DURATION) * intervalTime;

    const interval = setInterval(() => {
      setProgress(prev => prev >= 100 ? 100 : prev + step);
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isPaused, currentPost]);

  useEffect(() => {
    if (progress >= 100 && currentPost?.media_type !== 'video') {
      handleNext();
    }
  }, [progress, handleNext, currentPost]);

  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    const currentProgress = (video.currentTime / video.duration) * 100;
    setProgress(currentProgress);
  };

  const handleTouchStart = () => setIsPaused(true);
  const handleTouchEnd = () => setIsPaused(false);
  
  if (!currentPost) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black flex flex-col md:p-4">
      {/* Background layer */}
      <div 
        className="absolute inset-0 opacity-30 transform scale-110 filter blur-3xl pointer-events-none"
        style={{
          backgroundImage: currentPost.media_url && currentPost.media_type === 'image' ? `url(${currentPost.media_url})` : 'none',
          backgroundPosition: 'center',
          backgroundSize: 'cover'
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md mx-auto h-full flex flex-col bg-neutral-900 md:rounded-3xl overflow-hidden shadow-2xl">
        {/* Progress Bars */}
        <div className="absolute top-0 inset-x-0 z-20 flex gap-1 p-2 bg-gradient-to-b from-black/60 to-transparent">
          {sortedPosts.map((p, idx) => (
            <div key={p.id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white transition-all ease-linear"
                style={{
                  width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%'
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700 overflow-hidden relative">
              {currentPost.avatar_url ? (
                <Image src={currentPost.avatar_url} alt="Avatar" fill className="object-cover" unoptimized />
              ) : (
                <span className="flex w-full h-full items-center justify-center text-white text-xs font-bold">
                  {currentPost.first_name?.[0] || '?'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 drop-shadow-md">
              <span className="font-semibold text-white text-sm">
                {currentPost.first_name} {currentPost.last_name}
              </span>
              <span className="text-white/70 text-xs">
                {new Date(currentPost.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}
              className="p-2 text-white/80 hover:text-white transition-colors drop-shadow-md"
            >
              {isPaused ? <Play size={22} /> : <Pause size={22} />}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-2 text-white/80 hover:text-white transition-colors drop-shadow-md"
            >
              <X size={26} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div 
          className="flex-1 relative flex items-center justify-center"
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Navigation Overlay (Left / Right halves) */}
          <div className="absolute inset-0 z-10 flex">
            <div className="w-1/3 h-full cursor-pointer" onClick={(e) => { e.stopPropagation(); handlePrev(); }} />
            <div className="w-2/3 h-full cursor-pointer" onClick={(e) => { e.stopPropagation(); handleNext(); }} />
          </div>

          {currentPost.media_url ? (
            currentPost.media_type === 'video' ? (
              <video 
                src={currentPost.media_url} 
                autoPlay 
                playsInline
                muted={false}
                className="w-full h-full object-contain bg-black"
                onTimeUpdate={handleVideoTimeUpdate}
                onEnded={handleNext}
                onPlay={() => setIsPaused(false)}
                onPause={() => setIsPaused(true)}
              />
            ) : (
              <img 
                src={currentPost.media_url} 
                alt="Story" 
                className="w-full h-full object-contain pointer-events-none select-none"
              />
            )
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-center break-words [word-break:break-word]">
              <p className="text-white text-2xl font-bold leading-relaxed">{currentPost.content}</p>
            </div>
          )}

          {/* If there's text overlaid on image/video */}
          {currentPost.media_url && currentPost.content && (
            <div className="absolute bottom-16 inset-x-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10 pointer-events-none break-words [word-break:break-word]">
              <p className="text-white text-center text-lg">{currentPost.content}</p>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="absolute bottom-0 inset-x-0 z-20 p-4 pb-6 flex items-center gap-4 bg-gradient-to-t from-black/60 to-transparent">
           <button 
              onClick={(e) => { e.stopPropagation(); handleLike(currentPost.id); }}
              className="flex items-center gap-1.5 text-white drop-shadow-md hover:opacity-80 transition-opacity"
            >
              <Heart size={26} className={currentPost.is_liked ? "fill-red-500 text-red-500" : "text-white"} />
              <span className="font-medium text-sm">{currentPost.likes_count || ''}</span>
            </button>
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setIsPaused(true); 
                openComments(currentPost.id);
                loadComments(currentPost.id);
                setShowComments(true);
              }}
              className="flex items-center gap-1.5 text-white drop-shadow-md hover:opacity-80 transition-opacity"
            >
              <MessageCircle size={26} />
              <span className="font-medium text-sm">{currentPost.comments_count || ''}</span>
            </button>
            {currentPost.is_viewed && currentPost.user_id !== user.id && (
              <div className="ml-auto text-xs text-white/50 bg-black/40 px-2 py-1 rounded-md mb-0">
                Просмотрено
              </div>
            )}
        </div>

        {/* Comments Overlay */}
        {showComments && (
          <div className="absolute inset-x-0 bottom-0 top-1/4 bg-neutral-900 rounded-t-3xl z-30 flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <h3 className="font-bold text-white">Комментарии</h3>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowComments(false); setIsPaused(false); }}
                className="p-2 text-neutral-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {(!commentsMap[currentPost.id] || commentsMap[currentPost.id].length === 0) ? (
                <div className="text-center text-neutral-500 mt-10">
                  <MessageCircle size={32} className="mx-auto mb-2 opacity-50" />
                  <p>Нет комментариев</p>
                </div>
              ) : (
                commentsMap[currentPost.id].map(comment => (
                  <div key={comment.id} className="flex gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center shrink-0 overflow-hidden relative">
                      {comment.avatar_url ? (
                        <Image src={comment.avatar_url} alt="Avatar" fill className="object-cover" unoptimized />
                      ) : (
                        <span className="text-white font-bold text-xs">{comment.first_name?.[0] || '?'}</span>
                      )}
                    </div>
                    <div className="flex-1 bg-neutral-800 rounded-2xl rounded-tl-none px-3 py-2">
                      <h4 className="font-semibold text-white text-xs">{comment.first_name} {comment.last_name}</h4>
                      <p className="text-neutral-300">{comment.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (newCommentContent.trim()) {
                  handleCommentSubmit(e, currentPost.id, newCommentContent);
                  setNewCommentContent('');
                }
              }} 
              className="p-4 border-t border-neutral-800 bg-neutral-900"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCommentContent}
                  onChange={(e) => setNewCommentContent(e.target.value)}
                  placeholder={t('feed.writeComment')}
                  className="flex-1 bg-neutral-800 text-white rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/30 outline-none placeholder:text-neutral-500"
                />
                <button 
                  type="submit"
                  disabled={!newCommentContent.trim()}
                  className="p-2 text-indigo-400 hover:bg-neutral-800 rounded-full disabled:opacity-50 transition-colors"
                >
                  <MessageCircle size={20} />
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
