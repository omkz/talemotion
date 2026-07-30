import type { LucideIcon } from "lucide-react";
import { Clapperboard, FolderKanban, Images, Plus, Settings } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Assets", href: "/assets", icon: Images },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const NEW_VIDEO_ITEM: NavItem = {
  label: "New Video",
  href: "/projects/new",
  icon: Plus,
};

export const PRODUCT_NAME = "Talemotion";
export const PRODUCT_ICON = Clapperboard;
