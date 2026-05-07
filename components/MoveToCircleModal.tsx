'use client';

import { motion, AnimatePresence } from 'motion/react';
import { X, Layers, Check, Search, ShieldAlert, BellOff } from 'lucide-react';
import { User } from '@/types/chat';

interface MoveToCircleModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: User | null;
  onMove: (contactId: string, toCircleType: 'normal' | 'dnd' | 'blacklist') => void;
  currentCircleType?: 'normal' | 'dnd' | 'blacklist';
}

export function MoveToCircleModal({
  isOpen,
  onClose,
  contact,
  onMove,
  currentCircleType = 'normal'
}: MoveToCircleModalProps) {
  if (!contact) return null;

  const circles = [
    { type: 'normal' as const, name: 'Обычные контакты', icon: Search, color: 'text-indigo-500' },
    { type: 'dnd' as const, name: 'Не беспокоить', icon: BellOff, color: 'text-amber-500' },
    { type: 'blacklist' as const, name: 'Чёрный список', icon: ShieldAlert, color: 'text-red-500' }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
                    <Layers size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Переместить</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Выберите тип для {contact.first_name}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors text-neutral-500"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
                {circles.map(({ type, name, icon: Icon, color }) => {
                  const isCurrent = currentCircleType === type;
                  
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        onMove(contact.id, type);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border ${isCurrent ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' : 'bg-neutral-50 dark:bg-neutral-800/50 border-transparent hover:border-neutral-200 dark:hover:border-neutral-700'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} className={color} />
                        <span className="text-sm font-medium">{name}</span>
                      </div>
                      {isCurrent && (
                        <Check size={16} className="text-indigo-600 dark:text-indigo-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
