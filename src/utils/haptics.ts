import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Utility for triggering haptic vibrations across Mobile Web (PWA), Android and iOS (Capacitor)
 */
class HapticsManager {
  private isCapacitorAvailable(): boolean {
    try {
      return typeof window !== 'undefined' && 'Capacitor' in window;
    } catch {
      return false;
    }
  }

  /**
   * Light tactile tap (button presses, keypad entry, item selection)
   */
  async tap(): Promise<void> {
    try {
      if (this.isCapacitorAvailable()) {
        await Haptics.impact({ style: ImpactStyle.Light });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(15);
      }
    } catch {
      // Non-blocking fallback
    }
  }

  /**
   * Medium impact (toggle actions, tab changes)
   */
  async medium(): Promise<void> {
    try {
      if (this.isCapacitorAvailable()) {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(30);
      }
    } catch {
      // Non-blocking fallback
    }
  }

  async impactMedium(): Promise<void> {
    return this.medium();
  }

  /**
   * Heavy impact (batch actions, confirmations)
   */
  async impactHeavy(): Promise<void> {
    try {
      if (this.isCapacitorAvailable()) {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(60);
      }
    } catch {}
  }

  /**
   * Selection tick
   */
  async selection(): Promise<void> {
    try {
      if (this.isCapacitorAvailable()) {
        await Haptics.selectionStart();
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
    } catch {}
  }

  /**
   * Success notification (Order paid, table released, shift opened)
   */
  async success(): Promise<void> {
    try {
      if (this.isCapacitorAvailable()) {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([60, 40, 60]);
      }
    } catch {
      // Non-blocking fallback
    }
  }

  /**
   * Alert when Kitchen marks order/dish ready for Waiter to pick up
   * Distinct rhythm: beep-beep-boop vibration
   */
  async orderReady(): Promise<void> {
    try {
      if (this.isCapacitorAvailable()) {
        await Haptics.notification({ type: NotificationType.Success });
        setTimeout(async () => {
          try {
            await Haptics.impact({ style: ImpactStyle.Heavy });
          } catch {}
        }, 150);
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        // Double pulse vibration
        navigator.vibrate([150, 80, 150, 80, 300]);
      }
    } catch {
      // Non-blocking fallback
    }
  }

  /**
   * Warning notification (Low margin alert, stock low, urgent order delayed)
   */
  async warning(): Promise<void> {
    try {
      if (this.isCapacitorAvailable()) {
        await Haptics.notification({ type: NotificationType.Warning });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch {
      // Non-blocking fallback
    }
  }

  /**
   * Error notification (Card rejected, invalid PIN, shift closed)
   */
  async error(): Promise<void> {
    try {
      if (this.isCapacitorAvailable()) {
        await Haptics.notification({ type: NotificationType.Error });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 100, 50, 250]);
      }
    } catch {
      // Non-blocking fallback
    }
  }
}

export const haptics = new HapticsManager();
