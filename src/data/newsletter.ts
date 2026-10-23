export interface NewsletterPreview {
  previewKey: string;
  week: string;
  recipientCount: number;
  enabled: boolean;
  alreadyQueued: boolean;
  subject: string;
  body: string;
  html: string;
  sampleRecipient: string;
}
