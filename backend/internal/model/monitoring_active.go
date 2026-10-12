package model

// ActiveRoom: jumlah pasien yang saat ini masih berada di satu ruangan
// (menunggu, sedang diperiksa, atau sedang dirawat inap).
type ActiveRoom struct {
	InstalasiNama string `json:"instalasi_nama"`
	RuanganNama   string `json:"ruangan_nama"`
	Jumlah        int    `json:"jumlah"`
	Batal         int    `json:"batal"` // baru
}

// ActiveSummary adalah kondisi SAAT INI, tidak terikat periode yang dipilih.
type ActiveSummary struct {
	Total         int          `json:"total"`
	Antri         int          `json:"antri"`
	SedangPeriksa int          `json:"sedang_periksa"`
	SudahPulang   int          `json:"sudah_pulang"`
	RawatInap     int          `json:"rawat_inap"`
	Batal         int          `json:"batal"` // baru
	Rooms         []ActiveRoom `json:"rooms"`
}
