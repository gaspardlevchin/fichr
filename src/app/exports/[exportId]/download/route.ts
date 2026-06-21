import { getCatalogExportDownload } from "@/server/exports/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ exportId: string }> }
): Promise<Response> {
  const { exportId } = await params;

  try {
    const exportFile = await getCatalogExportDownload(exportId);

    return new Response(new Uint8Array(exportFile.content), {
      headers: {
        "Content-Disposition": `attachment; filename="${exportFile.filename}"`,
        "Content-Type": exportFile.contentType.startsWith("text/")
          ? `${exportFile.contentType}; charset=utf-8`
          : exportFile.contentType
      }
    });
  } catch {
    return new Response("Export introuvable.", { status: 404 });
  }
}
