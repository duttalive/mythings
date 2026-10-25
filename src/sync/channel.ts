import type { ClientMessage, ServerMessage } from "../../shared/schema";

export type ChannelHandlers = {
	onOpen: () => void;
	onMessage: (message: ServerMessage) => void;
	onClose: () => void;
};

/** A realtime connection to the user's UserStore. */
export interface Channel {
	readonly open: boolean;
	start(handlers: ChannelHandlers): void;
	stop(): void;
	send(message: ClientMessage): void;
	/** Skip any pending backoff and connect now (e.g. when the browser comes online). */
	reconnectNow(): void;
}

type Options = {
	pingIntervalMs?: number;
	pongTimeoutMs?: number;
	maxBackoffMs?: number;
};

export function defaultSocketUrl(): string {
	return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/sync/ws`;
}

/**
 * WebSocket with reconnection (exponential backoff with jitter, 1s → 30s) and a
 * ping/pong heartbeat. The server answers "ping" without waking from
 * hibernation; a missing "pong" means the connection is dead.
 */
export class WebSocketChannel implements Channel {
	#ws: WebSocket | null = null;
	#handlers: ChannelHandlers | null = null;
	#attempts = 0;
	#reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	#pingTimer: ReturnType<typeof setInterval> | undefined;
	#pongTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly url: string = defaultSocketUrl(),
		private readonly options: Options = {},
	) {}

	get open(): boolean {
		return this.#ws?.readyState === WebSocket.OPEN;
	}

	start(handlers: ChannelHandlers): void {
		this.#handlers = handlers;
		this.connect();
	}

	stop(): void {
		this.#handlers = null;
		clearTimeout(this.#reconnectTimer);
		this.teardown();
	}

	send(message: ClientMessage): void {
		if (!this.open) throw new Error("Channel is not open");
		this.#ws?.send(JSON.stringify(message));
	}

	reconnectNow(): void {
		if (!this.#handlers || this.#ws) return;
		clearTimeout(this.#reconnectTimer);
		this.#attempts = 0;
		this.connect();
	}

	private connect() {
		if (!this.#handlers) return;
		const ws = new WebSocket(this.url);
		this.#ws = ws;

		ws.onopen = () => {
			this.#attempts = 0;
			this.startHeartbeat();
			this.#handlers?.onOpen();
		};
		ws.onmessage = (event) => {
			if (event.data === "pong") {
				clearTimeout(this.#pongTimer);
				return;
			}
			try {
				this.#handlers?.onMessage(
					JSON.parse(event.data as string) as ServerMessage,
				);
			} catch (err) {
				console.error("Bad message from server", err);
			}
		};
		ws.onerror = () => ws.close();
		ws.onclose = () => {
			if (this.#ws !== ws) return;
			const wasOpen = this.#pingTimer !== undefined;
			this.teardown();
			if (wasOpen) this.#handlers?.onClose();
			this.scheduleReconnect();
		};
	}

	private teardown() {
		clearInterval(this.#pingTimer);
		clearTimeout(this.#pongTimer);
		this.#pingTimer = undefined;
		const ws = this.#ws;
		this.#ws = null;
		if (ws && ws.readyState !== WebSocket.CLOSED) ws.close(1000);
	}

	private scheduleReconnect() {
		if (!this.#handlers) return;
		const base = Math.min(
			this.options.maxBackoffMs ?? 30_000,
			1000 * 2 ** this.#attempts,
		);
		this.#attempts++;
		this.#reconnectTimer = setTimeout(
			() => this.connect(),
			base * (0.5 + Math.random() / 2),
		);
	}

	private startHeartbeat() {
		this.#pingTimer = setInterval(() => {
			if (!this.open) return;
			this.#ws?.send("ping");
			clearTimeout(this.#pongTimer);
			this.#pongTimer = setTimeout(
				() => this.#ws?.close(),
				this.options.pongTimeoutMs ?? 10_000,
			);
		}, this.options.pingIntervalMs ?? 25_000);
	}
}
