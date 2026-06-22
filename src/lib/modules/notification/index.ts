export {
  createNotification,
  createNotificationFromEmail,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from "./service";
export type { NotificationDTO } from "./service";
export {
  getNotificationPrefs,
  setNotificationPrefs,
  isGroupEmailAllowed,
  isEmailAllowed,
  DEFAULT_PREFS,
  NOTIFICATION_GROUPS,
} from "./preferences";
export type { NotificationPrefs } from "./preferences";
export {
  NOTIF_META,
  GROUP_LABELS,
  metaForType,
  groupForCategory,
  type NotificationGroup,
  type NotificationLevel,
} from "./meta";
