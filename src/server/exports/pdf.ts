import type { ProductFieldKey } from "@/types/import";
import type { ProductDraftData, ProductDraftValue } from "@/types/product";
import type { ExportIdentity } from "@/types/export";

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 52;
const contentWidth = pageWidth - margin * 2;
const bottomLimit = 82;

const infoFields: ProductFieldKey[] = [
  "category",
  "materials",
  "dimensions",
  "origin",
  "current_price",
  "desired_price",
  "cost_price",
  "target_margin",
  "sku",
  "image_url"
];

const labels: Record<ProductFieldKey, string> = {
  title: "Nom produit",
  subtitle: "Sous-titre",
  category: "Categorie",
  description: "Description",
  materials: "Matiere",
  dimensions: "Dimensions",
  origin: "Origine",
  current_price: "Prix actuel",
  desired_price: "Prix souhaite",
  cost_price: "Cout de revient",
  target_margin: "Marge cible",
  sku: "SKU",
  image_url: "Image URL",
  client_notes: "Notes client"
};

type PdfProduct = {
  id: string;
  validatedData: ProductDraftData;
};

type TextColor = "black" | "muted" | "soft";

function valueToString(value: ProductDraftValue | undefined): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

function toPdfText(value: string): string {
  return value
    .replace(/€/g, "EUR")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\u202f/g, " ");
}

function hexPdfString(value: string): string {
  const bytes = Array.from(toPdfText(value), (character) => {
    const code = character.charCodeAt(0);
    return code <= 255 ? code : 63;
  });

  return `<${Buffer.from(bytes).toString("hex").toUpperCase()}>`;
}

function wrapText(value: string, maxCharacters: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxCharacters && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function colorCommand(color: TextColor): string {
  if (color === "muted") {
    return "0.36 0.36 0.36 rg";
  }

  if (color === "soft") {
    return "0.62 0.62 0.62 rg";
  }

  return "0 0 0 rg";
}

function textCommand(input: {
  color?: TextColor;
  font: "F1" | "F2";
  size: number;
  text: string;
  x: number;
  y: number;
}): string {
  return [
    "BT",
    colorCommand(input.color ?? "black"),
    `/${input.font} ${input.size} Tf`,
    `1 0 0 1 ${input.x.toFixed(2)} ${input.y.toFixed(2)} Tm`,
    `${hexPdfString(input.text)} Tj`,
    "ET"
  ].join("\n");
}

function ruleCommand(y: number): string {
  return [
    "0.88 0.88 0.88 RG",
    "0.7 w",
    `${margin.toFixed(2)} ${y.toFixed(2)} m`,
    `${(pageWidth - margin).toFixed(2)} ${y.toFixed(2)} l S`
  ].join("\n");
}

function watermarkCommand(): string {
  return [
    "q",
    "0.94 0.94 0.94 rg",
    "BT",
    "/F2 34 Tf",
    "0.707 0.707 -0.707 0.707 210 360 Tm",
    `${hexPdfString("Fichr")} Tj`,
    "ET",
    "Q"
  ].join("\n");
}

function drawWrappedText(input: {
  color?: TextColor;
  commands: string[];
  font?: "F1" | "F2";
  maxCharacters: number;
  maxLines?: number;
  size: number;
  text: string;
  x: number;
  y: number;
}): { truncated: boolean; y: number } {
  let y = input.y;
  let truncated = false;
  const lines = wrapText(input.text, input.maxCharacters);
  const visibleLines = input.maxLines ? lines.slice(0, input.maxLines) : lines;

  if (visibleLines.length < lines.length) {
    truncated = true;
    const lastLine = visibleLines[visibleLines.length - 1] ?? "";
    visibleLines[visibleLines.length - 1] = `${lastLine.replace(/[.,;:]$/, "")}...`;
  }

  for (const line of visibleLines) {
    if (y < bottomLimit) {
      truncated = true;
      break;
    }

    input.commands.push(
      textCommand({
        color: input.color,
        font: input.font ?? "F1",
        size: input.size,
        text: line,
        x: input.x,
        y
      })
    );
    y -= input.size + 5;
  }

  return { truncated, y };
}

function drawSectionTitle(input: {
  commands: string[];
  title: string;
  y: number;
}): number {
  input.commands.push(ruleCommand(input.y + 14));
  input.commands.push(
    textCommand({
      font: "F2",
      size: 11,
      text: input.title,
      x: margin,
      y: input.y
    })
  );

  return input.y - 24;
}

function drawField(input: {
  commands: string[];
  label: string;
  maxCharacters?: number;
  maxLines?: number;
  value: string;
  width?: number;
  x: number;
  y: number;
}): { truncated: boolean; y: number } {
  input.commands.push(
    textCommand({
      color: "muted",
      font: "F2",
      size: 8,
      text: input.label,
      x: input.x,
      y: input.y
    })
  );

  return drawWrappedText({
    commands: input.commands,
    maxCharacters: input.maxCharacters ?? (input.width ? Math.floor(input.width / 5.2) : 74),
    maxLines: input.maxLines,
    size: 10,
    text: input.value,
    x: input.x,
    y: input.y - 14
  });
}

function drawInfoGrid(input: {
  commands: string[];
  data: ProductDraftData;
  y: number;
}): { truncated: boolean; y: number } {
  const rows = infoFields.flatMap((field) => {
    const value = valueToString(input.data[field]);
    return value ? [{ label: labels[field], value }] : [];
  });
  const columnGap = 26;
  const columnWidth = (contentWidth - columnGap) / 2;
  let y = input.y;
  let truncated = false;

  for (let index = 0; index < rows.length; index += 2) {
    if (y < bottomLimit + 40) {
      truncated = true;
      break;
    }

    const left = rows[index];
    const right = rows[index + 1];
    const leftResult = drawField({
      commands: input.commands,
      label: left.label,
      maxLines: 2,
      value: left.value,
      width: columnWidth,
      x: margin,
      y
    });
    let nextY = leftResult.y;
    truncated = truncated || leftResult.truncated;

    if (right) {
      const rightResult = drawField({
        commands: input.commands,
        label: right.label,
        maxLines: 2,
        value: right.value,
        width: columnWidth,
        x: margin + columnWidth + columnGap,
        y
      });
      nextY = Math.min(nextY, rightResult.y);
      truncated = truncated || rightResult.truncated;
    }

    y = nextY - 10;
  }

  return { truncated, y };
}

function renderProductPage(input: {
  identity: ExportIdentity;
  pageCount: number;
  pageNumber: number;
  product: PdfProduct;
}): string {
  const data = input.product.validatedData;
  const title = valueToString(data.title) || "Produit sans titre";
  const subtitle = valueToString(data.subtitle);
  const sku = valueToString(data.sku);
  const description = valueToString(data.description);
  const clientNotes = valueToString(data.client_notes);
  const exportDate = input.identity.generatedAt.slice(0, 10);
  const shortHash = input.identity.dataHash.slice(0, 12).toUpperCase();
  const commands: string[] = [
    watermarkCommand(),
    textCommand({
      font: "F2",
      size: 10,
      text: "Fichr",
      x: margin,
      y: pageHeight - 42
    }),
    textCommand({
      color: "muted",
      font: "F1",
      size: 8,
      text: input.identity.exportCode,
      x: margin + 74,
      y: pageHeight - 42
    }),
    textCommand({
      color: "muted",
      font: "F1",
      size: 9,
      text: `Page ${input.pageNumber} / ${input.pageCount}`,
      x: pageWidth - margin - 68,
      y: pageHeight - 42
    }),
    textCommand({
      color: "soft",
      font: "F1",
      size: 7,
      text: `${input.identity.workspaceName} - ${input.identity.exportScope} - ${input.identity.productCount} fiche(s)`,
      x: margin,
      y: pageHeight - 56
    }),
    ruleCommand(pageHeight - 68)
  ];
  let y = pageHeight - 102;
  let truncated = false;

  commands.push(
    textCommand({
      color: "muted",
      font: "F2",
      size: 9,
      text: "Fiche produit",
      x: margin,
      y
    })
  );
  y -= 28;

  const titleResult = drawWrappedText({
    commands,
    font: "F2",
    maxCharacters: 42,
    maxLines: 3,
    size: 24,
    text: title,
    x: margin,
    y
  });
  y = titleResult.y - 2;
  truncated = truncated || titleResult.truncated;

  if (subtitle) {
    const subtitleResult = drawWrappedText({
      color: "muted",
      commands,
      maxCharacters: 76,
      maxLines: 2,
      size: 12,
      text: subtitle,
      x: margin,
      y
    });
    y = subtitleResult.y - 6;
    truncated = truncated || subtitleResult.truncated;
  }

  commands.push(
    textCommand({
      color: "muted",
      font: "F2",
      size: 9,
      text: sku ? `Statut : Valide   SKU : ${sku}` : "Statut : Valide",
      x: margin,
      y
    })
  );
  y -= 34;

  if (description || clientNotes) {
    y = drawSectionTitle({ commands, title: "Description", y });

    if (description) {
      const descriptionResult = drawWrappedText({
        commands,
        maxCharacters: 94,
        maxLines: 10,
        size: 10,
        text: description,
        x: margin,
        y
      });
      y = descriptionResult.y - 10;
      truncated = truncated || descriptionResult.truncated;
    }

    if (clientNotes && y > bottomLimit + 42) {
      const notesResult = drawField({
        commands,
        label: labels.client_notes,
        maxCharacters: 90,
        maxLines: 4,
        value: clientNotes,
        x: margin,
        y
      });
      y = notesResult.y - 12;
      truncated = truncated || notesResult.truncated;
    }
  }

  if (y > bottomLimit + 70) {
    y = drawSectionTitle({ commands, title: "Informations produit", y });
    const infoResult = drawInfoGrid({ commands, data, y });
    y = infoResult.y;
    truncated = truncated || infoResult.truncated;
  }

  if (truncated && y > bottomLimit + 18) {
    commands.push(
      textCommand({
        color: "muted",
        font: "F1",
        size: 8,
        text: "Contenu abrege pour conserver une fiche lisible.",
        x: margin,
        y: Math.max(y - 4, bottomLimit)
      })
    );
  }

  commands.push(ruleCommand(62));
  commands.push(
    textCommand({
      color: "muted",
      font: "F1",
      size: 8,
      text: "Document généré par Fichr",
      x: margin,
      y: 42
    }),
    textCommand({
      color: "soft",
      font: "F1",
      size: 7,
      text: `${input.identity.exportCode} - ${shortHash} - ${exportDate}`,
      x: margin + 142,
      y: 42
    })
  );

  return commands.join("\n");
}

function createObject(id: number, content: string | Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`${id} 0 obj\n`),
    typeof content === "string" ? Buffer.from(content) : content,
    Buffer.from("\nendobj\n")
  ]);
}

export function renderPdfExport(
  products: PdfProduct[],
  identity?: ExportIdentity
): Buffer {
  const resolvedIdentity: ExportIdentity =
    identity ?? {
      dataHash: "",
      exportCode: "FICHR-EXPORT",
      exportScope: "catalog",
      exportType: "pdf",
      generatedAt: new Date().toISOString(),
      productCount: products.length,
      workspaceName: "Workspace Fichr"
    };
  const pageStreams = products.map((product, index) =>
    renderProductPage({
      identity: resolvedIdentity,
      pageCount: products.length,
      pageNumber: index + 1,
      product
    })
  );
  const pageObjectStart = 5;
  const contentObjectStart = pageObjectStart + pageStreams.length;
  const pageObjectIds = pageStreams.map((_, index) => pageObjectStart + index);
  const contentObjectIds = pageStreams.map(
    (_, index) => contentObjectStart + index
  );
  const infoObjectId = contentObjectStart + pageStreams.length;
  const objects: Buffer[] = [
    createObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    createObject(
      2,
      `<< /Type /Pages /Kids [${pageObjectIds
        .map((id) => `${id} 0 R`)
        .join(" ")}] /Count ${pageObjectIds.length} >>`
    ),
    createObject(
      3,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    ),
    createObject(
      4,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    )
  ];

  pageStreams.forEach((_, index) => {
    objects.push(
      createObject(
        pageObjectIds[index],
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`
      )
    );
  });

  pageStreams.forEach((stream, index) => {
    const streamBuffer = Buffer.from(stream);
    objects.push(
      createObject(
        contentObjectIds[index],
        Buffer.concat([
          Buffer.from(`<< /Length ${streamBuffer.length} >>\nstream\n`),
          streamBuffer,
          Buffer.from("\nendstream")
        ])
      )
    );
  });

  objects.push(
    createObject(
      infoObjectId,
      `<< /Title ${hexPdfString(`Export Fichr ${resolvedIdentity.exportCode}`)} /Author ${hexPdfString("Fichr")} /Subject ${hexPdfString(`Document généré par Fichr - ${resolvedIdentity.dataHash}`)} /Keywords ${hexPdfString("Généré avec Fichr")} /Creator ${hexPdfString("Fichr")} /Producer ${hexPdfString("Fichr")} >>`
    )
  );

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];
  let length = chunks[0].length;

  for (const object of objects) {
    offsets.push(length);
    chunks.push(object);
    length += object.length;
  }

  const xrefOffset = length;
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObjectId} 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    ""
  ].join("\n");

  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}
