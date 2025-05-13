
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlus, Send, Sparkles, Loader2 } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { generateNotificationMessage, type GenerateNotificationMessageInput } from "@/ai/flows/generate-notification-message";
import type { Profile } from "@/types";
import { useState } from "react";
import { CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";

const notificationSchema = z.object({
  messageType: z.enum(["contributionReminder", "emergencyRequestUpdate", "general"]),
  targetUser: z.string().optional(), // User ID or "all_pending_contribution", "all_users"
  customSubject: z.string().optional(), // For general messages
  customMessage: z.string().optional(), // For general messages, or to override AI
  // Fields for AI generation context
  userName: z.string().optional(),
  amount: z.coerce.number().optional(),
  emergencyRequestDescription: z.string().optional(),
  status: z.string().optional(), // e.g. approved, rejected for emergency requests
});

type NotificationFormValues = z.infer<typeof notificationSchema>;

interface NotificationSenderProps {
  users: Profile[]; // For selecting specific users or getting context
}

export function NotificationSender({ users }: NotificationSenderProps) {
  const { toast } = useToast();
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const form = useForm<NotificationFormValues>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      messageType: "contributionReminder",
    },
  });

  const selectedMessageType = form.watch("messageType");
  const selectedTargetUser = form.watch("targetUser");

  const handleGenerateMessage = async () => {
    const values = form.getValues();
    let aiInput: GenerateNotificationMessageInput = {
      messageType: values.messageType as "contributionReminder" | "emergencyRequestUpdate", 
      // Cast because 'general' is not for AI flow, but we ensure it's not passed.
    };

    if (values.targetUser && values.targetUser !== "all_pending_contribution" && values.targetUser !== "all_users") {
      const user = users.find(u => u.id === values.targetUser);
      if (user) aiInput.userName = user.full_name;
    }
    
    if (values.messageType === "contributionReminder") {
        aiInput.amount = MONTHLY_CONTRIBUTION_AMOUNT; // Assuming fixed amount for reminder
    } else if (values.messageType === "emergencyRequestUpdate") {
        // For emergency updates, these would typically come from a selected request
        aiInput.emergencyRequestDescription = values.emergencyRequestDescription || "an emergency fund request";
        aiInput.status = values.status || "updated";
    }


    if (values.messageType === "general") {
        setGeneratedMessage(values.customMessage || "Please write a custom message for general notifications.");
        return;
    }
    
    setIsGenerating(true);
    try {
      const result = await generateNotificationMessage(aiInput);
      setGeneratedMessage(result.notificationMessage);
      form.setValue("customMessage", result.notificationMessage); // Populate textarea
      toast({ title: "Message Generated", description: "AI has drafted a notification message." });
    } catch (error) {
      console.error("Error generating message:", error);
      toast({ title: "Generation Failed", description: "Could not generate message.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  async function onSubmit(data: NotificationFormValues) {
    setIsSending(true);
    const messageToSend = data.customMessage || generatedMessage;
    if (!messageToSend) {
        toast({title: "Error", description: "Message cannot be empty.", variant: "destructive"});
        setIsSending(false);
        return;
    }

    console.log("Sending Notification:", {
      type: data.messageType,
      target: data.targetUser || "Default Target",
      subject: data.customSubject,
      message: messageToSend,
    });
    // TODO: Implement actual notification sending logic (e.g., via Supabase Edge Functions, email service)
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    toast({
      title: "Notification Sent!",
      description: `Message has been dispatched.`,
    });
    form.reset();
    setGeneratedMessage("");
    setIsSending(false);
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="messageType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Select onValueChange={(value) => {
                        field.onChange(value);
                        if (value && value !== "all_pending_contribution" && value !== "all_users") {
                            const user = users.find(u => u.id === value);
                            form.setValue("userName", user?.full_name);
                        } else {
                            form.setValue("userName", "");
                        }
                    }} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select target" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all_users">All Users</SelectItem>
                        <SelectItem value="all_pending_contribution">Users with Pending Contributions</SelectItem>
                        {users.filter(u=>u.is_approved).map(user => (
                          <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
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
                            <FormControl><Input placeholder="e.g., John Doe's request for medical bills" {...field} /></FormControl>
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
                             <Select onValueChange={field.onChange} defaultValue={field.value}>
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
            
            {selectedMessageType === "general" && (
                 <FormField
                    control={form.control}
                    name="customSubject"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Subject (Optional)</FormLabel>
                        <FormControl><Input placeholder="e.g., Important Family Meeting" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
            )}

            {selectedMessageType !== 'general' && (
                <Button type="button" variant="outline" onClick={handleGenerateMessage} disabled={isGenerating} className="w-full md:w-auto">
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
                      value={generatedMessage || field.value || ""}
                      onChange={(e) => {
                          field.onChange(e);
                          setGeneratedMessage(e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full md:w-auto" disabled={isSending || (!form.getValues().customMessage && !generatedMessage)}>
              {isSending ? (
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
