import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useListData } from "../data";
import { useOps } from "../sync/hooks";
import { useEditing } from "./EditingProvider";
import { newAreaFields, newProjectFields } from "./projects";

/** Creates a project or area, opens it, and puts the cursor in its title. */
export function useCreateList() {
	const ops = useOps();
	const navigate = useNavigate();
	const { data } = useListData();
	const { requestTitleFocus } = useEditing();

	const createProject = useCallback(
		async (areaId: string | null) => {
			const id = await ops.create(
				"project",
				newProjectFields(areaId, data.projects),
			);
			requestTitleFocus(id);
			await navigate({ to: "/project/$projectId", params: { projectId: id } });
		},
		[ops, navigate, data.projects, requestTitleFocus],
	);

	const createArea = useCallback(async () => {
		const id = await ops.create("area", newAreaFields(data.areas));
		requestTitleFocus(id);
		await navigate({ to: "/area/$areaId", params: { areaId: id } });
	}, [ops, navigate, data.areas, requestTitleFocus]);

	return { createProject, createArea };
}
