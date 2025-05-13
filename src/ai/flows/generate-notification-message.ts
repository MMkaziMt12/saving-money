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
  userName: z.string().optional().describe('The name of the user to include in the message.'),
  amount: z.number().optional().describe('The amount related to the notification.'),
  emergencyRequestDescription: z
    .string()
    .optional()
    .describe('The description of the emergency request.'),
  status: z.string().optional().describe('The status of the emergency request'),
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
    .describe('The AI-generated notification message for admins.'),
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
  prompt: `You are an AI assistant specialized in generating notification messages for a family saving application.

    Based on the message type, generate a clear and effective notification message for the admin.

    If the message type is 'contributionReminder', remind the user to make their monthly contribution.
    Include the user's name and the amount due if provided.

    If the message type is 'emergencyRequestUpdate', inform the admin about the status update of an emergency request.
    Include the description of the emergency request and the current status if provided. Make sure to thank the admin for their work.

    Here are the details:
    Message Type: {{{messageType}}}
    User Name: {{{userName}}}
    Amount: {{{amount}}}
    Emergency Request Description: {{{emergencyRequestDescription}}}
    Status: {{{status}}}

    Notification Message:`,
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
    return output!;
  }
);
