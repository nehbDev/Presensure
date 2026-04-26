import {
  Pusher,
  PusherChannel,
  PusherEvent,
} from "@pusher/pusher-websocket-react-native";

interface PusherCallbacks {
  onAttendanceUpdate?: (data: any) => void;
  onBLEDetection?: (data: any) => void;
  onSubscribed?: (channelName: string) => void;
  onError?: (error: any) => void;
}

class PusherService {
  private pusher: Pusher | null = null;
  private channels: Map<string, PusherChannel> = new Map();
  private isInitializing: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.pusher) {
      return;
    }

    this.connectionPromise = this._initializePusher();
    return this.connectionPromise;
  }

  private async _initializePusher(): Promise<void> {
    this.isInitializing = true;

    try {
      this.pusher = await Pusher.getInstance();

      await this.pusher.init({
        apiKey: "ec697c2331fc8ebef1e9",
        cluster: "ap1",
      });

      await this.pusher.connect();
    } catch (error) {
      this.pusher = null;
      this.connectionPromise = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async subscribeToSession(sessionId: string, callbacks: PusherCallbacks): Promise<boolean> {
    try {
      await this.init();

      if (!this.pusher) {
        throw new Error('Pusher instance not available');
      }

      const channelName = `public-session.${sessionId}`;

      // Unsubscribe first if already subscribed
      if (this.channels.has(channelName)) {
        await this.unsubscribeFromSession(sessionId);
      }

      const channel = await this.pusher.subscribe({
        channelName,
        onEvent: (event: PusherEvent) => {
          this.handlePusherEvent(event, callbacks);
        },
      });

      this.channels.set(channelName, channel);
      return true;

    } catch (error) {
      callbacks.onError?.(error);
      return false;
    }
  }

  private handlePusherEvent(event: PusherEvent, callbacks: PusherCallbacks) {
    try {
      const parsedData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

      switch (event.eventName) {
        case 'attendance.record.updated':
          callbacks.onAttendanceUpdate?.(parsedData);
          break;
        case 'ble.detection.recorded':
          callbacks.onBLEDetection?.(parsedData);
          break;
        case 'pusher:subscription_error':
          callbacks.onError?.(new Error(`Subscription error: ${JSON.stringify(parsedData)}`));
          break;
      }
    } catch (error) {
      console.error('Error processing Pusher event:', error);
    }
  }

  async unsubscribeFromSession(sessionId: string): Promise<boolean> {
    const channelName = `public-session.${sessionId}`;

    try {
      if (this.channels.has(channelName)) {
        await this.pusher?.unsubscribe({ channelName });
        this.channels.delete(channelName);
        return true;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.pusher) {
        await this.pusher.disconnect();
        this.pusher = null;
      }
    } catch (error) {
      console.error("Error disconnecting Pusher:", error);
    }
  }

  isSubscribed(sessionId: string): boolean {
    const channelName = `public-session.${sessionId}`;
    return this.channels.has(channelName);
  }

  getConnectionState(): string {
    return this.pusher?.connectionState || 'DISCONNECTED';
  }
}

export default new PusherService();