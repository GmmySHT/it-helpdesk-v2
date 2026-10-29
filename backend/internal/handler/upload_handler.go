package handler

import (
	"errors"
	"net/http"
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
		respondError(w, http.StatusBadRequest, "gagal membaca file, pastikan pakai multipart/form-data (maksimal 10 MB)")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "field 'file' wajib diisi")
		return
	}
	defer file.Close()

	// Isi file divalidasi (harus gambar sungguhan) dan nama file dibuat acak
	// dengan ekstensi dari tipe yang terdeteksi — lihat saveValidatedImage.
	url, err := saveValidatedImage(file)
	if err != nil {
		if errors.Is(err, ErrInvalidImage) || errors.Is(err, ErrImageTooLarge) {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		respondInternal(w, err, "gagal menyimpan file")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"url": url})
}
