package app.noir.launcher

import android.service.notification.NotificationListenerService

/**
 * Exists only so the user can grant NOIR "notification access", which Android requires before an
 * app may read the active media sessions (what's playing in Spotify, YouTube Music, …).
 * NOIR never reads or stores notifications themselves.
 */
class MediaListener : NotificationListenerService()
