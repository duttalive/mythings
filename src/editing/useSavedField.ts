import { useCallback, useEffect, useRef, useState } from "react";

const SAVE_DELAY_MS = 400;

/**
 * A text field that saves shortly after typing stops, on `flush()`, and when
 * it unmounts. While there are no unsaved edits it follows `value`, so
 * changes from other devices show up.
 */
export function useSavedField(value: string, save: (value: string) => void) {
	const [draft, setDraft] = useState(value);
	const dirty = useRef(false);
	const latest = useRef(value);
	const saveRef = useRef(save);
	saveRef.current = save;
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		if (!dirty.current) {
			setDraft(value);
			latest.current = value;
		}
	}, [value]);

	const flush = useCallback(() => {
		clearTimeout(timer.current);
		if (!dirty.current) return;
		dirty.current = false;
		saveRef.current(latest.current);
	}, []);

	const onChange = useCallback(
		(next: string) => {
			setDraft(next);
			latest.current = next;
			dirty.current = true;
			clearTimeout(timer.current);
			timer.current = setTimeout(flush, SAVE_DELAY_MS);
		},
		[flush],
	);

	useEffect(() => flush, [flush]);

	return { value: draft, onChange, flush };
}
