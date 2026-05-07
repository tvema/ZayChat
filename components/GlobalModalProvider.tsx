'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useLanguage } from './LanguageProvider';

type ConfirmOptions = {
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

type GlobalModalContextType = {
  showAlert: (message: string) => void;
  showConfirm: (options: ConfirmOptions) => void;
};

const GlobalModalContext = createContext<GlobalModalContextType | undefined>(undefined);

export function useGlobalModal() {
  const context = useContext(GlobalModalContext);
  if (!context) {
    throw new Error('useGlobalModal must be used within a GlobalModalProvider');
  }
  return context;
}

export function GlobalModalProvider({ children }: { children: ReactNode }) {
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const { t } = useLanguage();

  const showAlert = (message: string) => setAlertMessage(message);
  const showConfirm = (options: ConfirmOptions) => setConfirmOptions(options);

  return (
    <GlobalModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      {alertMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-sm w-full p-6 text-center">
            <p className="text-neutral-900 dark:text-neutral-100 mb-6">{alertMessage}</p>
            <button
              onClick={() => setAlertMessage(null)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 w-full"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {confirmOptions && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-sm w-full p-6 text-center">
            <p className="text-neutral-900 dark:text-neutral-100 mb-6">{confirmOptions.message}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  if (confirmOptions.onCancel) confirmOptions.onCancel();
                  setConfirmOptions(null);
                }}
                className="px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-md hover:bg-neutral-300 dark:hover:bg-neutral-600 flex-1"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                onClick={() => {
                  confirmOptions.onConfirm();
                  setConfirmOptions(null);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex-1"
              >
                {t('common.confirm') || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </GlobalModalContext.Provider>
  );
}
