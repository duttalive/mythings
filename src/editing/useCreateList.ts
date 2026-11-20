import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type { ViewData } from "../../shared/views";
import { bySortKey } from "../../shared/views";
import { useListData } from "../data";
import { useOps } from "../sync/hooks";
import { locationFromPath } from "./defaults";
import { useEditing } from "./EditingProvider";
import { newAreaFields, newBucketFields, newProjectFields } from "./projects";

/**
 * The Life Bucket a new area or project goes into: the one open on screen
 * (its own page, or one of its areas or projects), else the first one.
 */
export function bucketForPath(pathname: string, data: ViewData): string | null {
	const location = locationFromPath(pathname);
	const live = (id: string | null | undefined) =>
		data.buckets.find((b) => b.id === id && b.deletedAt === null)?.id;
	const fromPage =
		location.list === "bucket"
			? live(location.bucketId)
			: location.list === "area"
				? live(data.areas.find((a) => a.id === location.areaId)?.bucketId)
				: location.list === "project"
					? live(data.projects.find((p) => p.id === location.projectId)?.areaId)
					: undefined;
	return (
		fromPage ??
		data.buckets.filter((b) => b.deletedAt === null).sort(bySortKey)[0]?.id ??
		null
	);
}

/** Creates a project, area or Life Bucket, opens it, and puts the cursor in its title. */
export function useCreateList() {
	const ops = useOps();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const { data } = useListData();
	const { requestTitleFocus } = useEditing();
	const here = bucketForPath(pathname, data);

	const createProject = useCallback(
		async (bucketId?: string | null) => {
			const id = await ops.create(
				"project",
				newProjectFields(bucketId ?? here, data.projects),
			);
			requestTitleFocus(id);
			await navigate({ to: "/project/$projectId", params: { projectId: id } });
		},
		[ops, navigate, here, data.projects, requestTitleFocus],
	);

	const createArea = useCallback(
		async (bucketId?: string | null) => {
			const id = await ops.create(
				"area",
				newAreaFields(bucketId ?? here, data.areas),
			);
			requestTitleFocus(id);
			await navigate({ to: "/area/$areaId", params: { areaId: id } });
		},
		[ops, navigate, here, data.areas, requestTitleFocus],
	);

	const createBucket = useCallback(async () => {
		const id = await ops.create("area", newBucketFields(data.buckets));
		requestTitleFocus(id);
		await navigate({ to: "/bucket/$bucketId", params: { bucketId: id } });
	}, [ops, navigate, data.buckets, requestTitleFocus]);

	return { createProject, createArea, createBucket };
}
