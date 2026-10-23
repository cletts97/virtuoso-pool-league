export interface NewsletterPreview {
  previewKey: string;
  week: string;
  recipientCount: number;
  activeUserCount: number;
  enabled: boolean;
  alreadyQueued: boolean;
  subject: string;
  body: string;
  html: string;
  sampleRecipient: string;
}
