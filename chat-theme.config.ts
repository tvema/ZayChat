// Конфигурация темы чата (цвета пузырей сообщений)
// Вы можете легко изменить эти значения для кастомизации внешнего вида чата.

export const chatTheme = {
  // Сообщения текущего пользователя (отправленные)
  currentUser: {
    backgroundColor: 'bg-indigo-600 dark:bg-indigo-500',
    textColor: 'text-white',
    borderColor: '', // Пустая строка или undefined
    borderRadius: 'rounded-2xl rounded-tr-sm', // Скругления углов
  },
  // Сообщения оппонента (полученные)
  opponent: {
    backgroundColor: 'bg-white dark:bg-neutral-800',
    textColor: 'text-neutral-800 dark:text-neutral-100',
    borderColor: 'border-neutral-200 dark:border-neutral-700', // Если нужна обводка
    borderRadius: 'rounded-2xl rounded-tl-sm',
  },
  // Общий фон чата
  background: 'bg-neutral-50 dark:bg-neutral-950',
};
