import {
  BillingWebhookAuthorizationError,
  processMollieWebhook
} from "@/server/billing/service";

export async function POST(request: Request): Promise<Response> {
  try {
    const result = await processMollieWebhook(request);
    return Response.json(result);
  } catch (error) {
    if (error instanceof BillingWebhookAuthorizationError) {
      return new Response("Non autorisé.", { status: 401 });
    }

    return new Response("Notification refusée.", { status: 400 });
  }
}
