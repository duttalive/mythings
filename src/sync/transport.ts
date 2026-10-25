import type { Op, PullResult, PushResult } from "../../shared/schema";

export interface Transport {
	push(ops: Op[]): Promise<PushResult>;
	pull(since: number, limit: number): Promise<PullResult>;
}

/** The session is gone; the user has to sign in again. */
export class UnauthorizedError extends Error {}

/** Couldn't reach the server (or it failed); worth retrying later. */
export class NetworkError extends Error {}

export class HttpTransport implements Transport {
	push(ops: Op[]): Promise<PushResult> {
		return this.request("/api/sync/push", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ops }),
		});
	}

	pull(since: number, limit: number): Promise<PullResult> {
		return this.request(`/api/sync/pull?since=${since}&limit=${limit}`);
	}

	private async request<T>(url: string, init?: RequestInit): Promise<T> {
		let res: Response;
		try {
			res = await fetch(url, init);
		} catch (err) {
			throw new NetworkError(
				err instanceof Error ? err.message : "Network error",
			);
		}
		if (res.status === 401) throw new UnauthorizedError("Session expired");
		if (res.status >= 500 || res.status === 429)
			throw new NetworkError(`Server responded ${res.status}`);
		if (!res.ok) throw new Error(`Sync request failed with ${res.status}`);
		return res.json() as Promise<T>;
	}
}
