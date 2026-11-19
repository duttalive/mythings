import { ulid } from "ulid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateDataKey, isEnvelope } from "../../shared/crypto/envelope";
import { plainFields } from "../../shared/crypto/fields";
import { deriveAccountKeys } from "../../shared/crypto/password";
import { isRecoveryKey, newRecoveryKey } from "../../src/crypto/account";
import {
	decryptRows,
	encryptForSync,
	resetCrypto,
	setEncrypted,
	setKey,
} from "../../src/crypto/session";
import { LocalDb } from "../../src/db/local";
import { InvalidMutation, SyncEngine } from "../../src/sync/engine";
import { FakeServer } from "./fake-server";

let db: LocalDb;
let server: FakeServer;
let engine: SyncEngine;
let required: number;

beforeEach(() => {
	db = new LocalDb(`test-${ulid()}`);
	server = new FakeServer();
	required = 0;
	engine = new SyncEngine(db, server, {
		encrypt: encryptForSync,
		onEncryptionRequired: () => required++,
	});
	resetCrypto();
});

afterEach(async () => {
	engine.stop();
	resetCrypto();
	await db.delete();
});

describe("an encrypted account", () => {
	it("keeps only ciphertext on the device and on the server", async () => {
		setEncrypted(true);
		setKey(await generateDataKey());
		const id = await engine.create("todo", {
			title: "Call the dentist",
			notes: "Ask about Friday",
		});
		const local = await db.todos.get(id);
		expect(isEnvelope(local?.title)).toBe(true);
		expect(isEnvelope(local?.notes)).toBe(true);
		const [entry] = await db.outbox.toArray();
		expect(JSON.stringify(entry)).not.toContain("dentist");

		await engine.sync();
		const stored = server.rows.get(`todo:${id}`)?.row as Record<
			string,
			unknown
		>;
		expect(plainFields("todo", stored)).toEqual([]);
		expect(JSON.stringify(stored)).not.toContain("dentist");

		const [shown] = await decryptRows("todo", [local as object]);
		expect(shown).toMatchObject({
			title: "Call the dentist",
			notes: "Ask about Friday",
		});
	});

	it("still checks plain-text limits", async () => {
		setEncrypted(true);
		setKey(await generateDataKey());
		await expect(
			engine.create("todo", { title: "x".repeat(1001) }),
		).rejects.toBeInstanceOf(InvalidMutation);
	});

	it("can't write text while this device is locked", async () => {
		setEncrypted(true);
		await expect(engine.create("todo", { title: "Secret" })).rejects.toThrow(
			"locked",
		);
		expect(await db.todos.count()).toBe(0);
	});

	it("keeps changes the server refused as plain text, and encrypts them once unlocked", async () => {
		// Written before this device knew encryption was on.
		const id = await engine.create("todo", { title: "Old plain" });
		server.reject = (op) =>
			op.kind === "upsert" &&
			typeof op.patch.title === "string" &&
			!isEnvelope(op.patch.title)
				? "encryption_required"
				: null;
		await engine.sync();
		expect(required).toBe(1);
		expect(await db.outbox.count()).toBe(1);
		expect(server.rows.has(`todo:${id}`)).toBe(false);

		setEncrypted(true);
		setKey(await generateDataKey());
		await engine.sync();
		expect(await db.outbox.count()).toBe(0);
		expect(isEnvelope(server.rows.get(`todo:${id}`)?.row.title)).toBe(true);
	});
});

describe("recovery keys", () => {
	it("are 32 letters and digits in groups, and forgive case and spacing", () => {
		for (let i = 0; i < 50; i++) {
			const key = newRecoveryKey();
			expect(key).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/);
			expect(isRecoveryKey(key)).toBe(true);
			expect(isRecoveryKey(key.toLowerCase().replaceAll("-", " "))).toBe(true);
		}
		expect(isRecoveryKey("not a key")).toBe(false);
	});
});

describe("password keys", () => {
	it("are the same on every device and differ per email", async () => {
		const a = await deriveAccountKeys("Ada@Example.com ", "pw-123456", 1000);
		const b = await deriveAccountKeys("ada@example.com", "pw-123456", 1000);
		const c = await deriveAccountKeys("bob@example.com", "pw-123456", 1000);
		expect(a.authKey).toBe(b.authKey);
		expect(a.authKey).not.toBe(c.authKey);
		expect(a.authKey).not.toContain("pw-123456");
	});
});
