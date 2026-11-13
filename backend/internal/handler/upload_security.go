package handler

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

// Upload gambar hanya menerima tipe di bawah ini. Tipe ditentukan dari ISI
// file (http.DetectContentType membaca magic bytes), BUKAN dari nama file atau
// header Content-Type kiriman pengguna — keduanya bisa dipalsukan. SVG dan
// HTML sengaja tidak diizinkan karena bisa memuat script (stored XSS).
var allowedImageTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

// Dokumen serah-terima (scan/foto BAST yang sudah ditandatangani) boleh berupa
// gambar ATAU PDF — hasil scan dari mesin fotokopi biasanya PDF.
var allowedDocTypes = map[string]string{
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/webp":      ".webp",
	"application/pdf": ".pdf",
}

// maxImageBytes = batas ukuran satu gambar.
const maxImageBytes = 10 << 20 // 10 MB

// maxDocBytes lebih besar karena satu PDF scan bisa berisi beberapa halaman.
const maxDocBytes = 15 << 20 // 15 MB

var (
	ErrInvalidImage  = errors.New("file harus berupa gambar (JPG, PNG, GIF, atau WebP)")
	ErrImageTooLarge = errors.New("ukuran gambar maksimal 10 MB")

	ErrInvalidDoc  = errors.New("file harus berupa gambar (JPG/PNG/WebP) atau PDF")
	ErrDocTooLarge = errors.New("ukuran dokumen maksimal 15 MB")
)

// saveValidatedImage memvalidasi isi file lalu menyimpannya ke uploadDir
// dengan nama acak (UUID) dan ekstensi dari tipe yang TERDETEKSI. Mengembalikan
// URL relatif "/uploads/<nama>".
func saveValidatedImage(src io.Reader) (string, error) {
	url, _, err := saveValidatedFile(src, allowedImageTypes, maxImageBytes, ErrInvalidImage, ErrImageTooLarge)
	return url, err
}

// saveValidatedDoc sama seperti saveValidatedImage tetapi menerima PDF juga.
// Mengembalikan juga jenis file ("image" atau "pdf") untuk disimpan di DB.
func saveValidatedDoc(src io.Reader) (url string, fileType string, err error) {
	url, mime, err := saveValidatedFile(src, allowedDocTypes, maxDocBytes, ErrInvalidDoc, ErrDocTooLarge)
	if err != nil {
		return "", "", err
	}
	fileType = "image"
	if mime == "application/pdf" {
		fileType = "pdf"
	}
	return url, fileType, nil
}

// saveValidatedFile adalah inti dari kedua fungsi di atas: deteksi tipe dari
// magic bytes, simpan dengan nama acak, dan tolak file yang melebihi batas.
// Mengembalikan URL relatif dan MIME type yang terdeteksi.
func saveValidatedFile(
	src io.Reader,
	allowed map[string]string,
	maxBytes int64,
	errInvalid, errTooLarge error,
) (string, string, error) {
	head := make([]byte, 512)
	n, err := io.ReadFull(src, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return "", "", err
	}
	head = head[:n]

	mime := detectContentType(head)
	ext, ok := allowed[mime]
	if !ok {
		return "", "", errInvalid
	}

	if err := os.MkdirAll(uploadDir, 0o750); err != nil {
		return "", "", err
	}

	name := uuid.New().String() + ext
	destPath := filepath.Join(uploadDir, name)

	// O_EXCL: jangan pernah menimpa file yang sudah ada.
	dst, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return "", "", err
	}

	cleanup := func() {
		dst.Close()
		os.Remove(destPath)
	}

	if _, err := dst.Write(head); err != nil {
		cleanup()
		return "", "", err
	}
	// Baca sisa file, maksimal (batas - yang sudah dibaca) + 1 byte; kelebihan
	// 1 byte itu penanda bahwa file melebihi batas.
	remaining := maxBytes - int64(len(head))
	written, err := io.Copy(dst, io.LimitReader(src, remaining+1))
	if err != nil {
		cleanup()
		return "", "", err
	}
	if written > remaining {
		cleanup()
		return "", "", errTooLarge
	}
	if err := dst.Close(); err != nil {
		os.Remove(destPath)
		return "", "", fmt.Errorf("gagal menutup file: %w", err)
	}

	return "/uploads/" + name, mime, nil
}
