import { describe, expect, it } from "vitest";
import {
	decryptText,
	encryptText,
	generateDataKey,
	importAesKey,
	isEnvelope,
	unwrapKey,
	wrapKey,
} from "../../shared/crypto/envelope";
import {
	decryptRow,
	encryptPatch,
	PlainTextTooLong,
	plainFields,
	UNREADABLE,
} from "../../shared/crypto/fields";
import { entities } from "../../shared/schema";
import { tag, todo } from "./fixtures";

const key = () => generateDataKey();

describe("envelopes", () => {
	it("round-trip text, including emoji and other scripts", async () => {
		const k = await key();
		for (const text of ["Buy milk", "", "日本語 ✓ 🎉", "x".repeat(5000)]) {
			const sealed = await encryptText(k, text, "todo.title");
			expect(isEnvelope(sealed)).toBe(true);
			expect(sealed).not.toContain(text || "never");
			expect(await decryptText(k, sealed, "todo.title")).toBe(text);
		}
	});

	it("use a fresh IV every time", async () => {
		const k = await key();
		const a = await encryptText(k, "same", "todo.title");
		const b = await encryptText(k, "same", "todo.title");
		expect(a).not.toBe(b);
	});

	it("fail with the wrong key or field", async () => {
		const sealed = await encryptText(await key(), "secret", "todo.title");
		await expect(
			decryptText(await key(), sealed, "todo.title"),
		).rejects.toThrow();
		const k = await key();
		const other = await encryptText(k, "secret", "todo.title");
		await expect(decryptText(k, other, "todo.notes")).rejects.toThrow();
	});

	it("wrap and unwrap a data key", async () => {
		const dk = await key();
		const raw = new Uint8Array(
			(await crypto.subtle.exportKey("raw", dk)) as ArrayBuffer,
		);
		const kek = await key();
		const wrapped = await wrapKey(raw, kek, "dk.password");
		expect(await unwrapKey(wrapped, kek, "dk.password")).toEqual(raw);
		await expect(unwrapKey(wrapped, kek, "dk.recovery")).rejects.toThrow();
		const imported = await importAesKey(raw);
		const sealed = await encryptText(dk, "hi", "a.title");
		expect(await decryptText(imported, sealed, "a.title")).toBe("hi");
	});

	it("doesn't take plain text that merely starts like one", () => {
		expect(isEnvelope("e1:hello")).toBe(false);
		expect(isEnvelope("Buy milk")).toBe(false);
	});
});

describe("encrypted rows", () => {
	it("encrypt only text fields and pass the schema at the plain-text limits", async () => {
		const k = await key();
		const patch = await encryptPatch(
			"todo",
			{ title: "字".repeat(1000), notes: "🎉".repeat(50_000), when: "anytime" },
			k,
		);
		expect(isEnvelope(patch.title)).toBe(true);
		expect(isEnvelope(patch.notes)).toBe(true);
		expect(patch.when).toBe("anytime");
		const row = { ...todo(), ...patch };
		expect(entities.todo.row.safeParse(row).success).toBe(true);
		expect(plainFields("todo", row)).toEqual([]);
		const back = await decryptRow("todo", row, k);
		expect(back.title).toBe("字".repeat(1000));
	});

	it("check plain-text limits before encrypting", async () => {
		const k = await key();
		await expect(
			encryptPatch("todo", { title: "x".repeat(1001) }, k),
		).rejects.toBeInstanceOf(PlainTextTooLong);
		await expect(
			encryptPatch("tag", { title: "x".repeat(101) }, k),
		).rejects.toBeInstanceOf(PlainTextTooLong);
	});

	it("trim tag titles and keep empty text empty", async () => {
		const k = await key();
		const patch = await encryptPatch("tag", { title: "  Work " }, k);
		expect(await decryptRow("tag", { ...tag(), ...patch }, k)).toMatchObject({
			title: "Work",
		});
		expect(await encryptPatch("todo", { notes: "" }, k)).toEqual({ notes: "" });
	});

	it("show a lock for text this device can't read", async () => {
		const patch = await encryptPatch("todo", { title: "secret" }, await key());
		const row = { ...todo(), ...patch };
		expect((await decryptRow("todo", row, null)).title).toBe(UNREADABLE);
		expect((await decryptRow("todo", row, await key())).title).toBe(UNREADABLE);
	});

	it("reuse the cache", async () => {
		const k = await key();
		const cache = new Map<string, string>();
		const row = {
			...todo(),
			...(await encryptPatch("todo", { title: "a" }, k)),
		};
		await decryptRow("todo", row, k, cache);
		expect(cache.size).toBe(1);
		expect((await decryptRow("todo", row, null, cache)).title).toBe("a");
	});
});
