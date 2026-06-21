import { getProductImageDownload } from "@/server/products/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> }
): Promise<Response> {
  const { productId } = await params;

  try {
    const image = await getProductImageDownload(productId);

    return new Response(new Uint8Array(image.content), {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Type": image.mimeType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new Response("Image introuvable.", { status: 404 });
  }
}
