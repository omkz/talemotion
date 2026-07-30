"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NAV_ITEMS, NEW_VIDEO_ITEM, PRODUCT_ICON, PRODUCT_NAME } from "./nav-items";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarContentProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarContent({ collapsed = false, onNavigate }: SidebarContentProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 px-4 py-5", collapsed && "justify-center px-2")}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <PRODUCT_ICON className="size-4.5" />
        </div>
        {!collapsed && (
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            {PRODUCT_NAME}
          </span>
        )}
      </div>

      <div className={cn("px-2.5 pb-3", collapsed && "flex justify-center px-0")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild size="icon-sm" aria-label={NEW_VIDEO_ITEM.label}>
                <Link href={NEW_VIDEO_ITEM.href} onClick={onNavigate}>
                  <NEW_VIDEO_ITEM.icon className="size-4.5" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{NEW_VIDEO_ITEM.label}</TooltipContent>
          </Tooltip>
        ) : (
          <Button asChild className="w-full justify-center">
            <Link href={NEW_VIDEO_ITEM.href} onClick={onNavigate}>
              <NEW_VIDEO_ITEM.icon className="size-4" />
              {NEW_VIDEO_ITEM.label}
            </Link>
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          const link = (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="size-4.5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return link;
        })}
      </nav>

      <div className={cn("border-t border-sidebar-border p-3", collapsed && "flex justify-center")}>
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-md p-1.5",
            !collapsed && "hover:bg-sidebar-accent/50"
          )}
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
            JD
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-medium text-sidebar-foreground">Jordan Diaz</p>
              <p className="truncate text-[11px] text-sidebar-foreground/50">Free workspace</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
