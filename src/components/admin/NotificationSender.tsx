
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlus, Send, Sparkles, Loader2, LinkIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { generateNotificationMessage, type GenerateNotificationMessageInput } from "@/ai/flows/generate-notification-message";
import type { Profile } from "@/types";
import { useState } from "react";
import { MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";

const notificationSchema = z.object({
  messageType: z.enum(["contributionReminder", "emergencyRequestUpdate", "general"]),
  targetUser: z.string().optional(),
  customSubject: z.string().optional(),
  customMessage: z.string().min(1, "Message content cannot be empty."),
  link: z.string().url({ message: "Please enter a valid URL for the link (e.g., https://example.com)." }).optional().or(z.literal('')), // Optional, valid URL or empty string
  // Fields for AI generation context
  userName: z.string().optional(),
  amount: z.coerce.number().optional(),
  emergencyRequestDescription: z.string().optional(),
  status: z.string().optional(),
});

export type NotificationFormValues = z.infer<typeof notificationSchema>;

interface NotificationSenderProps {
  users: Profile[];
  onSend: (data: NotificationFormValues) => Promise<void>;
  isSending: boolean;
}

export function NotificationSender({ users, onSend, isSending }: NotificationSenderProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const form = useForm<NotificationFormValues>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      messageType: "general",
      customMessage: "",
      customSubject: "",
      link: "",
    },
  });

  const selectedMessageType = form.watch("messageType");

  const handleGenerateMessage = async () => {
    const values = form.getValues();
    if (values.messageType === "general") {
      toast({ title: "Info", description: "AI generation is not applicable for general announcements. Please write your message directly." });
      form.setValue("customMessage", values.customMessage || "");
      return;
    }
    if (values.messageType !== "contributionReminder" && values.messageType !== "emergencyRequestUpdate") {
      toast({ title: "Error", description: "Invalid message type for AI generation.", variant: "destructive" });
      return;
    }

    let aiInput: GenerateNotificationMessageInput = {
      messageType: values.messageType,
    };

    if (values.targetUser && values.targetUser !== "all_pending_contribution" && values.targetUser !== "all_users") {
      const user = users.find(u => u.id === values.targetUser);
      if (user) aiInput.userName = user.full_name;
    }
    
    if (values.messageType === "contributionReminder") {
        aiInput.amount = MONTHLY_CONTRIBUTION_AMOUNT;
    } else if (values.messageType === "emergencyRequestUpdate") {
        aiInput.emergencyRequestDescription = values.emergencyRequestDescription || "an emergency fund request";
        aiInput.status = values.status || "updated";
    }
    
    setIsGenerating(true);
    try {
      const result = await generateNotificationMessage(aiInput);
      form.setValue("customMessage", result.notificationMessage, { shouldValidate: true });
      toast({ title: "Message Generated", description: "AI has drafted a notification message." });
    } catch (error) {
      console.error("Error generating message:", error);
      toast({ title: "Generation Failed", description: (error as Error).message || "Could not generate message.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  async function internalFormSubmit(data: NotificationFormValues) {
    await onSend(data);
  }

  return (
    <Card className="shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <MessageSquarePlus /> Send Notification
        </CardTitle>
        <CardDescription>
          Craft and send notifications to family members. Use AI to help generate messages.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(internalFormSubmit)} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="messageType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isGenerating || isSending}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="contributionReminder">Contribution Reminder</SelectItem>
                        <SelectItem value="emergencyRequestUpdate">Emergency Request Update</SelectItem>
                        <SelectItem value="general">General Announcement</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetUser"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Audience</FormLabel>
                    <Select 
                      onValueChange={(value) => {
                          field.onChange(value);
                          if (value && value !== "all_pending_contribution" && value !== "all_users") {
                              const user = users.find(u => u.id === value);
                              form.setValue("userName", user?.full_name);
                          } else {
                              form.setValue("userName", "");
                          }
                      }} 
                      defaultValue={field.value}
                      disabled={isGenerating || isSending}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select target" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all_users">All Approved Users</SelectItem>
                        <SelectItem value="all_pending_contribution" disabled>Users with Pending Contributions (Soon)</SelectItem>
                        {users.filter(u=>u.is_approved).map(user => (
                          <SelectItem key={user.id} value={user.id}>{user.full_name} ({user.email})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {selectedMessageType === "emergencyRequestUpdate" && (
                 <>
                    <FormField
                        control={form.control}
                        name="emergencyRequestDescription"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Emergency Request Summary (for AI)</FormLabel>
                            <FormControl><Input placeholder="e.g., John Doe's request for medical bills" {...field} disabled={isGenerating || isSending} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Request Status (for AI)</FormLabel>
                             <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isGenerating || isSending}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                    <SelectItem value="more_info_needed">More Info Needed</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                 </>
            )}
            
            <FormField
                control={form.control}
                name="customSubject"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Subject / Title (Optional)</FormLabel>
                    <FormControl><Input placeholder="e.g., Important Family Meeting" {...field} disabled={isGenerating || isSending} /></FormControl>
                    <FormDescription>This can act as a title for your notification.</FormDescription>
                    <FormMessage />
                </FormItem>
                )}
            />
            
            <FormField
              control={form.control}
              name="link"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1"><LinkIcon className="h-4 w-4 text-muted-foreground" />Link (Optional)</FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://example.com/relevant-page" {...field} disabled={isGenerating || isSending} />
                  </FormControl>
                  <FormDescription>If provided, the notification can link to this URL.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedMessageType !== 'general' && (
                <Button type="button" variant="outline" onClick={handleGenerateMessage} disabled={isGenerating || isSending} className="w-full md:w-auto">
                {isGenerating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Sparkles className="mr-2 h-4 w-4 text-yellow-500" />
                )}
                Generate with AI
                </Button>
            )}

            <FormField
              control={form.control}
              name="customMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={ selectedMessageType === 'general' ? "Write your announcement here..." : "AI-generated message will appear here, or write your own."}
                      className="min-h-[150px]"
                      {...field}
                      disabled={isGenerating || isSending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full md:w-auto" disabled={isGenerating || isSending || form.formState.isSubmitting}>
              {isSending || form.formState.isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send Notification
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

    