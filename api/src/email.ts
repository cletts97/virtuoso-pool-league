/** Future Azure Communication Services adapter boundary. Never call it in an HTTP transaction.
 * Add an approved durable outbox migration before enabling real delivery/retries. */
export interface EmailMessage {
  recipient: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}
export interface EmailDelivery {
  send(message: EmailMessage): Promise<void>;
}
export class DisabledEmailDelivery implements EmailDelivery {
  async send(): Promise<void> {
    throw new Error('League email delivery is disabled. In-app notifications remain available.');
  }
}
