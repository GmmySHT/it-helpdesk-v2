package router

import (
	"net/http"
	"os"
	"path"
	"strings"
)

// Hanya ekstensi gambar yang pernah boleh diunggah yang akan dilayani.
// File lain (mis. .html/.svg dari upload lama sebelum ada validasi) dijawab 404.
var servedImageExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
}

// imageOnlyFS membungkus http.FileSystem: hanya melayani file gambar dan
// TIDAK PERNAH menampilkan daftar isi folder (http.FileServer bawaan akan
// menampilkan semua nama file di /uploads/).
type imageOnlyFS struct{ base http.FileSystem }

func (f imageOnlyFS) Open(name string) (http.File, error) {
	if !servedImageExts[strings.ToLower(path.Ext(name))] {
		return nil, os.ErrNotExist
	}
	file, err := f.base.Open(name)
	if err != nil {
		return nil, err
	}
	st, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}
	if st.IsDir() {
		file.Close()
		return nil, os.ErrNotExist
	}
	return file, nil
}

// uploadsHandler melayani /uploads/* dengan header yang mencegah file
// dieksekusi sebagai halaman web walaupun ada yang lolos ke folder ini.
// Nama file berupa UUID acak, jadi URL gambar tidak bisa ditebak — itu yang
// membuat gambar boleh diakses tanpa login (tag <img> tidak bisa mengirim token).
func uploadsHandler(dir string) http.Handler {
	fileServer := http.FileServer(imageOnlyFS{http.Dir(dir)})
	return http.StripPrefix("/uploads/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
		h.Set("Cache-Control", "public, max-age=86400")
		fileServer.ServeHTTP(w, r)
	}))
}
