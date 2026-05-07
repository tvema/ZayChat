import React, { useEffect, useState } from 'react';
import { Bell, Clock, X } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import { Reminder } from '@/types/chat';

interface TriggeredRemindersOverlayProps {
  reminders: Reminder[];
  onSnooze: (id: string, minutes: number) => void;
  onDismiss: (id: string) => void;
}

export default function TriggeredRemindersOverlay({ reminders, onSnooze, onDismiss }: TriggeredRemindersOverlayProps) {
  const { t } = useLanguage();
  const [now, setNow] = useState(new Date());
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000); // Check every 10 seconds
    return () => clearInterval(timer);
  }, []);

  // Filter for reminders that are triggered and not dismissed
  const triggeredReminders = reminders.filter(r => {
    if (r.is_dismissed) return false;
    const remindDate = new Date(r.remind_at);
    return now >= remindDate;
  });

  useEffect(() => {
    const newTriggeredIds = triggeredReminders.map(r => r.id);
    const hasNew = newTriggeredIds.some(id => !notifiedIds.has(id));
    
    if (hasNew) {
      // Play notification sound
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
          
          const playTone = (freq: number, startTime: number, duration: number) => {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            osc.start(startTime);
            osc.stop(startTime + duration);
          };

          playTone(880, ctx.currentTime, 0.3); // A5
          playTone(1108.73, ctx.currentTime + 0.15, 0.5); // C#6
        }
      } catch (e) {
        console.error("Audio play failed", e);
      }
      
      setNotifiedIds(new Set([...notifiedIds, ...newTriggeredIds]));
    }
  }, [triggeredReminders, notifiedIds]);

  if (triggeredReminders.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm w-full">
      {triggeredReminders.map(reminder => (
        <div key={reminder.id} className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-red-200 dark:border-red-900/50 overflow-hidden animate-in slide-in-from-right-8 fade-in duration-300">
          <div className="bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-3">
            <div className="bg-red-100 dark:bg-red-900/50 p-2 rounded-full shrink-0 text-red-600 dark:text-red-400">
              <Bell size={20} className="animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-red-700 dark:text-red-400 text-sm">
                  {t('modals.triggered') || 'Triggered!'}
                </h4>
                <button 
                  onClick={() => onDismiss(reminder.id)}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 mt-1 line-clamp-2">
                {reminder.comment ? (
                  <span className="font-medium">{reminder.comment}</span>
                ) : reminder.message ? (
                  reminder.message.content
                ) : (
                  t('modals.chatReminder') || 'Chat Reminder'
                )}
              </p>
              
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => onSnooze(reminder.id, 15)}
                  className="flex-1 px-2 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Clock size={12} /> {t('modals.snooze15m') || '15 min'}
                </button>
                <button
                  onClick={() => onSnooze(reminder.id, 60)}
                  className="flex-1 px-2 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Clock size={12} /> {t('modals.snooze1h') || '1 hour'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
