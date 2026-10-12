package model

import "time"

type DashboardConfig struct {
	ID                     int       `json:"id"`
	DashboardName          string    `json:"dashboard_name"`
	IsPublic               bool      `json:"is_public"`
	ShowRevenueToPublic    bool      `json:"show_revenue_to_public"`
	AllowedRoles           []string  `json:"allowed_roles"`
	RefreshIntervalSeconds int       `json:"refresh_interval_seconds"`
	UpdatedAt              time.Time `json:"updated_at"`
}

type MonitoringStat struct {
	TotalRevenue    float64 `json:"total_revenue"`
	TotalVisits     int     `json:"total_visits"`
	TotalPaid       float64 `json:"total_paid"`
	TotalUnpaid     float64 `json:"total_unpaid"`
	TotalReceivable float64 `json:"total_receivable"`
}

type PatientStats struct {
	PenjaminNama  string  `json:"penjamin_nama"`
	KategoriBayar string  `json:"kategori_bayar"`
	Jumlah        int     `json:"jumlah"`
	Revenue       float64 `json:"revenue"`
}

type RoomStats struct {
	InstalasiNama string  `json:"instalasi_nama"`
	RuanganNama   string  `json:"ruangan_nama"`
	TotalTindakan int     `json:"total_tindakan"`
	TotalTarif    float64 `json:"total_tarif"`
}

type ComponentStats struct {
	KomponenNama  string  `json:"komponen_nama"`
	TotalKomponen float64 `json:"total_komponen"`
}

type PharmacySales struct {
	ObatNama    string  `json:"obat_nama"`
	Kategori    string  `json:"kategori"`
	QtyTerjual  float64 `json:"qty_terjual"`
	Revenue     float64 `json:"revenue"`
}

type DrugStock struct {
	ObatNama         string  `json:"obat_nama"`
	Kategori         string  `json:"kategori"`
	StokTersedia     float64 `json:"stok_tersedia"`
	StokKadaluarsa   float64 `json:"stok_kadaluarsa"`
	KadaluarsaTerdekat string `json:"kadaluarsa_terdekat"`
}

type PharmacyRoom struct {
	InstalasiNama string  `json:"instalasi_nama"`
	RuanganNama   string  `json:"ruangan_nama"`
	Kunjungan     int     `json:"kunjungan"`
	QtyObat       float64 `json:"qty_obat"`
	Revenue       float64 `json:"revenue"`
}

type PharmacySummary struct {
	TotalQty       float64 `json:"total_qty"`
	TotalRevenue   float64 `json:"total_revenue"`
	TotalHPP       float64 `json:"total_hpp"`
	TotalKunjungan int     `json:"total_kunjungan"`
	TotalRetur     float64 `json:"total_retur"`
	JumlahRetur    int     `json:"jumlah_retur"`
}
