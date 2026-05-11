"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Typography from "@tiptap/extension-typography"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Quote, Minus, Undo, Redo, ChevronDown,
} from "lucide-react"

interface Props {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
}

const FORMATS = [
  { label: "Paragraph", command: (editor: ReturnType<typeof useEditor>) => editor?.chain().focus().setParagraph().run() },
  { label: "Heading 1", command: (editor: ReturnType<typeof useEditor>) => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "Heading 2", command: (editor: ReturnType<typeof useEditor>) => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Heading 3", command: (editor: ReturnType<typeof useEditor>) => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: "Bullet list", command: (editor: ReturnType<typeof useEditor>) => editor?.chain().focus().toggleBulletList().run() },
  { label: "Ordered list", command: (editor: ReturnType<typeof useEditor>) => editor?.chain().focus().toggleOrderedList().run() },
  { label: "Quote", command: (editor: ReturnType<typeof useEditor>) => editor?.chain().focus().toggleBlockquote().run() },
  { label: "Code block", command: (editor: ReturnType<typeof useEditor>) => editor?.chain().focus().toggleCodeBlock().run() },
]

export function DocumentEditor({ content, onChange, placeholder = "Start writing…", className = "" }: Props) {
  const [formatOpen, setFormatOpen] = useState(false)
  const formatRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Typography,
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Sync external content changes
  const prevContent = useRef(content)
  useEffect(() => {
    if (editor && content !== prevContent.current && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false })
      prevContent.current = content
    }
  }, [content, editor])

  // Close format dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (formatRef.current && !formatRef.current.contains(e.target as Node)) setFormatOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [])

  const currentFormat = useMemo(() => {
    if (!editor) return "Paragraph"
    if (editor.isActive("heading", { level: 1 })) return "Heading 1"
    if (editor.isActive("heading", { level: 2 })) return "Heading 2"
    if (editor.isActive("heading", { level: 3 })) return "Heading 3"
    if (editor.isActive("bulletList")) return "Bullet list"
    if (editor.isActive("orderedList")) return "Ordered list"
    if (editor.isActive("blockquote")) return "Quote"
    if (editor.isActive("codeBlock")) return "Code block"
    return "Paragraph"
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state])

  const wordCount = useMemo(() => {
    if (!editor) return 0
    const text = editor.state.doc.textContent
    return text.trim() ? text.trim().split(/\s+/).length : 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state])

  if (!editor) return null

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b bg-muted/40 shrink-0">
        {/* Format dropdown */}
        <div ref={formatRef} className="relative mr-1">
          <button
            onClick={() => setFormatOpen((v) => !v)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {currentFormat}
            <ChevronDown className="h-3 w-3" />
          </button>
          {formatOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-xl py-1 w-36">
              {FORMATS.map((f) => (
                <button
                  key={f.label}
                  onClick={() => { f.command(editor); setFormatOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors ${
                    currentFormat === f.label ? "text-foreground font-medium" : "text-muted-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-border mx-0.5" />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline code">
          <Code className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <div className="w-px h-4 bg-border mx-0.5" />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Ordered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">
          <Quote className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false} title="Divider">
          <Minus className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <div className="w-px h-4 bg-border mx-0.5" />

        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} active={false} disabled={!editor.can().undo()} title="Undo">
          <Undo className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} active={false} disabled={!editor.can().redo()} title="Redo">
          <Redo className="h-3.5 w-3.5" />
        </ToolbarBtn>

        {/* Word count */}
        <span className="ml-auto text-[11px] text-muted-foreground/50 select-none">
          {wordCount} word{wordCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto px-6 py-5 prose prose-sm dark:prose-invert max-w-none focus-within:outline-none"
      />
    </div>
  )
}

function ToolbarBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-accent text-muted-foreground hover:text-foreground"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}
