package handler

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

// UploadHandler menangani upload gambar generik yang disisipkan LANGSUNG
// ke dalam teks kaya (rich text) — beda dari upload lampiran resolve yang
// terpisah dari teks. Foldernya sama (./uploads) supaya bisa dilayani lewat
// static file server yang sudah ada.
type UploadHandler struct{}

func NewUploadHandler() *UploadHandler {
	return &UploadHandler{}
}

func (h *UploadHandler) UploadInlineImage(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(10 << 20); err != nil { // maks 10MB per gambar
		respondError(w, http.StatusBadRequest, "gagal membaca file, pastikan pakai multipart/form-data")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "field 'file' wajib diisi")
		return
	}
	defer file.Close()

	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menyiapkan folder upload")
		return
	}

	ext := filepath.Ext(header.Filename)
	newFileName := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	destPath := filepath.Join(uploadDir, newFileName)

	dst, err := os.Create(destPath)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menyimpan file")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menyimpan file")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"url": "/uploads/" + newFileName,
	})
}
