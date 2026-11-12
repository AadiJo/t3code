import {
  BellIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleHelpIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { desktopNotificationTitles, type DesktopNotification } from "@t3tools/contracts";
import { useClientSettings } from "../../hooks/useSettings";
import {
  notificationBridge,
  updateDesktopNotifications,
  useDesktopNotifications,
} from "../../desktopNotifications";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";

const icons = {
  approval: ShieldAlertIcon,
  input: CircleHelpIcon,
  failed: CircleAlertIcon,
  completed: CheckIcon,
};
const colors = {
  approval: "text-warning-foreground",
  input: "text-info-foreground",
  failed: "text-destructive-foreground",
  completed: "text-success-foreground",
};

export function SidebarNotifications() {
  const items = useDesktopNotifications((state) => state.items);
  const enabled = useClientSettings((settings) => settings.notificationInboxEnabled);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();
  if (!enabled || !notificationBridge()) return null;
  const unread = items.filter((item) => !item.read);
  const visible = showAll ? items : unread;
  const report = () =>
    toastManager.add({ type: "error", title: "Could not mark notification as read" });
  const openThread = (item: DesktopNotification) => {
    setOpen(false);
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: item.environmentId, threadId: item.threadId },
    });
    void updateDesktopNotifications({ type: "read", ids: [item.id] }).catch(report);
  };
  return (
    <SidebarMenuItem className="shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <SidebarMenuButton
                    size="icon"
                    className="relative"
                    aria-label={unread.length ? "Notifications, unread items" : "Notifications"}
                  />
                }
              />
            }
          >
            <BellIcon aria-hidden="true" />
            {unread.length > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 size-1.5 rounded-full bg-destructive"
              />
            )}
          </TooltipTrigger>
          <TooltipPopup side="top">Notifications</TooltipPopup>
        </Tooltip>
        <PopoverPopup side="top" align="start" sideOffset={10} width="lg">
          <div className="mb-3 flex items-center justify-between gap-3">
            <PopoverTitle>Notifications</PopoverTitle>
            <button
              type="button"
              disabled={unread.length === 0}
              className="text-xs text-muted-foreground hover:text-popover-foreground disabled:opacity-40"
              onClick={() => {
                void updateDesktopNotifications({
                  type: "read",
                  ids: unread.map((item) => item.id),
                }).catch(report);
              }}
            >
              Mark all read
            </button>
          </div>
          <div className="flex gap-4 border-b border-border pb-2 text-xs">
            <button
              type="button"
              aria-pressed={!showAll}
              className={!showAll ? "text-popover-foreground" : "text-muted-foreground"}
              onClick={() => setShowAll(false)}
            >
              Unread{unread.length ? ` (${unread.length})` : ""}
            </button>
            <button
              type="button"
              aria-pressed={showAll}
              className={showAll ? "text-popover-foreground" : "text-muted-foreground"}
              onClick={() => setShowAll(true)}
            >
              All
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {visible.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {showAll ? "No notifications" : "No unread notifications"}
              </p>
            )}
            {visible.map((item) => {
              const Icon = icons[item.kind];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 border-b border-border last:border-0"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 gap-2 py-3 text-left hover:bg-accent hover:text-accent-foreground"
                    onClick={() => openThread(item)}
                  >
                    <Icon
                      aria-hidden="true"
                      className={`mt-0.5 size-4 shrink-0 ${colors[item.kind]}`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">{item.threadTitle}</span>
                      <span className="block text-xs text-muted-foreground">
                        {desktopNotificationTitles[item.kind]}
                        {item.resolved ? " · Resolved" : ""}
                      </span>
                      <span className="block truncate text-2xs text-muted-foreground">
                        {item.projectTitle} · {item.environmentTitle}
                      </span>
                    </span>
                  </button>
                  {!item.read && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            aria-label={`Mark ${item.threadTitle} as read`}
                            className="shrink-0 p-1 text-muted-foreground hover:text-popover-foreground"
                            onClick={() => {
                              void updateDesktopNotifications({
                                type: "read",
                                ids: [item.id],
                              }).catch(report);
                            }}
                          />
                        }
                      >
                        <CheckIcon className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipPopup>Mark as read</TooltipPopup>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        </PopoverPopup>
      </Popover>
    </SidebarMenuItem>
  );
}
