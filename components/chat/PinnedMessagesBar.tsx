import React, { useState } from 'react';
import { Pin, X, ChevronDown, ChevronUp } from 'lucide-react';
import { PinnedMessage } from '@/types/chat';
import { useLanguage } from '@/components/LanguageProvider';

interface PinnedMessagesBarProps {
  pinnedMessages: PinnedMessage[];
  onUnpinMessage: (messageId: string, snippet?: string) => void;
  onMessageClick?: (messageId: string) => void;
}

export function PinnedMessagesBar({ pinnedMessages, onUnpinMessage, onMessageClick }: PinnedMessagesBarProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  if (!pinnedMessages || pinnedMessages.length === 0) return null;

  const displayMessages = expanded ? pinnedMessages : [pinnedMessages[pinnedMessages.length - 1]];

  const renderMessageContent = (content: string) => {
    if (!content) return '...';
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.type === 'file' || parsed.url || parsed.fileId) {
          return parsed.text ? `📎 ${parsed.text}` : `📎 ${t('modals.fileAttachment') || 'File attachment'}`;
        }
      } catch (e) {}
    }
    return content;
  };

  return (
    <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 z-10 shadow-sm">
      <div className="flex flex-col">
        {displayMessages.map((pinned, index) => (
          <div 
            key={pinned.id} 
            className={`flex items-center gap-3 px-4 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer ${index > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''}`}
            onClick={() => onMessageClick && onMessageClick(pinned.message_id)}
          >
            <div className="text-indigo-500 dark:text-indigo-400 shrink-0">
              <Pin size={16} className="fill-current" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate">
                  {pinned.message?.sender_username || t('modals.pinned')}
                </span>
                <span className="text-[10px] text-neutral-400 shrink-0">
                  {new Date(pinned.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 truncate">
                {renderMessageContent(pinned.message?.content || '')}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onUnpinMessage(pinned.message_id, renderMessageContent(pinned.message?.content || ''));
                }}
                className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                title={t('modals.unpinMessage') || 'Unpin Message'}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
        
        {pinnedMessages.length > 1 && (
          <button 
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-center py-1 text-xs text-neutral-500 hover:text-indigo-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors border-t border-neutral-100 dark:border-neutral-800"
          >
            {expanded ? (
              <span className="flex items-center gap-1"><ChevronUp size={14} /> {t('common.showLess') || 'Show less'}</span>
            ) : (
              <span className="flex items-center gap-1"><ChevronDown size={14} /> {pinnedMessages.length - 1} {t('common.more') || 'more'}</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
