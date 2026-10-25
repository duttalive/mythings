// Small inline icons. Stroke icons inherit currentColor; size with className.

import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const SVG_DEFAULTS = {
	viewBox: "0 0 20 20",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.6,
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const;

/** Decorative (hidden from screen readers) unless given an aria-label, which makes it an announced image. */
function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
	const label = props["aria-label"];
	if (label) {
		return (
			<svg {...SVG_DEFAULTS} {...props} role="img" aria-label={label}>
				{children}
			</svg>
		);
	}
	return (
		<svg {...SVG_DEFAULTS} aria-hidden {...props}>
			{children}
		</svg>
	);
}

export const InboxIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M3 11.5 5 4h10l2 7.5V16H3z" />
		<path d="M3 11.5h4.5a2.5 2.5 0 0 0 5 0H17" />
	</Icon>
);

export const StarIcon = (p: IconProps) => (
	<Icon {...p}>
		<path
			fill="currentColor"
			d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z"
		/>
	</Icon>
);

export const MoonIcon = (p: IconProps) => (
	<Icon {...p}>
		<path
			fill="currentColor"
			d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5a6.5 6.5 0 1 0 8.1 8.1z"
		/>
	</Icon>
);

export const CalendarIcon = (p: IconProps) => (
	<Icon {...p}>
		<rect x="3" y="4.5" width="14" height="12.5" rx="2" />
		<path d="M3 8.5h14M7 2.8v3.2M13 2.8v3.2" />
	</Icon>
);

export const LayersIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="m10 3 7 3.8-7 3.8-7-3.8z" />
		<path d="m3 10.2 7 3.8 7-3.8M3 13.4l7 3.8 7-3.8" />
	</Icon>
);

export const BoxIcon = (p: IconProps) => (
	<Icon {...p}>
		<rect x="2.5" y="3.5" width="15" height="4" rx="1" />
		<path d="M4 7.5V16h12V7.5M8 10.5h4" />
	</Icon>
);

export const LogbookIcon = (p: IconProps) => (
	<Icon {...p}>
		<rect x="3.5" y="2.5" width="13" height="15" rx="2" />
		<path d="m7 10 2 2 4-4.5" />
	</Icon>
);

export const TrashIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M3.5 5.5h13M8 5.5V3.5h4v2M5 5.5l.8 11h8.4l.8-11" />
	</Icon>
);

export const AreaIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="m10 2.5 6.5 3.7v7.6L10 17.5l-6.5-3.7V6.2z" />
		<path d="m3.5 6.2 6.5 3.7 6.5-3.7M10 9.9v7.6" />
	</Icon>
);

export const TagIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M3 3h6.5l7.5 7.5-6.5 6.5L3 9.5z" />
		<circle cx="6.8" cy="6.8" r="1.1" fill="currentColor" />
	</Icon>
);

export const FlagIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M4.5 17.5V3M4.5 3.5h9.5l-2 3.5 2 3.5H4.5" />
	</Icon>
);

export const NotesIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M4 3.5h12v13H4zM7 7.5h6M7 10.5h6M7 13.5h3.5" />
	</Icon>
);

export const RepeatIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M4 9V7.5A2.5 2.5 0 0 1 6.5 5H15m0 0-2.5-2.5M15 5l-2.5 2.5" />
		<path d="M16 11v1.5a2.5 2.5 0 0 1-2.5 2.5H5m0 0 2.5 2.5M5 15l2.5-2.5" />
	</Icon>
);

export const ChecklistIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="m3.5 6 1.5 1.5 2.5-3M3.5 13l1.5 1.5 2.5-3M10.5 6h6M10.5 13h6" />
	</Icon>
);

export const CheckIcon = (p: IconProps) => (
	<Icon strokeWidth={2.4} {...p}>
		<path d="m5 10.5 3.2 3L15 6.5" />
	</Icon>
);

export const CrossIcon = (p: IconProps) => (
	<Icon strokeWidth={2.2} {...p}>
		<path d="m6 6 8 8M14 6l-8 8" />
	</Icon>
);

export const SidebarIcon = (p: IconProps) => (
	<Icon {...p}>
		<rect x="2.5" y="3.5" width="15" height="13" rx="2" />
		<path d="M8 3.5v13" />
	</Icon>
);

export const ChevronIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="m7.5 5 5 5-5 5" />
	</Icon>
);

export const PlusIcon = (p: IconProps) => (
	<Icon strokeWidth={2} {...p}>
		<path d="M10 4v12M4 10h12" />
	</Icon>
);

export const MoreIcon = (p: IconProps) => (
	<Icon {...p}>
		<circle cx="5" cy="10" r="0.9" fill="currentColor" />
		<circle cx="10" cy="10" r="0.9" fill="currentColor" />
		<circle cx="15" cy="10" r="0.9" fill="currentColor" />
	</Icon>
);

export const RestoreIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M4 9a6 6 0 1 1 1.8 4.3" />
		<path d="M4 4.5V9h4.5" />
	</Icon>
);

export const BellIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M5.5 13.5V9a4.5 4.5 0 0 1 9 0v4.5l1.5 1.5H4z" />
		<path d="M8.5 17.5a1.6 1.6 0 0 0 3 0" />
	</Icon>
);

export const CloudOffIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M6 15.5h8.5a3 3 0 0 0 .9-5.86A4.5 4.5 0 0 0 7.2 7.7" />
		<path d="M5.4 9.1A3.2 3.2 0 0 0 6 15.5" />
		<path d="m3 3 14 14" />
	</Icon>
);

export const GearIcon = (p: IconProps) => (
	<Icon {...p}>
		<circle cx="10" cy="10" r="2.5" />
		<path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
		<circle cx="10" cy="10" r="5.2" />
	</Icon>
);

export const SearchIcon = (p: IconProps) => (
	<Icon {...p}>
		<circle cx="8.75" cy="8.75" r="5.25" />
		<path d="m12.75 12.75 4 4" />
	</Icon>
);

export const EyeIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
		<circle cx="10" cy="10" r="2.5" />
	</Icon>
);

export const EyeOffIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M8.2 4.7A7.6 7.6 0 0 1 10 4.5c5 0 8 5.5 8 5.5a14 14 0 0 1-2.2 2.9M12.6 14.9a7.5 7.5 0 0 1-2.6.6c-5 0-8-5.5-8-5.5a14 14 0 0 1 3.2-3.7" />
		<path d="M8.3 8.3a2.5 2.5 0 0 0 3.4 3.4" />
		<path d="m3 3 14 14" />
	</Icon>
);
