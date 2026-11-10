"use client";

// Editor teks kaya (rich text) — mendukung bold/italic, penomoran/bullet
// list, dan sisip gambar LANGSUNG di tengah teks (bukan lampiran terpisah).
// Dipakai di deskripsi tiket & pesan resolve.
//
// Berbasis TipTap (https://tiptap.dev) — editor headless yang ringan,
// hasil akhirnya disimpan sebagai string HTML (bukan format proprietary),
// jadi gampang ditampilkan lagi di halaman manapun cukup dengan render HTML.

import { useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { uploadInlineImage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        HTMLAttributes: { class: "rounded-md max-w-full my-2" },
      }),
      Placeholder.configure({
        placeholder: placeholder || "Tulis sesuatu...",
      }),
    ],
    content: value,
    immediatelyRender: false, // hindari mismatch SSR/hydration di Next.js
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "rich-content min-h-[120px] px-3.5 py-2.5 text-sm text-text-primary outline-none",
      },
    },
  });

  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset supaya bisa pilih file yang sama lagi nanti
    if (!file || !editor || !token) return;

    try {
      const { url } = await uploadInlineImage(token, file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch {
      // Kalau upload gagal, cukup diamkan — editor tetap bisa dipakai
      // untuk teks, user bisa coba sisip gambar lagi.
    }
  }

  // TipTap hanya memakai `content` sebagai nilai AWAL, tidak otomatis
  // sinkron kalau prop `value` berubah dari luar (misalnya form di-reset
  // ke string kosong setelah submit berhasil). Efek ini menutup celah itu —
  // tapi HANYA update kalau memang beda, supaya tidak bentrok dengan
  // perubahan yang berasal dari ketikan user sendiri (yang lewat onUpdate).
  //
  // Hook ini HARUS dipanggil sebelum early return manapun (aturan React:
  // hooks tidak boleh dipanggil bersyarat).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const toolbarBtn = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-accent/15 text-accent"
        : "text-text-muted hover:bg-border hover:text-text-primary"
    }`;

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card-hover focus-within:border-accent">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={toolbarBtn(editor.isActive("bold"))}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={toolbarBtn(editor.isActive("italic"))}
        >
          <em>I</em>
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={toolbarBtn(editor.isActive("bulletList"))}
        >
          • List
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={toolbarBtn(editor.isActive("orderedList"))}
        >
          1. List
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={toolbarBtn(false)}
        >
          🖼 Gambar
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelected}
          className="hidden"
        />
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
