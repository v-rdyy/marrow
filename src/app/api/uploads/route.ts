import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const maxDuration = 60

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const folderId = formData.get("folderId") as string | null

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })
  if (file.type !== "application/pdf")
    return NextResponse.json({ error: "Only PDFs are supported" }, { status: 400 })
  if (file.size > 20 * 1024 * 1024)
    return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 })

  const supabase = createServiceClient()

  // Ensure the pdfs bucket exists (creates it if not)
  await supabase.storage.createBucket("pdfs", { public: true }).catch(() => {})

  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const bytes = await file.arrayBuffer()

  const { error: storageError } = await supabase.storage
    .from("pdfs")
    .upload(filename, bytes, { contentType: "application/pdf", upsert: false })

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from("pdfs").getPublicUrl(filename)

  const title = file.name.replace(/\.pdf$/i, "")

  // Store immediately — text extraction happens lazily when the AI first reads it
  const { data, error } = await supabase
    .from("documents")
    .insert({ title, content: "", folder_id: folderId ?? null, type: "pdf", file_url: urlData.publicUrl })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ document: { id: data.id, title: data.title, type: "pdf", fileUrl: urlData.publicUrl } })
}
