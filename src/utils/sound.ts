class SoundEffects {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private unlocked: boolean = false;
  private activeAlarms: Map<string, { intervalId: any; type: string }> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      const storedMute = localStorage.getItem('gastro_sound_muted');
      if (storedMute !== null) {
        this.muted = storedMute === 'true';
      }

      // Auto-unlock audio on user's first pointer interaction
      const unlockAudio = () => {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        this.unlocked = true;
        window.removeEventListener('pointerdown', unlockAudio);
      };

      window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('gastro_sound_muted', muted ? 'true' : 'false');
    }
    if (muted) {
      this.stopAllAlarms();
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Inicia una alarma sonora continua y repetitiva que suena periódicamente
   * hasta que el colaborador marque leído / recibido o la detenga explícitamente.
   */
  public startRepeatingAlarm(
    alarmKey: string, 
    type: 'kitchen' | 'ready' | 'security' | 'warning' | 'cash' | 'notification' | 'counter' = 'notification',
    intervalMs: number = 3800,
    customPlayFn?: () => void
  ) {
    if (this.muted) return;
    
    // Si ya está sonando esta misma alarma, no duplicar el intervalo
    if (this.activeAlarms.has(alarmKey)) {
      return;
    }

    const playByType = () => {
      if (customPlayFn) {
        customPlayFn();
        return;
      }
      switch (type) {
        case 'kitchen':
          this.playNewOrderKitchen();
          break;
        case 'ready':
          this.playOrderReady();
          break;
        case 'counter':
          this.playCounterOrder();
          break;
        case 'security':
          this.playSecurityAlert();
          break;
        case 'warning':
          this.playAlertWarning();
          break;
        case 'cash':
          this.playCashRegister();
          break;
        case 'notification':
        default:
          this.playNotification();
          break;
      }
    };

    // Tocar aviso inicial sin bloquear ni crear bucles infinitos de audio
    playByType();

    // Un único recordatorio suave tras el intervalo para evitar detección de bloqueo de navegador (Browser Locker)
    const intervalId = setTimeout(() => {
      if (!this.muted && this.activeAlarms.has(alarmKey)) {
        playByType();
      }
      this.activeAlarms.delete(alarmKey);
    }, Math.max(intervalMs, 4500));

    this.activeAlarms.set(alarmKey, { intervalId, type });
  }

  /**
   * Detiene una alarma continua específica identificada por su clave
   */
  public stopRepeatingAlarm(alarmKey: string) {
    const existing = this.activeAlarms.get(alarmKey);
    if (existing) {
      clearTimeout(existing.intervalId);
      clearInterval(existing.intervalId);
      this.activeAlarms.delete(alarmKey);
    }
  }

  /**
   * Detiene todas las alarmas sonoras continuas activas
   */
  public stopAllAlarms() {
    this.activeAlarms.forEach(alarm => {
      clearTimeout(alarm.intervalId);
      clearInterval(alarm.intervalId);
    });
    this.activeAlarms.clear();
  }

  /**
   * Obtiene la lista de claves de alarmas activas
   */
  public getActiveAlarmKeys(): string[] {
    return Array.from(this.activeAlarms.keys());
  }

  /**
   * Verifica si hay alarmas sonando activamente
   */
  public hasActiveAlarm(alarmKey?: string): boolean {
    if (alarmKey) {
      return this.activeAlarms.has(alarmKey);
    }
    return this.activeAlarms.size > 0;
  }

  private init() {
    if (this.muted) return;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // Sonido de campana para nuevo pedido en cocina
  playNewOrderKitchen() {
    this.playKitchenCustom('campana', 0.75);
  }

  // Sonido de campana personalizable para cocina con tono y volumen regulable
  playKitchenCustom(tone: 'campana' | 'buzzer' | 'chime' | 'sirena' = 'campana', volume: number = 0.75) {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const vol = Math.max(0.05, Math.min(1.0, volume));

      if (tone === 'buzzer') {
        // Buzzer industrial penetrante de cocina (doble zumbido con armónicos)
        [now, now + 0.16].forEach(start => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(587.33, start); // D5
          gain.gain.setValueAtTime(0.4 * vol, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          osc.start(start);
          osc.stop(start + 0.12);
        });
      } else if (tone === 'chime') {
        // Chime electrónico armónico suave (C6 -> E6 -> G6 -> C7)
        [
          { freq: 1046.50, start: now, dur: 0.25 },
          { freq: 1318.51, start: now + 0.08, dur: 0.3 },
          { freq: 1567.98, start: now + 0.16, dur: 0.35 },
          { freq: 2093.00, start: now + 0.24, dur: 0.5 }
        ].forEach(item => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(item.freq, item.start);
          gain.gain.setValueAtTime(0.35 * vol, item.start);
          gain.gain.exponentialRampToValueAtTime(0.001, item.start + item.dur);
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          osc.start(item.start);
          osc.stop(item.start + item.dur);
        });
      } else if (tone === 'sirena') {
        // Sirena de restaurante para momentos de alta demanda (tono oscilante)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(850, now);
        osc.frequency.linearRampToValueAtTime(1400, now + 0.14);
        osc.frequency.linearRampToValueAtTime(850, now + 0.28);
        osc.frequency.linearRampToValueAtTime(1400, now + 0.42);
        osc.frequency.linearRampToValueAtTime(850, now + 0.56);
        gain.gain.setValueAtTime(0.35 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      } else {
        // Campana tradicional de cocina (triple ding metálico armónico)
        [
          { freq: 880, start: now, dur: 0.4 },
          { freq: 1174.66, start: now + 0.14, dur: 0.6 },
          { freq: 1760, start: now + 0.32, dur: 0.8 },
        ].forEach(item => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(item.freq, item.start);
          gain.gain.setValueAtTime(0.35 * vol, item.start);
          gain.gain.exponentialRampToValueAtTime(0.001, item.start + item.dur);
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          osc.start(item.start);
          osc.stop(item.start + item.dur);
        });
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Alerta sonora cuando el pedido está listo (para mesero)
  playOrderReady() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Sonido alegre de cuatro tonos ascendentes tipo campana de hotel
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const start = now + idx * 0.11;
        const dur = 0.35;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(start);
        osc.stop(start + dur);
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Sonido de notificación general (toasts, avisos en vivo, avisos de sistema)
  playNotification() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Tono suave cristalino doble (F6 -> A6)
      [
        { freq: 1396.91, start: now, dur: 0.25, gain: 0.25 },
        { freq: 1760.00, start: now + 0.09, dur: 0.45, gain: 0.3 }
      ].forEach(item => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(item.freq, item.start);

        gain.gain.setValueAtTime(item.gain, item.start);
        gain.gain.exponentialRampToValueAtTime(0.001, item.start + item.dur);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(item.start);
        osc.stop(item.start + item.dur);
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Sonido de campana para nuevo pedido en Mostrador (despacho express / cobro directo)
  playCounterOrder() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Tres notas brillantes y elegantes tipo mostrador/despacho (G5 -> C6 -> E6)
      [
        { freq: 783.99, start: now, dur: 0.28, gain: 0.3 },
        { freq: 1046.50, start: now + 0.12, dur: 0.32, gain: 0.35 },
        { freq: 1318.51, start: now + 0.26, dur: 0.55, gain: 0.32 }
      ].forEach(item => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(item.freq, item.start);

        gain.gain.setValueAtTime(item.gain, item.start);
        gain.gain.exponentialRampToValueAtTime(0.001, item.start + item.dur);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(item.start);
        osc.stop(item.start + item.dur);
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Sonido de éxito / guardado exitoso
  playSuccess() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      [
        { freq: 523.25, start: now, dur: 0.15, gain: 0.25 }, // C5
        { freq: 659.25, start: now + 0.1, dur: 0.18, gain: 0.28 }, // E5
        { freq: 783.99, start: now + 0.2, dur: 0.35, gain: 0.32 }  // G5
      ].forEach(item => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(item.freq, item.start);

        gain.gain.setValueAtTime(item.gain, item.start);
        gain.gain.exponentialRampToValueAtTime(0.001, item.start + item.dur);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(item.start);
        osc.stop(item.start + item.dur);
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Sonido de alerta de demora (>15 min) o pedido rechazado
  playAlertWarning() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      [440, 370, 311].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const start = now + idx * 0.16;
        const dur = 0.35;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(start);
        osc.stop(start + dur);
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Sonido de Alerta de Seguridad (Fuerza bruta PIN / acceso no autorizado)
  playSecurityAlert() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Sirena de dos pulsos agudos
      [
        { freq: 880, start: now, dur: 0.15 },
        { freq: 659, start: now + 0.15, dur: 0.15 },
        { freq: 880, start: now + 0.30, dur: 0.15 },
        { freq: 659, start: now + 0.45, dur: 0.25 }
      ].forEach(item => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(item.freq, item.start);

        gain.gain.setValueAtTime(0.28, item.start);
        gain.gain.exponentialRampToValueAtTime(0.001, item.start + item.dur);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(item.start);
        osc.stop(item.start + item.dur);
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Sonido de éxito al cobrar o completar acción
  playCashRegister() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(987.77, now);
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.51, now + 0.15);
      gain2.gain.setValueAtTime(0.3, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.5);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Sonido de click sutil en teclado PIN
  playKeypadClick() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {
      // Ignorar
    }
  }
}

export const sounds = new SoundEffects();
