import React, { useEffect, useState } from 'react';
import { X, Bell, Pin, Trash2, Edit2 } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import { Reminder, PinnedMessage } from '@/types/chat';

interface RemindersListModalProps {
  reminders: Reminder[];
  pinnedMessages: PinnedMessage[];
  onClose: () => void;
  onDeleteReminder: (id: string) => void;
  onEditReminder?: (reminder: Reminder) => void;
  onUnpinMessage: (id: string, snippet?: string) => void;
}

export default function RemindersListModal({ reminders, pinnedMessages, onClose, onDeleteReminder, onEditReminder, onUnpinMessage }: RemindersListModalProps) {
  const { t } = useLanguage();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-md overflow-hidden shadow-xl flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Bell size={18} className="text-indigo-500" />
            {t('modals.reminders') || 'Reminders & Pinned'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1 space-y-6">
          {pinnedMessages.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                <Pin size={14} /> {t('modals.pinned') || 'Pinned Messages'}
              </h4>
              {pinnedMessages.map(pinned => (
                <div key={pinned.id} className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                      <Pin size={12} /> {new Date(pinned.created_at).toLocaleString()}
                    </div>
                    <button 
                      onClick={() => onUnpinMessage(pinned.message_id, renderMessageContent(pinned.message?.content || ''))}
                      className="text-neutral-400 hover:text-red-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="text-sm text-neutral-700 dark:text-neutral-300 line-clamp-3">
                    {renderMessageContent(pinned.message?.content || '')}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
              <Bell size={14} /> {t('modals.reminders') || 'Reminders'}
            </h4>
            {reminders.length === 0 ? (
              <div className="text-center text-neutral-500 py-4">
                {t('modals.noReminders') || 'No active reminders.'}
              </div>
            ) : (
              reminders.map(reminder => {
                const remindDate = new Date(reminder.remind_at);
                const isTriggered = !reminder.is_dismissed && now >= remindDate;
                
                return (
                  <div key={reminder.id} className={`p-3 rounded-xl border ${isTriggered ? 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800/50' : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        {isTriggered ? (
                          <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                            <Bell size={12} className="animate-pulse" /> {t('modals.triggered') || 'Triggered!'}
                          </span>
                        ) : (
                          <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                            <Bell size={12} /> {remindDate.toLocaleString()}
                          </span>
                        )}
                        {reminder.recurrence && reminder.recurrence !== 'none' && (
                          <span className="text-neutral-500 flex items-center gap-1 ml-2">
                            ({reminder.recurrence})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {onEditReminder && (
                          <button 
                            onClick={() => onEditReminder(reminder)}
                            className="p-1 text-neutral-400 hover:text-indigo-500 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => onDeleteReminder(reminder.id)}
                          className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    {reminder.comment && reminder.message && (
                      <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-1">
                        {reminder.comment}
                      </div>
                    )}
                    
                    <div className="text-sm text-neutral-700 dark:text-neutral-300 line-clamp-3">
                      {reminder.message ? (
                        renderMessageContent(reminder.message.content)
                      ) : reminder.comment ? (
                        <span className="font-medium">{reminder.comment}</span>
                      ) : (
                        t('modals.chatReminder') || 'Chat Reminder'
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
