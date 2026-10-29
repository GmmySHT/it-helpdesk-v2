package handler

import "net/http"

// detectContentType membungkus http.DetectContentType dan membuang parameter
// (mis. "; charset=utf-8") supaya cocok dengan kunci allowedImageTypes.
func detectContentType(head []byte) string {
	ct := http.DetectContentType(head)
	for i := 0; i < len(ct); i++ {
		if ct[i] == ';' {
			return ct[:i]
		}
	}
	return ct
}
