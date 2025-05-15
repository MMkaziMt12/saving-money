"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlus, Send, Sparkles, Loader2, LinkIcon, ListFilter } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { generateNotificationMessage, type GenerateNotificationMessageInput } from "@/ai/flows/generate-notification-message";
import type { Profile, EmergencyRequest } from "@/types";
import { useState } from "react";
import { MONTHLY_CONTRIBUTION_AMOUNT, CURRENCY_SYMBOL } from "@/lib/constants";
import { format, parseISO } from "date-fns";

const notificationSchema = z.object({
  messageType: z.enum(["contributionReminder", "emergencyRequestUpdate", "general"]),
  targetUser: z.string().optional(),
  customSubject: z.string().optional(), 
  customMessage: z.string().min(1, "Message content cannot be empty."),
  link: z.string().url({ message: "Please enter a valid URL for the link (e.g., https://example.com)." }).optional().or(z.literal('')),
  userName: z.string().optional(), 
  amount: z.coerce.number().optional(), 
  selectedEmergencyRequestId: z.string().optional(), 
  emergencyRequestDescription: z.string().optional(), 
  status: z.string().optional(), 
});

export type NotificationFormValues = z.infer<typeof notificationSchema>;

interface NotificationSenderProps {
  users: Profile[];
  emergencyRequests?: EmergencyRequest[];
  onSend: (data: NotificationFormValues) => Promise<void>;
  isSending: boolean;
}

export function NotificationSender({ users, emergencyRequests, onSend, isSending }: NotificationSenderProps) {
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
  const selectedEmergencyRequestId = form.watch("selectedEmergencyRequestId"); // Watch this field

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
    } else if (values.messageType === "emergencyRequestUpdate" && values.selectedEmergencyRequestId) {
      const request = emergencyRequests?.find(r => r.id === values.selectedEmergencyRequestId);
      if (request) {
        const requestUser = users.find(u => u.id === request.user_id);
        if (requestUser) aiInput.userName = requestUser.full_name;
      }
    }
    
    if (values.messageType === "contributionReminder") {
        aiInput.amount = MONTHLY_CONTRIBUTION_AMOUNT;
    } else if (values.messageType === "emergencyRequestUpdate") {
        if (values.selectedEmergencyRequestId && emergencyRequests) {
            const selectedRequest = emergencyRequests.find(req => req.id === values.selectedEmergencyRequestId);
            if (selectedRequest) {
                 aiInput.emergencyRequestDescription = `request from ${users.find(u=>u.id === selectedRequest.user_id)?.full_name || 'user'} for '${selectedRequest.reason.substring(0,50)}...' (Amount: ${CURRENCY_SYMBOL}${selectedRequest.amount_requested})`;
                 aiInput.status = values.status || selectedRequest.status || "updated"; // Prioritize form status, then request status
            } else {
                 aiInput.emergencyRequestDescription = values.emergencyRequestDescription || "an emergency fund request";
                 aiInput.status = values.status || "updated";
            }
        } else {
             aiInput.emergencyRequestDescription = values.emergencyRequestDescription || "an emergency fund request";
             aiInput.status = values.status || "updated";
        }
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

  const getEmergencyRequestLabel = (request: EmergencyRequest): string => {
    const user = users.find(u => u.id === request.user_id);
    const userName = user?.full_name || 'Unknown User';
    const reasonPreview = request.reason.substring(0, 30);
    return `${userName} - ${reasonPreview}... (${CURRENCY_SYMBOL}${request.amount_requested}, ${request.status}, ${format(parseISO(request.requested_at), "MMM dd, yy")})`;
  };

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
            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="messageType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message Type</FormLabel>
                    <Select 
                        onValueChange={(value) => {
                            field.onChange(value);
                            form.setValue("selectedEmergencyRequestId", undefined); 
                            form.setValue("status", undefined); 
                        }} 
                        defaultValue={field.value} 
                        disabled={isGenerating || isSending}
                    >
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
                 <div className="space-y-6 pt-4 border-t mt-4">
                    <FormField
                        control={form.control}
                        name="selectedEmergencyRequestId"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-1"><ListFilter className="h-4 w-4 text-muted-foreground" />Select Emergency Request (for AI context & Link)</FormLabel>
                            <Select 
                                onValueChange={(value) => {
                                    field.onChange(value);
                                    const selectedReq = emergencyRequests?.find(r => r.id === value);
                                    if (selectedReq) {
                                        form.setValue("emergencyRequestDescription", `request from ${users.find(u=>u.id === selectedReq.user_id)?.full_name || 'user'} for '${selectedReq.reason.substring(0,50)}...' (Amount: ${CURRENCY_SYMBOL}${selectedReq.amount_requested})`);
                                        form.setValue("status", selectedReq.status || "updated"); 
                                        form.setValue("link", `https://${window.location.hostname}/requests/${selectedReq.id}`); // Auto-populate link
                                    } else {
                                        form.setValue("link", ""); // Clear link if no request selected
                                    }
                                }} 
                                value={field.value || ""}
                                disabled={isGenerating || isSending || !emergencyRequests || emergencyRequests.length === 0}
                            >
                                <FormControl><SelectTrigger><SelectValue placeholder={!emergencyRequests ? "Loading requests..." : "Select a request (optional)"} /></SelectTrigger></FormControl>
                                <SelectContent className="max-h-60">
                                    {emergencyRequests && emergencyRequests.length > 0 ? emergencyRequests.map(req => (
                                        <SelectItem key={req.id} value={req.id}>
                                            {getEmergencyRequestLabel(req)}
                                        </SelectItem>
                                    )) : (
                                        <SelectItem value="no_requests" disabled>No emergency requests available</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                            <FormDescription>This provides context for AI and auto-populates the link field below.</FormDescription>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status of Update (for AI context)</FormLabel>
                             <Select onValueChange={field.onChange} value={field.value || ""} disabled={isGenerating || isSending}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select status for AI message" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                    <SelectItem value="pending_information">Pending More Information</SelectItem>
                                    <SelectItem value="repaid">Repaid</SelectItem>
                                    <SelectItem value="partially_repaid">Partially Repaid</SelectItem>
                                    <SelectItem value="overdue">Overdue</SelectItem>
                                    <SelectItem value="updated">Updated</SelectItem>
                                    <SelectItem value="Fully Paid">Updated</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormDescription>Select the status you want the AI to reflect in its message.</FormDescription>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                 </div>
            )}
            
            <FormField
                control={form.control}
                name="customSubject"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Subject / Title (Optional)</FormLabel>
                    <FormControl><Input placeholder="e.g., Monthly Contribution Reminder" {...field} disabled={isGenerating || isSending} /></FormControl>
                    <FormDescription>This can act as a title or subject for your notification.</FormDescription>
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
                    <Input 
                      type="url" 
                      placeholder={selectedMessageType === 'emergencyRequestUpdate' && selectedEmergencyRequestId ? `e.g., /requests/${selectedEmergencyRequestId}` : "https://example.com/relevant-page"} 
                      {...field} 
                      disabled={isGenerating || isSending || (selectedMessageType === 'emergencyRequestUpdate' && !!selectedEmergencyRequestId)} // Disable if auto-populated
                    />
                  </FormControl>
                  <FormDescription>
                    {selectedMessageType === 'emergencyRequestUpdate' && selectedEmergencyRequestId 
                      ? "Auto-populated from selected request. Clear selection to edit manually." 
                      : "If provided, the notification can link to this URL."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedMessageType !== 'general' && (
                <Button type="button" variant="outline" onClick={handleGenerateMessage} disabled={isGenerating || isSending || (selectedMessageType === "emergencyRequestUpdate" && !emergencyRequests)} className="w-full sm:w-auto">
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

            <Button type="submit" className="w-full sm:w-auto" disabled={isGenerating || isSending || form.formState.isSubmitting}>
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
