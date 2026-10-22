/** Provider boundary. Delivery runs after the result transaction commits. */
export interface EmailMessage {
  recipient: string;
  subject: string;
  text: string;
  html?: string;
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
export class ResendEmailDelivery implements EmailDelivery {
  private lastRequestAt = 0;
  constructor(
    private key: string,
    private from: string,
    private request: typeof fetch = fetch,
  ) {}
  async send(message: EmailMessage): Promise<void> {
    // Pace scheduled batches conservatively, below two requests per second.
    const wait = Math.max(0, this.lastRequestAt + 550 - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
    const response = await this.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.recipient],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    // Provider bodies can include addresses or request details; never forward or log them.
    if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  }
}
