import { useState, useEffect, useCallback } from 'react';
import { notificationsAPI } from '@/lib/api-client';
import { useAuth } from './useAuth';

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      if (notifications.length === 0) setLoading(true);
      const response = await notificationsAPI.getAll(user.id);
      const data = response.data || response;
      setNotifications(Array.isArray(data) ? data : []);
      setUnreadCount(Array.isArray(data) ? data.filter((n: any) => !n.isRead).length : 0);
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, notifications.length]);

  useEffect(() => {
    fetchNotifications();
    
    // Polling every 10 seconds to keep it fresh
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    if (!user?.id) return;
    try {
      await notificationsAPI.markAsRead(id, user.id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;
    try {
      await notificationsAPI.markAllAsRead(user.id);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read', error);
    }
  };

  const deleteNotification = async (id: string) => {
    if (!user?.id) return;
    try {
      const notificationToDelete = notifications.find(n => n.id === id);
      await notificationsAPI.delete(id, user.id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (notificationToDelete && !notificationToDelete.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification', error);
    }
  };

  return { 
    notifications, 
    unreadCount, 
    loading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification,
    refresh: fetchNotifications 
  };
}
