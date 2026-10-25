import type { ClientMessage, ServerMessage } from "../../shared/schema";
import type { Channel, ChannelHandlers } from "../../src/sync/channel";

/** A channel the test drives by hand: open/close it and deliver server messages. */
export class FakeChannel implements Channel {
	open = false;
	readonly sent: ClientMessage[] = [];
	reconnects = 0;
	private handlers: ChannelHandlers | null = null;

	start(handlers: ChannelHandlers): void {
		this.handlers = handlers;
	}

	stop(): void {
		this.handlers = null;
		this.open = false;
	}

	send(message: ClientMessage): void {
		if (!this.open) throw new Error("closed");
		this.sent.push(message);
	}

	reconnectNow(): void {
		this.reconnects++;
	}

	connect(): void {
		this.open = true;
		this.handlers?.onOpen();
	}

	disconnect(): void {
		this.open = false;
		this.handlers?.onClose();
	}

	deliver(message: ServerMessage): void {
		this.handlers?.onMessage(message);
	}

	sentOfType<T extends ClientMessage["type"]>(
		type: T,
	): Extract<ClientMessage, { type: T }>[] {
		return this.sent.filter(
			(m): m is Extract<ClientMessage, { type: T }> => m.type === type,
		);
	}
}
