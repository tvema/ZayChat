import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Check, Share2, Users } from 'lucide-react';
import { User } from '@/types/chat';
import { Portal } from '@/components/Portal';
import { useLanguage } from '@/components/LanguageProvider';

interface ShareContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: User[];
  onShare: (selectedContacts: User[]) => void;
  targetName?: string;
  excludedContactId?: string;
}

export function ShareContactsModal({ isOpen, onClose, contacts, onShare, targetName, excludedContactId }: ShareContactsModalProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredContacts = useMemo(() => {
    let filtered = contacts;
    if (excludedContactId) {
      filtered = filtered.filter(c => c.id !== excludedContactId);
    }
    if (!searchQuery) return filtered;
    const query = searchQuery.toLowerCase();
    return filtered.filter(c => 
      c.username?.toLowerCase().includes(query) ||
      c.first_name?.toLowerCase().includes(query) ||
      c.last_name?.toLowerCase().includes(query)
    );
  }, [contacts, searchQuery, excludedContactId]);

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

  const handleShare = () => {
    if (selectedIds.size === 0) return;
    const selectedContacts = contacts.filter(c => selectedIds.has(c.id));
    onShare(selectedContacts);
    onClose();
    setSelectedIds(new Set());
    setSearchQuery('');
  };

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
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
                    <Share2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white leading-tight">
                      Поделиться контактами
                    </h3>
                    <p className="text-xs text-neutral-500 font-medium break-words">
                      {targetName ? `Отправить для: ${targetName}` : 'Выберите контакты для отправки'}
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

              <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder={t('chat.search') || 'Поиск...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-2">
                {filteredContacts.length === 0 ? (
                  <div className="p-8 text-center text-neutral-500">
                    <Users size={32} className="mx-auto mb-3 opacity-20" />
                    <p>Нет контактов</p>
                  </div>
                ) : (
                  <div className="py-2">
                    {filteredContacts.map(contact => (
                      <button
                        key={contact.id}
                        onClick={() => toggleContact(contact.id)}
                        className="w-full flex justify-between items-center p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-xl transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={'w-10 h-10 rounded-full flex shrink-0 items-center justify-center text-sm font-medium ' + (contact.avatar_url ? '' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400')}
                               style={contact.avatar_url ? { backgroundImage: `url(${contact.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
                            {!contact.avatar_url && (contact.first_name?.[0] || contact.username?.[0] || '?').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                              {contact.first_name} {contact.last_name || ''}
                            </p>
                            <p className="text-xs text-neutral-500 truncate">
                              @{contact.username}
                            </p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${selectedIds.has(contact.id) ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-neutral-300 dark:border-neutral-600'}`}>
                          {selectedIds.has(contact.id) && <Check size={14} />}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
                <button
                  onClick={handleShare}
                  disabled={selectedIds.size === 0}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex justify-center items-center gap-2"
                >
                  <Share2 size={18} />
                  <span>Отправить {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
