// Notification delivery is intentionally behind an interface so the MVP can run
// with zero external accounts. Swap ConsoleNotifier for a Resend/Twilio-backed
// implementation in production without touching the queue consumer.

import type { AlertJob } from './types';

export interface Notifier {
  send(job: AlertJob, to: string | null): Promise<void>;
}

/** Default MVP notifier — logs a legible, copy-pasteable alert. */
export class ConsoleNotifier implements Notifier {
  async send(job: AlertJob, to: string | null): Promise<void> {
    console.log(
      `[ALERT:${job.severity.toUpperCase()}] → ${to ?? 'unknown'} | ${job.entityType} ${job.entityId} due ${job.dueOn} | ${job.message}`,
    );
  }
}

// Example of a real implementation (left unwired so no key is required to run):
//
// export class ResendNotifier implements Notifier {
//   constructor(private apiKey: string, private from: string) {}
//   async send(job: AlertJob, to: string | null): Promise<void> {
//     if (!to) return;
//     await fetch('https://api.resend.com/emails', {
//       method: 'POST',
//       headers: { Authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
//       body: JSON.stringify({ from: this.from, to, subject: 'Frontline compliance alert', text: job.message }),
//     });
//   }
// }
