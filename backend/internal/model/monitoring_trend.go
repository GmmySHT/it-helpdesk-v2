package model

// TrendPoint adalah satu titik tren: pendapatan dan jumlah kunjungan pada
// satu bucket waktu. Format Bucket mengikuti Period.Fmt:
//
//	harian   -> "2026-09-30 14"  (per jam)
//	bulanan  -> "2026-09-30"     (per hari)
//	tahunan  -> "2026-09"        (per bulan)
//
// Frontend memakai awalan bucket ini untuk menyejajarkan periode terpilih
// dengan periode pembanding, jadi jangan ubah formatnya tanpa mengubah
// buildCompare di page.tsx.
type TrendPoint struct {
	Bucket  string  `json:"bucket"`
	Revenue float64 `json:"revenue"`
	Visits  int64   `json:"visits"`
}
