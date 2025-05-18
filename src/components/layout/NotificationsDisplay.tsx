
"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import type { Notification as AppNotification } from "@/types";
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
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fetchUserNotifications, markNotificationsAsRead, type NotificationForDisplay, type MarkedNotificationResult } from "@/lib/api/notifications";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

const supabase = createClient();
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_LOCAL_NOTIFICATIONS = 20; // Keep a manageable number of notifications locally

interface NotificationItemProps {
    notification: NotificationForDisplay;
    onMarkAsRead?: (notificationId: string) => void;
}

const NotificationItem = React.memo(({ notification, onMarkAsRead }: NotificationItemProps) => {
    const timeAgo = notification.created_at ? formatDistanceToNowStrict(parseISO(notification.created_at), { addSuffix: true }) : 'unknown time';
    const isUnread = !notification.read_at;

    const itemBaseStyle = "flex flex-col items-start gap-1 p-2 rounded-sm w-full text-left relative";
    const unreadSpecificStyle = isUnread ? "bg-primary/5 data-[highlighted]:bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/50 data-[highlighted]:bg-muted/50";

    const handleClickInternal = (e: React.MouseEvent<HTMLAnchorElement | HTMLDivElement>) => {
      if (isUnread && onMarkAsRead) {
          onMarkAsRead(notification.id);
          // If it's NOT a link, we might want to prevent dropdown from closing,
          // but DropdownMenuItem default behavior usually handles this.
          // If it IS a link, navigation will happen.
      }
      // If it's a link, we don't want to e.preventDefault() to allow navigation.
      // If it's not a link, default DropdownMenuItem behavior should be fine.
    };

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

    if (notification.link) {
        return (
            <DropdownMenuItem asChild className="p-0 cursor-pointer focus:bg-transparent data-[highlighted]:bg-transparent">
                <Link href={notification.link} onClick={handleClickInternal} className="w-full block" target={notification.link.startsWith('/') ? '_self' : '_blank'} rel="noopener noreferrer">
                    {content}
                </Link>
            </DropdownMenuItem>
        );
    }

    return (
        <DropdownMenuItem
            onSelect={(e) => { // Radix onSelect is better for non-navigation actions to prevent default close
                e.preventDefault(); // Prevent dropdown from closing immediately
                if (isUnread && onMarkAsRead) {
                    onMarkAsRead(notification.id);
                }
            }}
            className={cn("p-0 cursor-pointer focus:bg-transparent data-[highlighted]:bg-transparent",
                         isUnread ? "data-[highlighted]:!bg-primary/10" : "data-[highlighted]:!bg-muted/50"
            )}
        >
            {content}
        </DropdownMenuItem>
    );
});
NotificationItem.displayName = "NotificationItem";


export function NotificationsDisplay() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [localNotifications, setLocalNotifications] = useState<NotificationForDisplay[]>([]);

  const {
    data: fetchedNotificationsData,
    isLoading: isLoadingInitialNotifications,
    isError: isInitialNotificationsError,
    error: initialNotificationsErrorObj,
    refetch: refetchInitialNotifications
  } = useQuery<NotificationForDisplay[], Error>({
    queryKey: ["userNotifications", user?.id],
    queryFn: () => {
      if (!user?.id) {
        console.log("NotificationsDisplay: fetchUserNotifications skipped, no user ID for initial fetch.");
        return Promise.resolve([]);
      }
      console.log(`NotificationsDisplay: Fetching initial notifications for user ${user.id}`);
      return fetchUserNotifications(supabase, user.id);
    },
    enabled: !!user?.id,
    refetchInterval: FIVE_MINUTES_IN_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    onSuccess: (data) => {
      console.log("NotificationsDisplay: useQuery onSuccess (initial/polled/refetched), data received:", data?.length);
      if (Array.isArray(data)) {
        setLocalNotifications(prevLocal => {
          const newNotificationsMap = new Map(data.map(n => [n.id, n]));
          const combined = [
            ...data,
            ...prevLocal.filter(n => !newNotificationsMap.has(n.id))
          ];
          const sortedAndSliced = combined
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, MAX_LOCAL_NOTIFICATIONS);
          console.log("NotificationsDisplay: localNotifications updated from useQuery onSuccess, new length:", sortedAndSliced.length);
          return sortedAndSliced;
        });
      }
    },
    onError: (error) => {
      console.error("NotificationsDisplay: useQuery onError fetching notifications:", error);
    }
  });

  useEffect(() => {
    if (fetchedNotificationsData && Array.isArray(fetchedNotificationsData)) {
      console.log("NotificationsDisplay: useEffect detected change in fetchedNotificationsData, setting localNotifications state. Fetched data length:", fetchedNotificationsData.length);
      setLocalNotifications(prevLocal => {
        const newNotificationsMap = new Map(fetchedNotificationsData.map(n => [n.id, n]));
        const combined = [
          ...fetchedNotificationsData,
          ...prevLocal.filter(n => !newNotificationsMap.has(n.id))
        ];
        const sortedAndSliced = combined
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, MAX_LOCAL_NOTIFICATIONS);
        console.log("NotificationsDisplay: localNotifications updated from fetchedNotificationsData useEffect, new length:", sortedAndSliced.length);
        return sortedAndSliced;
      });
    }
  }, [fetchedNotificationsData]);


  useEffect(() => {
    if (!user?.id) {
      console.log("NotificationsDisplay: Realtime setup skipped, no user ID.");
      return;
    }

    console.log(`NotificationsDisplay: Attempting to set up Realtime subscription for user ${user.id} on 'notifications' table.`);
    
    let channel: RealtimeChannel | null = null;
    
    const handleRealtimeEvent = (payload: RealtimePostgresChangesPayload<NotificationForDisplay>) => {
      console.log("NotificationsDisplay: Realtime event received:", JSON.stringify(payload, null, 2));
      console.log("NotificationsDisplay: Realtime event type:", payload.eventType);

      if (payload.eventType === 'INSERT' && payload.new && typeof payload.new === 'object' && 'id' in payload.new && 'created_at' in payload.new) {
        const newNotification = payload.new as NotificationForDisplay;
        console.log("NotificationsDisplay: Realtime INSERT payload (typed):", newNotification);
        setLocalNotifications(prev => {
            if (prev.some(n => n.id === newNotification.id)) {
               console.log("NotificationsDisplay: New notification from Realtime (INSERT) already exists in local state. Ignoring.", newNotification.id);
               return prev;
            }
            const newState = [newNotification, ...prev];
            console.log("NotificationsDisplay: New notification from Realtime ADDED to local state.", newNotification.id);
            return newState
                .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, MAX_LOCAL_NOTIFICATIONS);
        });
      } else if (payload.eventType === 'UPDATE' && payload.new && typeof payload.new === 'object' && 'id' in payload.new && 'created_at' in payload.new) {
        const updatedNotification = payload.new as NotificationForDisplay;
        console.log("NotificationsDisplay: Realtime UPDATE payload (typed):", updatedNotification);
        setLocalNotifications(prev => {
            const existingIndex = prev.findIndex(n => n.id === updatedNotification.id);
            if (existingIndex !== -1) {
                const newState = [...prev];
                newState[existingIndex] = updatedNotification;
                console.log("NotificationsDisplay: Notification from Realtime UPDATED in local state.", updatedNotification.id);
                return newState
                    .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, MAX_LOCAL_NOTIFICATIONS);
            }
            return prev;
        });
      } else if (payload.eventType === 'DELETE' && payload.old && 'id' in payload.old) {
        const oldNotificationId = (payload.old as {id: string}).id;
        console.log("NotificationsDisplay: Realtime DELETE payload (ID):", oldNotificationId);
        setLocalNotifications(prev => 
          prev.filter(n => n.id !== oldNotificationId)
            .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, MAX_LOCAL_NOTIFICATIONS)
        );
      } else {
        console.warn("NotificationsDisplay: Realtime event received, but type not handled or payload structure unexpected:", payload);
      }
    };

    channel = supabase
      .channel(`realtime-notifications-for-user-${user.id}`)
      .on<NotificationForDisplay>(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        handleRealtimeEvent
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`NotificationsDisplay: Successfully SUBSCRIBED to channel 'realtime-notifications-for-user-${user.id}'.`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`NotificationsDisplay: Realtime subscription error/timeout for user ${user.id}. Channel: 'realtime-notifications-for-user-${user.id}'. Status: ${status}`, err);
        } else {
          console.log(`NotificationsDisplay: Realtime status changed for user ${user.id} on channel 'realtime-notifications-for-user-${user.id}': ${status}`);
        }
      });

    console.log(`NotificationsDisplay: Realtime channel object configured for user ${user.id}:`, channel);

    return () => {
      if (channel) {
        const channelToRemove = channel;
        console.log(`NotificationsDisplay: Removing Realtime channel subscription for user ${user.id} from channel: '${channelToRemove.topic}'`);
        supabase.removeChannel(channelToRemove)
          .then((status) => console.log(`NotificationsDisplay: Channel removal status for user ${user.id}: ${status}`))
          .catch(err => console.error(`NotificationsDisplay: Error removing channel for user ${user.id}`, err));
        channel = null;
      } else {
        console.log(`NotificationsDisplay: Cleanup called, but no active channel for user ${user.id} to remove.`);
      }
    };
  }, [user?.id]);

  const markAsReadMutation = useMutation<MarkedNotificationResult[], Error, { notificationIds?: string[] }>({
    mutationFn: ({ notificationIds }) => {
        if (!user?.id) {
            console.error("NotificationsDisplay: markAsReadMutation cannot run, user ID missing.");
            throw new Error("User ID missing");
        }
        return markNotificationsAsRead(supabase, user.id, notificationIds);
    },
    onSuccess: (updatedDataFromServer, variables) => {
      console.log("NotificationsDisplay: markAsReadMutation onSuccess, server response:", updatedDataFromServer);
      if (Array.isArray(updatedDataFromServer) && updatedDataFromServer.length > 0) {
        const updatedIdsMap = new Map(updatedDataFromServer.map(n => [n.id, n.read_at]));
        setLocalNotifications(prev =>
          prev.map(n =>
            updatedIdsMap.has(n.id) ? { ...n, read_at: updatedIdsMap.get(n.id) || new Date().toISOString() } : n
          ).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, MAX_LOCAL_NOTIFICATIONS)
        );
      } else if (!variables.notificationIds || variables.notificationIds.length === 0) { // If marking all
        setLocalNotifications(prev =>
          prev.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() })
          .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, MAX_LOCAL_NOTIFICATIONS)
        );
      }
      queryClient.invalidateQueries({ queryKey: ["userNotifications", user?.id] });
    },
    onError: (error) => {
      console.error("NotificationsDisplay: Failed to mark notifications as read:", error);
    },
  });

  const unreadNotifications = useMemo(() => {
    return localNotifications.filter(n => !n.read_at);
  }, [localNotifications]);

  const readNotifications = useMemo(() => {
    return localNotifications.filter(n => !!n.read_at);
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
    return null;
  }

  const showInitialLoader = isLoadingInitialNotifications && localNotifications.length === 0 && !isInitialNotificationsError;
  
  console.log("NotificationsDisplay: Rendering. isLoadingInitialNotifications:", isLoadingInitialNotifications, "localNotifications count:", localNotifications.length, "unread count:", unreadNotifications.length);
  console.log("NotificationsDisplay: Derived unreadNotifications:", unreadNotifications.map(n => n.id));
  console.log("NotificationsDisplay: Derived readNotifications:", readNotifications.map(n => n.id));


  return (
    // <DropdownMenu>
    //   <DropdownMenuTrigger asChild>
    //     <Button variant="ghost" size="icon" className="relative rounded-full text-muted-foreground hover:text-foreground">
    //       <Bell className="h-5 w-5" />
    //       {unreadNotifications.length > 0 && (
    //         <Badge
    //           variant="destructive"
    //           className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full"
    //         >
    //           {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
    //         </Badge>
    //       )}
    //       <span className="sr-only">Notifications</span>
    //     </Button>
    //   </DropdownMenuTrigger>
    //   <DropdownMenuContent align="end" className="w-80 sm:w-96">
    //     <DropdownMenuLabel className="flex justify-between items-center">
    //       <span>Notifications</span>
    //       {showInitialLoader && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
    //     </DropdownMenuLabel>
    //     <DropdownMenuSeparator />

    //     {isInitialNotificationsError && !showInitialLoader && (
    //       <div className="p-4 text-center text-sm text-destructive">
    //         <AlertTriangle className="inline-block mr-2 h-4 w-4" />
    //         Error loading.
    //         <Button variant="link" size="sm" onClick={() => refetchInitialNotifications()} className="block mx-auto mt-1">
    //             <RefreshCw className="mr-1 h-3 w-3" /> Retry
    //         </Button>
    //       </div>
    //     )}

    //     {(localNotifications.length === 0 && !showInitialLoader && !isInitialNotificationsError) && (
    //       <DropdownMenuItem disabled className="text-center text-muted-foreground py-4">
    //         No new notifications
    //       </DropdownMenuItem>
    //     )}

    //     {(localNotifications.length > 0 || showInitialLoader ) && !isInitialNotificationsError && (
    //       <ScrollArea className="h-[300px] sm:h-[400px]">
    //          {showInitialLoader && (
    //             <div className="flex justify-center items-center h-full">
    //                 <Loader2 className="h-6 w-6 animate-spin text-primary" />
    //             </div>
    //          )}
    //         {localNotifications.length > 0 && (
    //             <>
    //                 {unreadNotifications.length > 0 && (
    //                     <DropdownMenuGroup>
    //                     <DropdownMenuLabel className="text-xs text-muted-foreground px-2 pt-1 pb-0.5">Unread</DropdownMenuLabel>
    //                     {unreadNotifications.map((notification) => (
    //                         <NotificationItem key={notification.id} notification={notification} onMarkAsRead={handleMarkOneAsRead} />
    //                     ))}
    //                     </DropdownMenuGroup>
    //                 )}
    //                 {unreadNotifications.length > 0 && readNotifications.length > 0 && <DropdownMenuSeparator />}
    //                 {readNotifications.length > 0 && (
    //                     <DropdownMenuGroup>
    //                     <DropdownMenuLabel className="text-xs text-muted-foreground px-2 pt-1 pb-0.5">Read</DropdownMenuLabel>
    //                     {readNotifications.map((notification) => (
    //                         <NotificationItem key={notification.id} notification={notification} />
    //                     ))}
    //                     </DropdownMenuGroup>
    //                 )}
    //             </>
    //         )}
    //       </ScrollArea>
    //     )}
    //     {unreadNotifications.length > 0 && !isInitialNotificationsError && (
    //       <>
    //         <DropdownMenuSeparator />
    //         <DropdownMenuItem
    //           onSelect={(e) => { // Use onSelect for actions in DropdownMenuItem
    //             e.preventDefault(); // Prevent default behavior like closing the menu
    //             handleMarkAllAsRead();
    //           }}
    //           disabled={markAsReadMutation.isPending}
    //           className="cursor-pointer flex items-center justify-center data-[highlighted]:bg-muted/80"
    //         >
    //           {markAsReadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCheck className="mr-2 h-4 w-4" />}
    //           Mark all as read
    //         </DropdownMenuItem>
    //       </>
    //     )}
    //   </DropdownMenuContent>
    // </DropdownMenu>
  );
}
