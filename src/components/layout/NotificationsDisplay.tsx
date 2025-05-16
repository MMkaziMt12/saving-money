
"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Loader2, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNowStrict } from 'date-fns';
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const supabase = createClient();
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

async function fetchUserNotifications(userId: string | undefined): Promise<Notification[]> {
  if (!userId) {
    console.log("NotificationsDisplay: fetchUserNotifications called with no userId. Returning empty array.");
    return [];
  }
  console.log(`NotificationsDisplay: Fetching notifications for user ${userId}`);
  const { data, error } = await supabase
    .from("notifications")
    .select("id, message, created_at, read_at, link, type") // Optimized selection
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("NotificationsDisplay: Error fetching notifications:", JSON.stringify(error, null, 2));
    throw error;
  }
  console.log(`NotificationsDisplay: Notifications for user ${userId} fetched:`, data?.length || 0);
  return data || [];
}

async function markNotificationsAsRead(userId: string, notificationIds?: string[]): Promise<Pick<Notification, 'id' | 'read_at'>[]> { // Return minimal data
  if (!userId) {
    console.error("NotificationsDisplay: markAsReadMutation cannot run, user ID missing.");
    throw new Error("User ID missing");
  }
  console.log(`NotificationsDisplay: Marking notifications as read for user ${userId}. IDs:`, notificationIds || "all unread");
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (notificationIds && notificationIds.length > 0) {
    query = query.in("id", notificationIds);
  }

  const { data, error } = await query.select('id, read_at'); // Select only what's needed

  if (error) {
    console.error("NotificationsDisplay: Error marking notifications as read:", JSON.stringify(error, null, 2));
    throw error;
  }
  console.log("NotificationsDisplay: Notifications marked as read, server response:", data);
  return data || [];
}

export function NotificationsDisplay() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [localNotifications, setLocalNotifications] = useState<Notification[]>([]);

  const { 
    data: fetchedNotificationsData, 
    isLoading: isLoadingNotifications,
    isError: isNotificationsError,
    error: notificationsErrorObj,
    refetch: refetchNotifications
  } = useQuery<Notification[], Error>({
    queryKey: ["userNotifications", user?.id],
    queryFn: () => fetchUserNotifications(user?.id),
    enabled: !!user,
    refetchInterval: FIVE_MINUTES_IN_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    onSuccess: (data) => {
      console.log("NotificationsDisplay: useQuery onSuccess (initial/polled/refetched), data received:", data?.length || 0);
      setLocalNotifications(prevLocal => {
        const newNotificationsMap = new Map(data.map(n => [n.id, n]));
        const combined = [
          ...data, 
          ...prevLocal.filter(n => !newNotificationsMap.has(n.id)) 
        ];
        return combined.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20);
      });
    },
    onError: (error) => {
      console.error("NotificationsDisplay: useQuery onError fetching notifications:", error);
    }
  });

  useEffect(() => {
    if (fetchedNotificationsData) {
        console.log("NotificationsDisplay: useEffect detected change in fetchedNotificationsData, updating localNotifications state with fetched data length:", fetchedNotificationsData.length);
        setLocalNotifications(prevLocal => {
           const newNotificationsMap = new Map(fetchedNotificationsData.map(n => [n.id, n]));
            const combined = [
              ...fetchedNotificationsData,
              ...prevLocal.filter(n => !newNotificationsMap.has(n.id))
            ];
            return combined.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20);
        });
    }
  }, [fetchedNotificationsData]);

  useEffect(() => {
    if (!user?.id) {
        console.log("NotificationsDisplay: Realtime setup skipped, no user ID.");
        return;
    }

    console.log(`NotificationsDisplay: Setting up Realtime subscription for user ${user.id} on 'notifications' table.`);
    const channel = supabase
      .channel(`notifications-user-${user.id}`)
      .on<Notification>(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log("NotificationsDisplay: Realtime INSERT event received:", payload);
          const newNotification = payload.new as Notification;
          console.log("NotificationsDisplay: New notification data from Realtime:", newNotification);
          if (newNotification && typeof newNotification === 'object' && 'id' in newNotification) {
            setLocalNotifications(prev => {
              if (prev.some(n => n.id === newNotification.id)) {
                console.log("NotificationsDisplay: New notification from Realtime already exists in local state. Ignoring.", newNotification.id);
                return prev;
              }
              const newState = [newNotification, ...prev].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ).slice(0, 20);
              console.log("NotificationsDisplay: localNotifications state updated after Realtime INSERT:", newState.length);
              return newState;
            });
          } else {
            console.warn("NotificationsDisplay: Realtime INSERT event received, but payload.new is not a valid notification object:", newNotification);
          }
        }
      )
      .on<Notification>( 
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
             console.log("NotificationsDisplay: Realtime UPDATE event received:", payload);
             const updatedNotification = payload.new as Notification;
             console.log("NotificationsDisplay: Updated notification data from Realtime:", updatedNotification);
             if (updatedNotification && typeof updatedNotification === 'object' && 'id' in updatedNotification) {
                setLocalNotifications(prev => {
                    const newState = prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
                                     .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ).slice(0, 20);
                    console.log("NotificationsDisplay: localNotifications state updated after Realtime UPDATE:", newState.length);
                    return newState;
                });
             } else {
                console.warn("NotificationsDisplay: Realtime UPDATE event received, but payload.new is not a valid notification object:", updatedNotification);
             }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`NotificationsDisplay: Successfully SUBSCRIBED to notifications channel for user: ${user.id}`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`NotificationsDisplay: Realtime subscription error/timeout for user ${user.id}. Status: ${status}`, err);
        } else {
          console.log(`NotificationsDisplay: Realtime status changed for user ${user.id}: ${status}`);
        }
      });

    return () => {
      console.log(`NotificationsDisplay: Removing Realtime channel subscription for user ${user.id}`);
      supabase.removeChannel(channel).catch(err => console.error("NotificationsDisplay: Error removing channel", err));
    };
  }, [user?.id]);

  const markAsReadMutation = useMutation<Pick<Notification, 'id' | 'read_at'>[], Error, { notificationIds?: string[] }>({
    mutationFn: ({ notificationIds }) => {
        if (!user?.id) {
            console.error("NotificationsDisplay: markAsReadMutation cannot run, user ID missing.");
            throw new Error("User ID missing");
        }
        return markNotificationsAsRead(user.id, notificationIds);
    },
    onSuccess: (updatedDataFromServer) => {
      console.log("NotificationsDisplay: markAsReadMutation onSuccess, server response:", updatedDataFromServer);
      if (Array.isArray(updatedDataFromServer) && updatedDataFromServer.length > 0) {
        const updatedIds = updatedDataFromServer.map(n => n.id);
        setLocalNotifications(prev =>
          prev.map(n =>
            updatedIds.includes(n.id) ? { ...n, read_at: updatedDataFromServer.find(ud => ud.id === n.id)?.read_at || new Date().toISOString() } : n
          ).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20)
        );
      } else if (!updatedDataFromServer || (Array.isArray(updatedDataFromServer) && updatedDataFromServer.length === 0 && markAsReadMutation.latestVariables?.notificationIds === undefined) ) {
        setLocalNotifications(prev =>
          prev.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() })
          .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20)
        );
      }
      queryClient.invalidateQueries({ queryKey: ["userNotifications", user?.id] }); 
    },
    onError: (error) => {
      console.error("NotificationsDisplay: Failed to mark notifications as read:", error);
    },
  });

  const unreadNotifications = useMemo(() => {
    const filtered = localNotifications.filter(n => !n.read_at);
    console.log("NotificationsDisplay: Derived unreadNotifications:", filtered.length, "from localNotifications:", localNotifications.length);
    return filtered;
  }, [localNotifications]);

  const readNotifications = useMemo(() => {
    const filtered = localNotifications.filter(n => !!n.read_at);
    console.log("NotificationsDisplay: Derived readNotifications:", filtered.length, "from localNotifications:", localNotifications.length);
    return filtered;
  }, [localNotifications]);

  const handleMarkOneAsRead = useCallback((notificationId: string) => {
    const notification = localNotifications.find(n => n.id === notificationId);
    if (notification && !notification.read_at && user?.id) {
        console.log(`NotificationsDisplay: Handling mark one as read for ID: ${notificationId}`);
        markAsReadMutation.mutate({ notificationIds: [notificationId] });
    }
  }, [localNotifications, user?.id, markAsReadMutation]);

  const handleMarkAllAsRead = useCallback(() => {
    if (unreadNotifications.length > 0 && user?.id) {
      console.log("NotificationsDisplay: Handling mark all as read.");
      markAsReadMutation.mutate({}); 
    }
  }, [unreadNotifications.length, user?.id, markAsReadMutation]);

  if (!user) {
    console.log("NotificationsDisplay: No user, rendering null.");
    return null;
  }

  console.log("NotificationsDisplay: Rendering. isLoading:", isLoadingNotifications, "localNotifications:", localNotifications.length, "Error:", notificationsErrorObj?.message);

  const showInitialLoader = isLoadingNotifications && localNotifications.length === 0 && !isNotificationsError;

  return (
    <DropdownMenu>
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
          {showInitialLoader && <Loader2 className="h-4 w-4 animate-spin" />}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isNotificationsError && (
          <div className="p-4 text-center text-sm text-destructive">
            <AlertTriangle className="inline-block mr-2 h-4 w-4" />
            Error loading.
            <Button variant="link" size="sm" onClick={() => refetchNotifications()} className="block mx-auto mt-1">
                <RefreshCw className="mr-1 h-3 w-3" /> Retry
            </Button>
          </div>
        )}

        {(localNotifications.length === 0 && !showInitialLoader && !isNotificationsError) && (
          <DropdownMenuItem disabled className="text-center text-muted-foreground py-4">
            No new notifications
          </DropdownMenuItem>
        )}

        {(localNotifications.length > 0 || showInitialLoader ) && !isNotificationsError && (
          <ScrollArea className="h-[300px] sm:h-[400px]">
             {showInitialLoader && (
                <div className="flex justify-center items-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
             )}
            {localNotifications.length > 0 && (
                <>
                    {unreadNotifications.length > 0 && (
                        <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs text-muted-foreground px-2 pt-1 pb-0.5">Unread</DropdownMenuLabel>
                        {unreadNotifications.map((notification) => (
                            <NotificationItem key={notification.id} notification={notification} onMarkAsRead={handleMarkOneAsRead} />
                        ))}
                        </DropdownMenuGroup>
                    )}
                    {unreadNotifications.length > 0 && readNotifications.length > 0 && <DropdownMenuSeparator />}
                    {readNotifications.length > 0 && (
                        <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs text-muted-foreground px-2 pt-1 pb-0.5">Read</DropdownMenuLabel>
                        {readNotifications.map((notification) => (
                            <NotificationItem key={notification.id} notification={notification} />
                        ))}
                        </DropdownMenuGroup>
                    )}
                </>
            )}
          </ScrollArea>
        )}
        {unreadNotifications.length > 0 && !isNotificationsError && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleMarkAllAsRead}
              disabled={markAsReadMutation.isPending}
              className="cursor-pointer flex items-center justify-center data-[highlighted]:bg-muted/80"
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

const NotificationItem = React.memo(({ notification, onMarkAsRead }: NotificationItemProps) => {
    const timeAgo = formatDistanceToNowStrict(new Date(notification.created_at), { addSuffix: true });
    const isUnread = !notification.read_at;

    const itemBaseStyle = "flex flex-col items-start gap-1 p-2 rounded-sm w-full text-left relative";
    const unreadSpecificStyle = isUnread ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/50";


    const content = (
        <div className={cn(itemBaseStyle, unreadSpecificStyle, isUnread ? "pl-4" : "")}>
           {isUnread && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary"></span>}
            <p className={cn("text-sm leading-snug break-words", isUnread ? "font-semibold text-foreground" : "text-foreground")}>{notification.message}</p>
            <div className="flex justify-between w-full items-center">
                <span className={cn("text-xs", isUnread ? "text-primary/80" : "text-muted-foreground")}>{timeAgo}</span>
                {notification.link && (
                    <ExternalLink className={cn("h-3 w-3", isUnread ? "text-primary/70" : "text-muted-foreground")} />
                )}
            </div>
        </div>
    );

    const handleClickInternal = (e: React.MouseEvent<HTMLAnchorElement | HTMLDivElement>) => {
      if (isUnread && onMarkAsRead) {
          if (!notification.link || (notification.link && (notification.link.startsWith('#') || (typeof window !== 'undefined' && window.location.pathname === new URL(notification.link, window.location.origin).pathname)))) { 
              e.preventDefault();
              e.stopPropagation();
          }
          onMarkAsRead(notification.id);
      }
    };

    if (notification.link) {
        return (
            <DropdownMenuItem asChild className="p-0 cursor-pointer focus:bg-transparent data-[highlighted]:bg-transparent rounded-sm">
                <Link href={notification.link} onClick={handleClickInternal} className="w-full block" target={notification.link.startsWith('/') ? '_self' : '_blank'} rel="noopener noreferrer">
                    {content}
                </Link>
            </DropdownMenuItem>
        );
    }

    return (
        <DropdownMenuItem onClick={handleClickInternal} className={cn("p-0 cursor-pointer focus:bg-transparent data-[highlighted]:bg-transparent rounded-sm", isUnread ? "data-[highlighted]:bg-primary/10" : "data-[highlighted]:bg-muted/50")}>
            {content}
        </DropdownMenuItem>
    );
});
NotificationItem.displayName = "NotificationItem";

    