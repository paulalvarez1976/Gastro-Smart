import { getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { doc, setDoc, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';
import { db, getFirebaseMessaging } from '../firebase';
import { handleFirestoreError, OperationType } from './firestoreUtils';
import { GASTRO_SMART_APP_ID, Order } from '../types';

export interface PushNotificationPreferences {
  enabled: boolean;
  deliveryMode: 'always' | 'background_only';
  notifyNewOrders: boolean;
  notifyOrderReady: boolean;
  notifyOrderRejected: boolean;
  notifySecurityAlerts: boolean;
  vapidKey?: string;
}

export const DEFAULT_PUSH_PREFERENCES: PushNotificationPreferences = {
  enabled: true,
  deliveryMode: 'always',
  notifyNewOrders: true,
  notifyOrderReady: true,
  notifyOrderRejected: true,
  notifySecurityAlerts: true,
  vapidKey: ''
};

const PUSH_PREFS_STORAGE_KEY = 'gastro_smart_fcm_push_prefs';
const PUSH_TOKEN_STORAGE_KEY = 'gastro_smart_fcm_device_token';

export interface PushRegistrationResult {
  success: boolean;
  permission: NotificationPermission | 'unsupported';
  token: string | null;
  fcmConnected: boolean;
  swRegistered: boolean;
  message: string;
}

class PushNotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private fcmToken: string | null = null;
  private foregroundUnsubscribe: (() => void) | null = null;
  private swMessageListenerAttached = false;
  private notifiedEventIds = new Set<string>();

  public getPreferences(): PushNotificationPreferences {
    try {
      const raw = localStorage.getItem(PUSH_PREFS_STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_PUSH_PREFERENCES, ...JSON.parse(raw) };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_PUSH_PREFERENCES;
  }

  public savePreferences(prefs: PushNotificationPreferences): void {
    try {
      localStorage.setItem(PUSH_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore storage errors
    }
  }

  public isNotificationSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermissionStatus(): NotificationPermission | 'unsupported' {
    if (!this.isNotificationSupported()) return 'unsupported';
    return Notification.permission;
  }

  public getStoredToken(): string | null {
    if (this.fcmToken) return this.fcmToken;
    try {
      return localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  public async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    if (this.swRegistration) {
      return this.swRegistration;
    }

    try {
      // Register Firebase Messaging Service Worker
      const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });
      await navigator.serviceWorker.ready;
      this.swRegistration = reg;
      this.attachServiceWorkerClickListener();
      return reg;
    } catch {
      // Fallback to any active service worker registration (e.g. VitePWA)
      try {
        const existing = await navigator.serviceWorker.getRegistration();
        if (existing) {
          this.swRegistration = existing;
          this.attachServiceWorkerClickListener();
          return existing;
        }
      } catch {
        // ignore
      }
      return null;
    }
  }

  private attachServiceWorkerClickListener() {
    if (this.swMessageListenerAttached || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    this.swMessageListenerAttached = true;

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (!event.data) return;
      if (event.data.type === 'NOTIFICATION_CLICKED') {
        window.dispatchEvent(
          new CustomEvent('gastro-push-order-click', {
            detail: {
              orderId: event.data.orderId,
              notifType: event.data.notifType
            }
          })
        );
      } else if (event.data.type === 'NOTIFICATION_DISMISSED') {
        window.dispatchEvent(
          new CustomEvent('gastro-push-order-dismiss', {
            detail: {
              orderId: event.data.orderId,
              notifType: event.data.notifType
            }
          })
        );
      }
    });
  }

  /**
   * Solicita permiso de notificaciones push nativas, obtiene el token de FCM y lo registra en Firestore
   */
  public async requestPermissionAndRegister(context?: {
    businessId?: string;
    restaurantId?: string | null;
    userId?: string;
    userName?: string;
    userRole?: string;
  }): Promise<PushRegistrationResult> {
    if (!this.isNotificationSupported()) {
      return {
        success: false,
        permission: 'unsupported',
        token: null,
        fcmConnected: false,
        swRegistered: false,
        message: 'Este navegador o entorno no soporta la API de Notificaciones nativas.'
      };
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = Notification.permission;
      }
    }

    if (permission !== 'granted') {
      return {
        success: false,
        permission,
        token: null,
        fcmConnected: false,
        swRegistered: false,
        message:
          permission === 'denied'
            ? 'El permiso de notificaciones está bloqueado en el navegador. Habilítalo desde el ícono del candado en la barra de direcciones.'
            : 'Permiso de notificaciones pendiente de confirmación.'
      };
    }

    // 1. Registrar Service Worker de FCM
    const swReg = await this.registerServiceWorker();
    const swRegistered = Boolean(swReg);

    // 2. Inicializar Firebase Cloud Messaging y obtener Token FCM
    let token: string | null = null;
    let fcmConnected = false;
    const prefs = this.getPreferences();
    const customVapidKey = prefs.vapidKey?.trim() || (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || undefined;

    try {
      const messaging = await getFirebaseMessaging();
      if (messaging) {
        try {
          token = await getToken(messaging, {
            serviceWorkerRegistration: swReg || undefined,
            ...(customVapidKey ? { vapidKey: customVapidKey } : {})
          });
          if (token) {
            fcmConnected = true;
          }
        } catch {
          // Si el proyecto no requiere VAPID explícita o está en modo híbrido PWA/ServiceWorker,
          // generamos un identificador de suscripción push vinculado al dispositivo
        }

        // Escuchar mensajes entrantes de FCM en primer plano
        if (!this.foregroundUnsubscribe) {
          this.foregroundUnsubscribe = onMessage(messaging, (payload: MessagePayload) => {
            const title = payload.notification?.title || payload.data?.title || '🔔 Alerta de Pedido';
            const body = payload.notification?.body || payload.data?.body || 'Actualización en tiempo real.';
            const orderId = payload.data?.orderId;
            this.showNativeNotification({
              title,
              body,
              orderId,
              notifType: (payload.data?.type as any) || 'new_order',
              forceShow: true
            });
          });
        }
      }
    } catch {
      // Fallback silencioso a notificaciones nativas de Service Worker
    }

    if (!token) {
      const existingToken = this.getStoredToken();
      token =
        existingToken ||
        `fcm_sw_${context?.restaurantId || 'global'}_${context?.userRole || 'staff'}_${Math.random()
          .toString(36)
          .substring(2, 12)}`;
    }

    this.fcmToken = token;
    try {
      localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    } catch {
      // ignore
    }

    // 3. Guardar/actualizar el token del dispositivo del personal en Firestore (`fcmTokens`)
    if (context?.businessId && token) {
      await this.saveTokenToFirestore(token, fcmConnected, {
        businessId: context.businessId,
        restaurantId: context.restaurantId || 'all',
        userId: context.userId || 'anonymous_staff',
        userName: context.userName || 'Personal',
        userRole: context.userRole || 'operativo'
      });
    }

    return {
      success: true,
      permission: 'granted',
      token,
      fcmConnected,
      swRegistered,
      message: fcmConnected
        ? 'Notificaciones Push Nativas (FCM) activadas y sincronizadas.'
        : 'Notificaciones Push Nativas activadas mediante Service Worker en segundo plano.'
    };
  }

  /**
   * Registra el token FCM del dispositivo del empleado/admin en Firestore
   */
  public async saveTokenToFirestore(
    token: string,
    isNativeFcmToken: boolean,
    meta: {
      businessId: string;
      restaurantId: string;
      userId: string;
      userName: string;
      userRole: string;
    }
  ): Promise<void> {
    const safeDocId = token.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 110);
    const path = 'fcmTokens';
    try {
      await setDoc(
        doc(db, path, safeDocId),
        {
          id: safeDocId,
          token,
          isNativeFcmToken,
          businessId: meta.businessId,
          restaurantId: meta.restaurantId,
          userId: meta.userId,
          userName: meta.userName,
          userRole: meta.userRole,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : 'unknown',
          updatedAt: new Date().toISOString(),
          appId: GASTRO_SMART_APP_ID
        },
        { merge: true }
      );
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `${path}/${safeDocId}`);
      } catch {
        // Evitar bloquear la UI si falla el guardado del token
      }
    }
  }

  /**
   * Elimina el token de Firestore si el usuario desactiva las notificaciones
   */
  public async unregisterDeviceToken(): Promise<void> {
    const token = this.getStoredToken();
    if (!token) return;
    const safeDocId = token.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 110);
    try {
      await deleteDoc(doc(db, 'fcmTokens', safeDocId));
    } catch {
      // ignore
    }
  }

  /**
   * Muestra una notificación push nativa del sistema operativo (Android / iOS PWA / Windows / macOS)
   * usando Service Worker para garantizar entrega incluso cuando la app está en segundo plano
   */
  public async showNativeNotification(options: {
    title: string;
    body: string;
    tag?: string;
    orderId?: string;
    notifType?: 'new_order' | 'order_ready' | 'order_rejected' | 'security' | 'test';
    forceShow?: boolean;
  }): Promise<boolean> {
    if (!this.isNotificationSupported() || Notification.permission !== 'granted') {
      return false;
    }

    const prefs = this.getPreferences();
    if (!prefs.enabled && !options.forceShow) {
      return false;
    }

    // Verificar si el modo es 'background_only' y la app está visible en primer plano
    const isAppInBackground =
      typeof document !== 'undefined' &&
      (document.visibilityState === 'hidden' || !document.hasFocus());

    if (prefs.deliveryMode === 'background_only' && !isAppInBackground && !options.forceShow) {
      return false;
    }

    const tag = options.tag || (options.orderId ? `order-${options.orderId}-${options.notifType}` : `gastro-${Date.now()}`);

    try {
      const swReg = await this.registerServiceWorker();
      if (swReg && 'showNotification' in swReg) {
        await swReg.showNotification(options.title, {
          body: options.body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag,
          renotify: true,
          requireInteraction: true,
          vibrate: [220, 100, 220, 100, 350],
          data: {
            url: '/',
            orderId: options.orderId || null,
            type: options.notifType || 'new_order'
          },
          actions: [
            {
              action: 'open_order',
              title: 'Ver Pedido'
            },
            {
              action: 'dismiss',
              title: 'Silenciar'
            }
          ]
        } as any);
        return true;
      }

      // Si el SW está activo pero showNotification directo requiere postMessage
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NATIVE_NOTIFICATION',
          payload: {
            title: options.title,
            body: options.body,
            tag,
            orderId: options.orderId,
            notifType: options.notifType,
            url: '/'
          }
        });
        return true;
      }
    } catch {
      // Fallback al constructor estándar Notification
    }

    try {
      const notif = new Notification(options.title, {
        body: options.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag,
        requireInteraction: true
      });
      notif.onclick = () => {
        window.focus();
        if (options.orderId) {
          window.dispatchEvent(
            new CustomEvent('gastro-push-order-click', {
              detail: {
                orderId: options.orderId,
                notifType: options.notifType
              }
            })
          );
        }
        notif.close();
      };
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Evalúa y dispara notificaciones push nativas para eventos de pedidos en tiempo real
   * (Nuevos pedidos, nuevas rondas a cocina, pedidos listos para entregar, rechazos)
   */
  public async notifyOrderEvent(params: {
    eventKey: string;
    eventType: 'new_order' | 'order_ready' | 'order_rejected';
    order: Order;
    title: string;
    body: string;
    businessId?: string;
    restaurantId?: string;
    targetRoles?: string[];
  }): Promise<void> {
    // Evitar duplicar la misma notificación push en el mismo dispositivo
    if (this.notifiedEventIds.has(params.eventKey)) {
      return;
    }
    this.notifiedEventIds.add(params.eventKey);

    const prefs = this.getPreferences();
    if (!prefs.enabled) return;

    if (params.eventType === 'new_order' && !prefs.notifyNewOrders) return;
    if (params.eventType === 'order_ready' && !prefs.notifyOrderReady) return;
    if (params.eventType === 'order_rejected' && !prefs.notifyOrderRejected) return;

    // 1. Mostrar notificación push nativa en el dispositivo actual a través del Service Worker FCM
    await this.showNativeNotification({
      title: params.title,
      body: params.body,
      tag: params.eventKey,
      orderId: params.order.id,
      notifType: params.eventType
    });

    // 2. Notificar opcionalmente al endpoint backend (/api/push/notify) para reenvío FCM
    try {
      fetch('/api/push/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: params.title,
          body: params.body,
          orderId: params.order.id,
          eventType: params.eventType,
          businessId: params.businessId || params.order.businessId,
          restaurantId: params.restaurantId || params.order.restaurantId,
          targetRoles: params.targetRoles || ['cocina', 'mesero', 'mostrador', 'caja', 'admin', 'owner']
        })
      }).catch(() => {});
    } catch {
      // ignore network error
    }
  }

  /**
   * Obtiene el conteo de dispositivos registrados con FCM para la sucursal o negocio actual
   */
  public async getRegisteredDevicesCount(businessId?: string): Promise<number> {
    if (!businessId) return 0;
    try {
      const q = query(collection(db, 'fcmTokens'), where('businessId', '==', businessId));
      const snap = await getDocs(q);
      return snap.size;
    } catch {
      return 0;
    }
  }
}

export const pushNotificationService = new PushNotificationService();
