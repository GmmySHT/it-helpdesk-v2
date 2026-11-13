"use client";

// Editor teks kaya (rich text) — mendukung bold/italic, penomoran/bullet
// list, dan sisip gambar LANGSUNG di tengah teks (bukan lampiran terpisah).
// Dipakai di deskripsi tiket & pesan resolve.
//
// Berbasis TipTap (https://tiptap.dev) — editor headless yang ringan,
// hasil akhirnya disimpan sebagai string HTML (bukan format proprietary),
// jadi gampang ditampilkan lagi di halaman manapun cukup dengan render HTML.
//
// PASTE DARI WORD:
// Word menempelkan HTML kotor (class MsoNormal, style mso-*, font face) dan
// gambar sebagai <img src="data:image/png;base64,...">. TipTap default hanya
// menerima <img> dengan src teks biasa — data URL tidak lolos validasi
// extension Image, dan gambar dari file:// juga tidak bisa dimuat browser.
// Karena itu paste di-intercept: gambar "diangkat" dulu ke server lewat
// /uploads/inline-image, baru HTML bersih disisipkan dengan URL server.

import { useRef, useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
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

// Tag & atribut yang dipertahankan setelah paste. Sisanya dibuang — Word
// menyertakan ratusan atribut mso-* yang tidak ada gunanya di sini dan
// membuat HTML tersimpan membengkak.
const ALLOWED_TAGS = new Set([
  "P", "BR", "DIV", "SPAN",
  "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "SUB", "SUP",
  "UL", "OL", "LI",
  "A", "IMG",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "BLOCKQUOTE", "PRE", "CODE",
  "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
  "HR",
]);

// Tag yang isinya harus ikut dibuang seluruhnya, bukan cuma tag-nya.
const DROP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "TITLE", "XML"]);

// Bangun ulang HTML bersih secara rekursif ke dokumen tujuan. Node tidak
// dipindah antar-dokumen (insertBefore lintas dokumen gagal), jadi setiap
// elemen yang dipertahankan dibuat baru.
function buildClean(src: Node, dest: Document): Node | null {
  if (src.nodeType === Node.TEXT_NODE) {
    return dest.createTextNode(src.nodeValue || "");
  }
  if (src.nodeType !== Node.ELEMENT_NODE) return null;

  const el = src as HTMLElement;
  if (DROP_TAGS.has(el.tagName)) return null;

  const children = Array.from(el.childNodes)
    .map((c) => buildClean(c, dest))
    .filter((n): n is Node => n !== null);

  // Elemen yang tidak dikenal (o:p, div class=WordSection1, span mso-*)
  // dibongkar: anak-anaknya naik satu level, tag pembungkusnya hilang.
  if (!ALLOWED_TAGS.has(el.tagName)) {
    const frag = dest.createDocumentFragment();
    children.forEach((c) => frag.appendChild(c));
    return frag;
  }

  if (el.tagName === "IMG") {
    const rawSrc = el.getAttribute("src") || "";
    // Gambar yang menunjuk file lokal Word (file:///C:/...) tidak bisa
    // dimuat browser, jadi diganti penanda teks supaya user tahu.
    if (/^file:/i.test(rawSrc)) {
      return dest.createTextNode(
        "[gambar Word tidak dapat dibaca — sisipkan lewat tombol Gambar]"
      );
    }
    if (!rawSrc) return null;
    const img = dest.createElement("img");
    img.setAttribute("src", rawSrc);
    const alt = el.getAttribute("alt");
    if (alt) img.setAttribute("alt", alt);
    return img;
  }

  if (el.tagName === "A") {
    const a = dest.createElement("a");
    const href = el.getAttribute("href") || "";
    // Buang javascript: dan link relatif kosong.
    if (/^https?:\/\//i.test(href)) {
      a.setAttribute("href", href);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer nofollow");
    }
    children.forEach((c) => a.appendChild(c));
    return a;
  }

  const outEl = dest.createElement(el.tagName.toLowerCase());
  children.forEach((c) => outEl.appendChild(c));
  // <br> tidak boleh punya anak.
  if (el.tagName === "BR") return dest.createElement("br");
  return outEl;
}

function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const dest = document.implementation.createHTMLDocument("");
  const container = dest.createElement("div");

  Array.from(doc.body.childNodes).forEach((child) => {
    const clean = buildClean(child, dest);
    if (clean) container.appendChild(clean);
  });

  return container.innerHTML;
}

// Ubah data URL (base64) jadi File supaya bisa diunggah lewat pipeline yang
// sama dengan tombol "Gambar" — validasi magic-byte di server tetap berlaku.
function dataUrlToFile(dataUrl: string, index: number): File | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime.split("/")[1].replace("jpeg", "jpg").split("+")[0];
  return new File([bytes], `temp-paste-${index}.${ext}`, { type: mime });
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Editor disimpan di ref supaya handler paste (dipasang sekali saat
  // useEditor dibuat) selalu melihat instance yang sama.
  const editorRef = useRef<Editor | null>(null);
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

  // Sisipkan file gambar (paste screenshot / Ctrl+V dari clipboard).
  async function insertImageFiles(files: File[]) {
    const ed = editorRef.current;
    const tok = tokenRef.current;
    if (!ed || !tok) return;
    for (const file of files) {
      try {
        const { url } = await uploadInlineImage(tok, file);
        ed.chain().focus().setImage({ src: url }).run();
      } catch {
        // Diamkan — editor tetap bisa dipakai untuk teks.
      }
    }
  }

  // Sisipkan HTML hasil paste: bersihkan markup Word, unggah gambar base64,
  // lalu ganti src-nya dengan URL server sebelum disisipkan ke editor.
  async function insertPastedHtml(rawHtml: string) {
    const ed = editorRef.current;
    const tok = tokenRef.current;
    if (!ed || !tok) return;

    const cleaned = cleanPastedHtml(rawHtml);
    const doc = new DOMParser().parseFromString(cleaned, "text/html");
    const images = Array.from(doc.querySelectorAll("img"));

    for (let i = 0; i < images.length; i++) {
      const src = images[i].getAttribute("src") || "";
      if (!src.startsWith("data:image/")) continue;
      const file = dataUrlToFile(src, i);
      if (!file) {
        images[i].remove();
        continue;
      }
      try {
        const { url } = await uploadInlineImage(tok, file);
        images[i].setAttribute("src", url);
      } catch {
        // Upload gagal (mis. terlalu besar) — ganti dengan penanda teks
        // supaya user tahu gambarnya tidak ikut, bukan hilang diam-diam.
        images[i].replaceWith(doc.createTextNode("[gambar gagal diunggah]"));
      }
    }

    ed.chain().focus().insertContent(doc.body.innerHTML).run();
  }

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
      // handlePaste harus mengembalikan true kalau paste ditangani sendiri,
      // false supaya TipTap memakai perilaku default (teks biasa).
      handlePaste: (_view, event) => {
        const clip = event.clipboardData;
        if (!clip) return false;

        // 1. Clipboard berisi file gambar (screenshot, copy image dari browser).
        const files = Array.from(clip.files || []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length > 0) {
          event.preventDefault();
          void insertImageFiles(files);
          return true;
        }

        // 2. Clipboard berisi HTML (Word, Google Docs, halaman web).
        const html = clip.getData("text/html");
        if (html) {
          const hasEmbeddedImage = /<img\b[^>]*src=["']data:image\//i.test(html);
          const isWord = /xmlns:(o|w|v|m)=|class=["']?Mso/i.test(html);
          if (hasEmbeddedImage || isWord) {
            event.preventDefault();
            void insertPastedHtml(html);
            return true;
          }
        }

        return false;
      },
    },
  });

  editorRef.current = editor;

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
