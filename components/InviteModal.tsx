'use client';
import { motion, AnimatePresence } from 'motion/react';
import { Link as LinkIcon, X } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteCode: string | null;
  linkCopied: boolean;
}

export const InviteModal = ({ isOpen, onClose, inviteCode, linkCopied }: InviteModalProps) => {
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative"
          >
            {/* Close Button */}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-all z-10"
              title={t.common.close}
            >
              <X size={20} />
            </button>

            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-6">
                <LinkIcon size={28} />
              </div>
              
              <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
                {t.modals.inviteTitle}
              </h3>
              
              <div className="min-h-[40px] mb-6">
                {linkCopied ? (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    {t.modals.linkCopied}
                  </p>
                ) : (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {t.modals.inviteDescription}
                  </p>
                )}
              </div>
              
              <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl p-4 mb-8 border border-neutral-100 dark:border-neutral-700/50 flex items-center justify-center overflow-hidden">
                <span className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400 break-all">
                  {inviteCode}
                </span>
              </div>
              
              <button 
                onClick={onClose}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-[0.98]"
              >
                {t.common.done}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
