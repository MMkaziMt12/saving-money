
// src/ai/flows/generate-notification-message.ts
'use server';

/**
 * @fileOverview AI-powered notification message generator for admins.
 *
 * This file defines a Genkit flow that allows admins to generate notification messages
 * for contribution reminders or emergency fund request updates.
 *
 * @module src/ai/flows/generate-notification-message
 *
 * @interface GenerateNotificationMessageInput - Defines the input for the notification message generation.
 * @interface GenerateNotificationMessageOutput - Defines the output of the notification message generation.
 * @function generateNotificationMessage - The main function to trigger the notification message generation flow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

/**
 * Input schema for the generateNotificationMessage flow.
 */
const GenerateNotificationMessageInputSchema = z.object({
  messageType: z
    .enum(['contributionReminder', 'emergencyRequestUpdate'])
    .describe('The type of notification message to generate.'),
  userName: z.string().optional().describe('The name of the user the notification is primarily about or for. Used for personalization.'),
  amount: z.number().optional().describe('The monetary amount relevant to the notification (e.g., contribution due, request amount).'),
  emergencyRequestDescription: z
    .string()
    .optional()
    .describe('A brief description or summary of the emergency request. Example: "request for medical bills" or "request ID #123 for urgent travel".'),
  status: z.string().optional().describe('The status of the item being notified about (e.g., for an emergency request: "approved", "rejected", "pending_information").'),
});

export type GenerateNotificationMessageInput = z.infer<
  typeof GenerateNotificationMessageInputSchema
>;

/**
 * Output schema for the generateNotificationMessage flow.
 */
const GenerateNotificationMessageOutputSchema = z.object({
  notificationMessage: z
    .string()
    .describe('The AI-generated notification message.'),
});

export type GenerateNotificationMessageOutput = z.infer<
  typeof GenerateNotificationMessageOutputSchema
>;

/**
 * Wrapper function to trigger the generateNotificationMessageFlow.
 * @param input - The input parameters for generating the notification message.
 * @returns A promise that resolves to the generated notification message.
 */
export async function generateNotificationMessage(
  input: GenerateNotificationMessageInput
): Promise<GenerateNotificationMessageOutput> {
  return generateNotificationMessageFlow(input);
}

const generateNotificationMessagePrompt = ai.definePrompt({
  name: 'generateNotificationMessagePrompt',
  input: {schema: GenerateNotificationMessageInputSchema},
  output: {schema: GenerateNotificationMessageOutputSchema},
  prompt: `You are an AI assistant specialized in generating concise and clear notification messages for a family fund application.

Based on the provided details, generate a suitable notification message.

Common Details:
- User Name (if applicable for personalization): {{{userName}}}

Message Type Specifics:

1. If 'messageType' is 'contributionReminder':
   - Remind the user to make their monthly contribution.
   - Include the amount due if provided: {{{amount}}}.
   - Example: "Hi {{{userName}}}, this is a friendly reminder that your monthly contribution of $USD{{{amount}}} is due. Thank you!"

2. If 'messageType' is 'emergencyRequestUpdate':
   - Inform the user about an update to their emergency request.
   - Use the 'emergencyRequestDescription' to refer to the specific request: "{{{emergencyRequestDescription}}}".
   - Clearly state the 'status' of the request: "{{{status}}}".
   - Example for approved: "Hi {{{userName}}}, good news! Your {{{emergencyRequestDescription}}} has been {{{status}}}."
   - Example for rejected: "Hi {{{userName}}}, we'd like to inform you that your {{{emergencyRequestDescription}}} has been {{{status}}}."
   - Example for more info needed: "Hi {{{userName}}}, regarding your {{{emergencyRequestDescription}}}, we need some more information. The status is currently {{{status}}}."

Generated Notification Message:`,
});

/**
 * Genkit flow for generating notification messages.
 */
const generateNotificationMessageFlow = ai.defineFlow(
  {
    name: 'generateNotificationMessageFlow',
    inputSchema: GenerateNotificationMessageInputSchema,
    outputSchema: GenerateNotificationMessageOutputSchema,
  },
  async input => {
    const {output} = await generateNotificationMessagePrompt(input);
    if (!output) {
      throw new Error('AI failed to generate a notification message.');
    }
    return output;
  }
);

