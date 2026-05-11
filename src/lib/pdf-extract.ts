import Anthropic from "@anthropic-ai/sdk"

/**
 * Extract all text from a PDF using Claude's document API.
 * Works for both digital PDFs and scanned/image-based PDFs.
 * Returns plain text preserving document structure.
 */
export async function extractPdfText(pdfBytes: ArrayBuffer): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const base64 = Buffer.from(pdfBytes).toString("base64")

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          } as Anthropic.DocumentBlockParam,
          {
            type: "text",
            text: "Extract all text from this PDF document. Return only the raw text content, preserving the structure (headings, sections, numbered lists, bullet points, equations). Keep mathematical notation as-is. Do not summarize, interpret, or modify the content — just extract the text exactly as it appears in the document.",
          },
        ],
      },
    ],
  })

  return msg.content[0]?.type === "text" ? msg.content[0].text : ""
}
