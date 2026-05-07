import { safeLocalStorage } from '@/lib/safeStorage';
import React, { useState, useEffect } from 'react';
import { X, Bell, Pin, Clock, Calendar, Users } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

import { Reminder, Group, User } from '@/types/chat';

interface ReminderModalProps {
  onClose: () => void;
  onSave: (remindAt: string, comment?: string, recurrence?: string, targetUserIds?: string[]) => void;
  initialReminder?: Reminder;
  activeGroup?: Group | null;
}

export default function ReminderModal({ onClose, onSave, initialReminder, activeGroup }: ReminderModalProps) {
  const { t } = useLanguage();
  
  const getInitialDate = () => {
    if (initialReminder) {
      const d = new Date(initialReminder.remind_at);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, -1);
      return localISOTime.split('T')[0];
    }
    return '';
  };

  const getInitialTime = () => {
    if (initialReminder) {
      const d = new Date(initialReminder.remind_at);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, -1);
      return localISOTime.split('T')[1].substring(0, 5);
    }
    return '';
  };

  const [date, setDate] = useState(getInitialDate());
  const [time, setTime] = useState(getInitialTime());
  const [comment, setComment] = useState(initialReminder?.comment || '');
  const [recurrence, setRecurrence] = useState<string>(initialReminder?.recurrence || 'none');
  const [members, setMembers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const currentUserStr = typeof window !== 'undefined' ? safeLocalStorage.getItem('user') : null;
  const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;

  useEffect(() => {
    if (activeGroup) {
      const token = safeLocalStorage.getItem('token');
      fetch(`/api/groups/${activeGroup.id}/members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMembers(data);
          if (currentUser) {
            setSelectedUserIds([currentUser.id]); // Default to self
          }
        }
      })
      .catch(console.error);
    }
  }, [activeGroup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) return;
    
    // Combine date and time
    const remindAt = new Date(`${date}T${time}`).toISOString();
    onSave(remindAt, comment, recurrence, activeGroup ? selectedUserIds : undefined);
  };

  const handleQuickSet = (minutes: number) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + minutes);
    
    // Format to YYYY-MM-DD and HH:MM
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, -1);
    
    setDate(localISOTime.split('T')[0]);
    setTime(localISOTime.split('T')[1].substring(0, 5));
  };

  const handleTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0); // 9:00 AM tomorrow
    
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, -1);
    
    setDate(localISOTime.split('T')[0]);
    setTime(localISOTime.split('T')[1].substring(0, 5));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Bell size={18} className="text-indigo-500" />
            {initialReminder ? (t('modals.editReminder') || 'Edit Reminder') : (t('modals.setReminder') || 'Set Reminder')}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t('modals.quickReminders') || 'Quick Settings'}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleQuickSet(15)}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1.5"
              >
                <Clock size={14} /> {t('modals.in15m') || 'In 15 mins'}
              </button>
              <button
                type="button"
                onClick={() => handleQuickSet(60)}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1.5"
              >
                <Clock size={14} /> {t('modals.in1h') || 'In 1 hour'}
              </button>
              <button
                type="button"
                onClick={handleTomorrow}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1.5"
              >
                <Calendar size={14} /> {t('modals.tomorrow') || 'Tomorrow'}
              </button>
            </div>
          </div>

          <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-2"></div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              {t('modals.date') || 'Date'}
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-800"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              {t('modals.time') || 'Time'}
            </label>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              {t('modals.comment') || 'Comment'}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-800 resize-none"
              rows={2}
              placeholder={t('modals.commentPlaceholder') || 'Optional comment...'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              {t('modals.recurrence') || 'Repeat'}
            </label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-800"
            >
              <option value="none">{t('modals.none') || 'Never'}</option>
              <option value="daily">{t('modals.daily') || 'Daily'}</option>
              <option value="weekly">{t('modals.weekly') || 'Weekly'}</option>
              <option value="monthly">{t('modals.monthly') || 'Monthly'}</option>
              <option value="yearly">{t('modals.yearly') || 'Yearly'}</option>
            </select>
          </div>

          {activeGroup && members.length > 0 && !initialReminder && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1">
                <Users size={14} /> {t('modals.assignTo') || 'Assign to'}
              </label>
              <div className="max-h-32 overflow-y-auto w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg dark:bg-neutral-800 space-y-1">
                {members.map(member => (
                  <label key={member.id} className="flex items-center gap-2 block w-full p-1 hover:bg-neutral-50 dark:hover:bg-neutral-700 rounded cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                      checked={selectedUserIds.includes(member.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUserIds(prev => [...prev, member.id]);
                        } else {
                          setSelectedUserIds(prev => prev.filter(id => id !== member.id));
                        }
                      }}
                    />
                    <span className="text-sm truncate">
                      {member.id === currentUser?.id ? (t('modals.you') || 'You') : (member.first_name || member.username)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
