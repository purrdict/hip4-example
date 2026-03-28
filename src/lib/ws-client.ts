/**
 * Hyperliquid WebSocket client (singleton).
 * Manages subscriptions and auto-reconnects on disconnect.
 */

const HL_WS_URL = "wss://api.hyperliquid-testnet.xyz/ws";

type WsHandler = (data: unknown) => void;
type SubKey = string;

function subKey(sub: Record<string, unknown>): SubKey {
  if (sub.type === "allMids") return "allMids";
  if (sub.user) return `${sub.type}:${(sub.user as string).toLowerCase()}`;
  return `${sub.type}:${sub.coin}`;
}

class HyperWsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<SubKey, Set<WsHandler>>();
  private activeSubs = new Set<SubKey>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.shouldReconnect = true;
    this.ws = new WebSocket(HL_WS_URL);

    this.ws.onopen = () => {
      // Re-subscribe all active subs on (re)connect
      for (const key of this.activeSubs) {
        this.sendSub(key, "subscribe");
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        this.dispatch(msg as Record<string, unknown>);
      } catch {
        // ignore non-JSON
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  subscribe(sub: Record<string, unknown>, handler: WsHandler): () => void {
    const key = subKey(sub);
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }
    this.handlers.get(key)!.add(handler);

    if (!this.activeSubs.has(key)) {
      this.activeSubs.add(key);
      this.sendSub(key, "subscribe");
    }

    return () => {
      const set = this.handlers.get(key);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.handlers.delete(key);
          this.activeSubs.delete(key);
          this.sendSub(key, "unsubscribe");
        }
      }
    };
  }

  private sendSub(key: SubKey, method: "subscribe" | "unsubscribe") {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const subscription = this.parseKey(key);
    this.ws.send(JSON.stringify({ method, subscription }));
  }

  private parseKey(key: SubKey): Record<string, unknown> {
    if (key === "allMids") return { type: "allMids" };
    const idx = key.indexOf(":");
    const type = key.slice(0, idx);
    const value = key.slice(idx + 1);
    if (value.startsWith("0x")) return { type, user: value };
    return { type, coin: value };
  }

  private dispatch(msg: Record<string, unknown>) {
    const channel = msg.channel as string | undefined;
    const data = msg.data;
    if (!channel || !data) return;

    if (channel === "allMids") {
      const set = this.handlers.get("allMids");
      if (set) for (const h of set) h(data);
      return;
    }

    const sub = data as Record<string, unknown>;

    // l2Book, candle — have coin in data
    const coin = sub.coin as string | undefined;
    if (coin) {
      const key = `${channel}:${coin}`;
      const set = this.handlers.get(key);
      if (set) for (const h of set) h(sub);
    }
  }
}

// Singleton — created once at module level, NOT inside React components
export const wsClient = new HyperWsClient();
