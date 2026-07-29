import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Bell,
  Check,
  Trash2,
  Loader2,
  ShieldAlert,
  FileText,
  Eye,
} from 'lucide-react'
import { notificationsApi, type AppNotification } from '../services/api'
import toast from 'react-hot-toast'

function notificationIcon(type: string) {
  switch (type) {
    case 'system_classified':
      return (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-xl">
          <ShieldAlert className="w-5 h-5" />
        </div>
      )
    case 'document_generated':
      return (
        <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl">
          <FileText className="w-5 h-5" />
        </div>
      )
    default:
      return (
        <div className="p-2.5 bg-gray-50 dark:bg-gray-950/30 text-gray-600 dark:text-gray-400 rounded-xl">
          <Bell className="w-5 h-5" />
        </div>
      )
  }
}

export default function Notifications() {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const queryClient = useQueryClient()

  // Fetch notifications
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', unreadOnly],
    queryFn: () => notificationsApi.list({ unread_only: unreadOnly, limit: 100 }),
  })

  const notifications: AppNotification[] = Array.isArray(data)
    ? data
    : (data?.items ?? [])
  const hasUnread = notifications.some((n: AppNotification) => !n.is_read)
  const hasRead = notifications.some((n: AppNotification) => n.is_read)

  // Mutations
  const markAllReadMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('All notifications marked as read.')
    },
    onError: () => {
      toast.error('Failed to mark notifications as read.')
    },
  })

  const markReadMutation = useMutation({
    mutationFn: (ids: number[]) => notificationsApi.markRead(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: () => {
      toast.error('Failed to update notification state.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Notification deleted.')
    },
    onError: () => {
      toast.error('Failed to delete notification.')
    },
  })

  const deleteReadMutation = useMutation({
    mutationFn: notificationsApi.deleteRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Read history cleared.')
    },
    onError: () => {
      toast.error('Failed to clear read history.')
    },
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
          <p className="text-gray-600 dark:text-gray-400">Your recent compliance and system events</p>
        </div>

        <div className="flex items-center gap-2">
          {hasRead && (
            <button
              onClick={() => deleteReadMutation.mutate()}
              disabled={deleteReadMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900/30 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Clear Read History
            </button>
          )}

          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={!hasUnread || markAllReadMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            Mark all read
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setUnreadOnly(false)}
          className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors -mb-px ${
            !unreadOnly
              ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          All Notifications
        </button>
        <button
          onClick={() => setUnreadOnly(true)}
          className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors -mb-px ${
            unreadOnly
              ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Unread Only
        </button>
      </div>

      {/* Loader */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm">
          <Bell className="w-14 h-14 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">No notifications</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-1">You're all caught up with your feed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n: AppNotification) => (
            <div
              key={n.id}
              className={`bg-white dark:bg-gray-800 rounded-2xl border p-4 flex items-center justify-between gap-4 transition-all ${
                n.is_read
                  ? 'border-gray-200 dark:border-gray-700'
                  : 'border-primary-200 bg-primary-50/20 dark:border-primary-900/30 dark:bg-primary-950/10'
              }`}
            >
              <div className="flex items-start gap-4 min-w-0">
                {!n.is_read && (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary-600 dark:bg-primary-500 mt-3.5 flex-shrink-0" />
                )}
                {notificationIcon(n.notification_type)}
                <div className="min-w-0">
                  <p className={`text-sm ${!n.is_read ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-600 dark:text-gray-300'}`}>
                    {n.title}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{n.message}</p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-1.5">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!n.is_read && (
                  <button
                    onClick={() => markReadMutation.mutate([n.id])}
                    disabled={markReadMutation.isPending}
                    className="p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                    title="Mark as read"
                  >
                    <Eye className="w-4.5 h-4.5" />
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(n.id)}
                  disabled={deleteMutation.isPending}
                  className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                  title="Delete event"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
