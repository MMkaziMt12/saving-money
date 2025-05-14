
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
  if (!userId) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20); // Fetch recent 20 notifications initially

  if (error) {
    console.error("Error fetching notifications:", error);
    throw new Error(error.message);
  }
  return data || [];
}

async function markNotificationsAsRead(userId: string, notificationIds?: string[]): Promise<any> {
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null); // Only update unread notifications

  if (notificationIds && notificationIds.length > 0) {
    query = query.in("id", notificationIds);
  }

  const { data, error } = await query.select(); // select() to get back updated rows
  
  if (error) {
    console.error("Error marking notifications as read:", error);
    throw new Error(error.message);
  }
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
      setLocalNotifications(data);
    }
  });

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log("New notification received via realtime:", payload.new);
          const newNotification = payload.new as Notification;
          setLocalNotifications(prev => [newNotification, ...prev].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ));
          // No need to invalidate query here if local state is updated directly and comprehensively.
          // If we wanted to ensure fresh data from DB always: queryClient.invalidateQueries({ queryKey: ["userNotifications", user?.id] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
             console.log("Notification updated via realtime:", payload.new);
             const updatedNotification = payload.new as Notification;
             setLocalNotifications(prev => 
                prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
                .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() )
             );
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to notifications channel for user:', user.id);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime subscription error:', status, err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const markAsReadMutation = useMutation<any, Error, { notificationIds?: string[] }>({
    mutationFn: ({ notificationIds }) => markNotificationsAsRead(user!.id, notificationIds),
    onSuccess: (updatedNotificationsData) => {
      // Optimistically update local state or refetch
      // queryClient.invalidateQueries({ queryKey: ["userNotifications", user?.id] });
      // For a more responsive UI, update local state directly
      if (Array.isArray(updatedNotificationsData)) {
          const updatedIds = updatedNotificationsData.map(n => n.id);
          setLocalNotifications(prev => 
            prev.map(n => updatedIds.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)
          );
      }
    },
    onError: (error) => {
      console.error("Failed to mark notifications as read:", error);
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
        markAsReadMutation.mutate({ notificationIds: [notificationId] });
    }
  };

  const handleMarkAllAsRead = () => {
    if (unreadNotifications.length > 0) {
      markAsReadMutation.mutate({}); // No specific IDs means mark all unread for the user
    }
  };

  if (!user) return null;

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
          {isLoadingNotifications && <Loader2 className="h-4 w-4 animate-spin" />}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {localNotifications.length === 0 && !isLoadingNotifications && (
          <DropdownMenuItem disabled className="text-center text-muted-foreground py-4">
            No new notifications
          </DropdownMenuItem>
        )}
        {(localNotifications.length > 0 || isLoadingNotifications) && (
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
        <div className={cn("flex flex-col items-start gap-1 p-2 hover:bg-muted/50 rounded-sm", isUnread && "bg-primary/5 font-medium")}>
            <p className="text-sm leading-snug">{notification.message}</p>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>
    );

    const handleClick = () => {
        if (isUnread && onMarkAsRead) {
            onMarkAsRead(notification.id);
        }
    };

    if (notification.link) {
        return (
            <DropdownMenuItem asChild className="p-0 cursor-pointer">
                <Link href={notification.link} onClick={handleClick} className="w-full">
                    {content}
                </Link>
            </DropdownMenuItem>
        );
    }

    return (
        <DropdownMenuItem onClick={handleClick} className="p-0 cursor-pointer focus:bg-transparent data-[highlighted]:bg-muted/50">
            {content}
        </DropdownMenuItem>
    );
};

