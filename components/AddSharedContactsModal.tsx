import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Users, UserPlus } from 'lucide-react';
import { User } from '@/types/chat';
import { Portal } from '@/components/Portal';
import { safeLocalStorage } from '@/lib/safeStorage';

interface AddSharedContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: User[];
  userContacts?: User[];
}

export function AddSharedContactsModal({ isOpen, onClose, contacts, userContacts = [] }: AddSharedContactsModalProps) {
  const existingContactIds = new Set(userContacts.map(c => c.id));
  const newContacts = contacts.filter(c => !existingContactIds.has(c.id));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(newContacts.map(c => c.id)));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleContact = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const token = safeLocalStorage.getItem('token');
      const selectedContacts = contacts.filter(c => selectedIds.has(c.id));
      
      const res = await fetch('/api/contacts/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ contactIds: selectedContacts.map(c => c.id) })
      });
      
      if (!res.ok) {
        throw new Error('Не удалось добавить контакты');
      }

      onClose();
      // Optionally trigger a refresh of contacts via an event if needed
      window.dispatchEvent(new CustomEvent('contacts-updated'));
    } catch (e: any) {
      setError(e.message || 'Ошибка добавления');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl overflow-hidden shadow-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white leading-tight">
                      Добавить контакты
                    </h3>
                    <p className="text-xs text-neutral-500 font-medium">
                      Выберите, кого добавить в свой список
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {error && (
                <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium text-center">
                  {error}
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-2 py-2">
                {contacts.length === 0 ? (
                  <div className="p-8 text-center text-neutral-500">
                    <Users size={32} className="mx-auto mb-3 opacity-20" />
                    <p>Нет контактов</p>
                  </div>
                ) : (
                  <div>
                    <div className="px-3 mb-2 flex justify-between items-center">
                      <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Всего {contacts.length}</span>
                      <button 
                        onClick={() => setSelectedIds(selectedIds.size === newContacts.length ? new Set() : new Set(newContacts.map(c => c.id)))}
                        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                        disabled={newContacts.length === 0}
                      >
                        {selectedIds.size === newContacts.length ? 'Снять выделение' : 'Выбрать всех'}
                      </button>
                    </div>
                    {contacts.map(contact => {
                      const isExisting = existingContactIds.has(contact.id);
                      return (
                      <button
                        key={contact.id}
                        onClick={() => {
                          if (!isExisting) toggleContact(contact.id);
                        }}
                        disabled={isExisting}
                        className={`w-full flex justify-between items-center p-3 rounded-xl transition-colors text-left ${isExisting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={'w-10 h-10 rounded-full flex shrink-0 items-center justify-center text-sm font-medium ' + (contact.avatar_url ? '' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400')}
                               style={contact.avatar_url ? { backgroundImage: `url(${contact.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
                            {!contact.avatar_url && (contact.first_name?.[0] || contact.username?.[0] || '?').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                              {contact.first_name} {contact.last_name || ''} {isExisting && <span className="text-xs font-normal text-indigo-500 ml-1">(Уже добавлен)</span>}
                            </p>
                            <p className="text-xs text-neutral-500 truncate">
                              @{contact.username}
                            </p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${selectedIds.has(contact.id) || isExisting ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-neutral-300 dark:border-neutral-600'}`}>
                          {(selectedIds.has(contact.id) || isExisting) && <Check size={14} />}
                        </div>
                      </button>
                    )})}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <button
                  onClick={handleAdd}
                  disabled={selectedIds.size === 0 || isSubmitting}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex justify-center items-center gap-2 shadow-sm"
                >
                  <UserPlus size={18} />
                  <span>{isSubmitting ? 'Добавление...' : `Добавить ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
