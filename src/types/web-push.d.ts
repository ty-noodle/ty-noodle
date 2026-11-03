declare module "web-push" {
  export type PushSubscription = {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };

  export type VapidKeys = {
    publicKey: string;
    privateKey: string;
  };

  export type SendNotificationOptions = {
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    topic?: string;
  };

  export type SendResult = {
    statusCode?: number;
    headers?: Record<string, string>;
    body?: string;
  };

  export function generateVAPIDKeys(): VapidKeys;
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer,
    options?: SendNotificationOptions,
  ): Promise<SendResult>;

  const webpush: {
    generateVAPIDKeys: typeof generateVAPIDKeys;
    setVapidDetails: typeof setVapidDetails;
    sendNotification: typeof sendNotification;
  };

  export default webpush;
}
