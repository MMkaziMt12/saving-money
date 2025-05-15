
"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNowStrict } from 'date-fns';
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const supabase = createClient();

async function fetchUserNotifications(userId: string): Promise<Notification[]> {
  console.log(`NotificationsDisplay: Fetching initial notifications for user ${userId}`);
  if (!userId) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("NotificationsDisplay: Error fetching initial notifications:", error);
    throw new Error(error.message);
  }
  console.log(`NotificationsDisplay: Initial notifications for user ${userId} fetched:`, data);
  return data || [];
}

async function markNotificationsAsRead(userId: string, notificationIds?: string[]): Promise<any> {
  console.log(`NotificationsDisplay: Marking notifications as read for user ${userId}. IDs:`, notificationIds || "all unread");
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (notificationIds && notificationIds.length > 0) {
    query = query.in("id", notificationIds);
  }

  const { data, error } = await query.select();
  
  if (error) {
    console.error("NotificationsDisplay: Error marking notifications as read:", error);
    throw new Error(error.message);
  }
  console.log("NotificationsDisplay: Notifications marked as read, response:", data);
  return data;
}


export function NotificationsDisplay() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [localNotifications, setLocalNotifications] = useState<Notification[]>([]);

  const { data: initialNotifications, isLoading: isLoadingNotifications } = useQuery<Notification[], Error>({
    queryKey: ["userNotifications", user?.id],
    queryFn: () => fetchUserNotifications(user!.id),
    enabled: !!user,
    onSuccess: (data) => {
      console.log("NotificationsDisplay: onSuccess initial fetch, setting localNotifications:", data);
      setLocalNotifications(data);
    }
  });

  useEffect(() => {
    if (!user) return;

    console.log(`NotificationsDisplay: Setting up Realtime subscription for user ${user.id}`);
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log("NotificationsDisplay: Realtime INSERT event received:", payload);
          const newNotification = payload.new as Notification;
          console.log("NotificationsDisplay: New notification data from Realtime:", newNotification);
          setLocalNotifications(prev => {
            const newState = [newNotification, ...prev].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() );
            console.log("NotificationsDisplay: localNotifications state updated after INSERT:", newState);
            return newState;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
             console.log("NotificationsDisplay: Realtime UPDATE event received:", payload);
             const updatedNotification = payload.new as Notification;
             console.log("NotificationsDisplay: Updated notification data from Realtime:", updatedNotification);
             setLocalNotifications(prev => {
                const newState = prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
                                 .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() );
                console.log("NotificationsDisplay: localNotifications state updated after UPDATE:", newState);
                return newState;
             });
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`NotificationsDisplay: Successfully SUBSCRIBED to notifications channel for user: ${user.id}`);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`NotificationsDisplay: Realtime subscription error. Status: ${status}`, err);
        }
      });

    return () => {
      console.log(`NotificationsDisplay: Removing Realtime channel subscription for user ${user.id}`);
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const markAsReadMutation = useMutation<any, Error, { notificationIds?: string[] }>({
    mutationFn: ({ notificationIds }) => markNotificationsAsRead(user!.id, notificationIds),
    onSuccess: (updatedNotificationsData) => {
      console.log("NotificationsDisplay: markAsReadMutation onSuccess, server response:", updatedNotificationsData);
      if (Array.isArray(updatedNotificationsData)) {
          const updatedIds = updatedNotificationsData.map(n => n.id);
          setLocalNotifications(prev => {
            const newState = prev.map(n => updatedIds.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n);
            console.log("NotificationsDisplay: localNotifications state updated after marking as read (optimistic/from server):", newState);
            return newState;
          });
      }
       // Optionally, refetch to ensure full consistency, though optimistic update is often enough
       // queryClient.invalidateQueries({ queryKey: ["userNotifications", user?.id] });
    },
    onError: (error) => {
      console.error("NotificationsDisplay: Failed to mark notifications as read via mutation:", error);
    },
  });

  const unreadNotifications = useMemo(() => {
    return localNotifications.filter(n => !n.read_at);
  }, [localNotifications]);
  
  const readNotifications = useMemo(() => {
    return localNotifications.filter(n => !!n.read_at);
  }, [localNotifications]);


  const handleMarkOneAsRead = (notificationId: string) => {
    const notification = localNotifications.find(n => n.id === notificationId);
    if (notification && !notification.read_at) {
        console.log(`NotificationsDisplay: Handling mark one as read for ID: ${notificationId}`);
        markAsReadMutation.mutate({ notificationIds: [notificationId] });
    }
  };

  const handleMarkAllAsRead = () => {
    if (unreadNotifications.length > 0) {
      console.log("NotificationsDisplay: Handling mark all as read.");
      markAsReadMutation.mutate({});
    }
  };

  if (!user) return null;

  return (
    <DropdownMenu onOpenChange={(open) => {
      if (open && unreadNotifications.length > 0) {
        // Optionally mark notifications as read when the dropdown is opened
        // This is a UX choice. Some prefer explicit "mark as read".
        // console.log("NotificationsDisplay: Dropdown opened with unread notifications.");
        // handleMarkAllAsRead(); // Uncomment to mark as read on open
      }
    }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full">
          <Bell className="h-5 w-5" />
          {unreadNotifications.length > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full"
            >
              {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
            </Badge>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 sm:w-96">
        <DropdownMenuLabel className="flex justify-between items-center">
          <span>Notifications</span>
          {isLoadingNotifications && localNotifications.length === 0 && <Loader2 className="h-4 w-4 animate-spin" />}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {localNotifications.length === 0 && !isLoadingNotifications && (
          <DropdownMenuItem disabled className="text-center text-muted-foreground py-4">
            No new notifications
          </DropdownMenuItem>
        )}
        {(localNotifications.length > 0 || (isLoadingNotifications && localNotifications.length === 0) ) && (
          <ScrollArea className="h-[300px] sm:h-[400px]">
             {isLoadingNotifications && localNotifications.length === 0 && (
                <div className="flex justify-center items-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
             )}
            <DropdownMenuGroup>
              {unreadNotifications.map((notification) => (
                <NotificationItem key={notification.id} notification={notification} onMarkAsRead={handleMarkOneAsRead} />
              ))}
            </DropdownMenuGroup>
            {unreadNotifications.length > 0 && readNotifications.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              {readNotifications.map((notification) => (
                <NotificationItem key={notification.id} notification={notification} />
              ))}
            </DropdownMenuGroup>
          </ScrollArea>
        )}
        {unreadNotifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleMarkAllAsRead}
              disabled={markAsReadMutation.isPending}
              className="cursor-pointer flex items-center justify-center"
            >
              {markAsReadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCheck className="mr-2 h-4 w-4" />}
              Mark all as read
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


interface NotificationItemProps {
    notification: Notification;
    onMarkAsRead?: (notificationId: string) => void;
}

const NotificationItem = ({ notification, onMarkAsRead }: NotificationItemProps) => {
    const timeAgo = formatDistanceToNowStrict(new Date(notification.created_at), { addSuffix: true });
    const isUnread = !notification.read_at;

    const content = (
        <div className={cn("flex flex-col items-start gap-1 p-2 hover:bg-muted/50 rounded-sm w-full text-left", isUnread && "bg-primary/5")}>
           {isUnread && <span className="absolute left-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary"></span>}
            <p className={cn("text-sm leading-snug", isUnread && "font-semibold")}>{notification.message}</p>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>
    );

    const handleClickInternal = () => {
        if (isUnread && onMarkAsRead) {
            onMarkAsRead(notification.id);
        }
        // If there's a link, navigation will be handled by the Link component itself.
    };

    if (notification.link) {
        return (
            <DropdownMenuItem asChild className="p-0 cursor-pointer focus:bg-transparent data-[highlighted]:bg-muted/50">
                <Link href={notification.link} onClick={handleClickInternal} className="w-full block" target="_blank" rel="noopener noreferrer">
                    {content}
                </Link>
            </DropdownMenuItem>
        );
    }

    return (
        // Make the item itself clickable to mark as read if no link
        <DropdownMenuItem onClick={handleClickInternal} className="p-0 cursor-pointer focus:bg-transparent data-[highlighted]:bg-muted/50">
            {content}
        </DropdownMenuItem>
    );
};

