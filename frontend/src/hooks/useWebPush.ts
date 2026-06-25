import { useState, useEffect } from 'react';
import { notificationsAPI } from '../lib/api-client';
import { useAuth } from './useAuth';
import toast from 'react-hot-toast';

export function useWebPush() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    // Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // Detect Standalone (PWA)
    const isPwa = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(!!isPwa);

    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      
      // Register and check current subscription
      navigator.serviceWorker.register('/sw.js').then(registration => {
        registration.pushManager.getSubscription().then(sub => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribe = async () => {
    if (!user?.id || !isSupported) return false;
    
    setIsProcessing(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') {
        setIsProcessing(false);
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_KEY;
      if (!vapidPublicKey) throw new Error('No VAPID key provided. Check .env.local');

      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
      }

      await notificationsAPI.subscribePush(user.id, subscription);
      setIsSubscribed(true);
      return true;
    } catch (error: any) {
      console.error('Push Subscription Error:', error);
      // Specific error handling for VAPID key or SW issues
      if (error.message?.includes('VAPID')) {
        toast.error('Lỗi mã bảo mật thông báo (VAPID). Vui lòng kiểm tra cấu hình hệ thống.');
      } else if (error.name === 'NotAllowedError') {
        toast.error('Bạn đã chặn thông báo trong trình duyệt.');
      } else {
        toast.error('Lỗi khi đăng ký thông báo: ' + (error.message || 'Lỗi không xác định'));
      }
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  const unsubscribe = async () => {
    if (!user?.id || !isSupported) return false;

    setIsProcessing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await notificationsAPI.unsubscribePush(user.id, subscription.endpoint);
        await subscription.unsubscribe();
        setIsSubscribed(false);
      }
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  return { isSupported, isSubscribed, permission, isProcessing, isIOS, isStandalone, subscribe, unsubscribe };
}
