package repository

import (
	"context"
	"time"

	"ticketing-it/backend/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

type MonitoringRepository struct {
	db      *pgxpool.Pool
	simrsDB *pgxpool.Pool
}

func NewMonitoringRepository(db *pgxpool.Pool, simrsDB *pgxpool.Pool) *MonitoringRepository {
	return &MonitoringRepository{db: db, simrsDB: simrsDB}
}

func (r *MonitoringRepository) GetConfig(ctx context.Context, name string) (*model.DashboardConfig, error) {
	var conf model.DashboardConfig
	query := "SELECT id, dashboard_name, is_public, show_revenue_to_public, allowed_roles, refresh_interval_seconds FROM dashboard_configs WHERE dashboard_name = $1"
	err := r.db.QueryRow(ctx, query, name).Scan(
		&conf.ID, &conf.DashboardName, &conf.IsPublic, &conf.ShowRevenueToPublic, &conf.AllowedRoles, &conf.RefreshIntervalSeconds,
	)
	return &conf, err
}

func (r *MonitoringRepository) GetRealtimeStats(ctx context.Context, per model.Period) (*model.MonitoringStat, error) {
	if r.simrsDB == nil {
		return &model.MonitoringStat{
			TotalRevenue: 158250000, TotalVisits: 428, TotalPaid: 142050000, TotalUnpaid: 3450000, TotalReceivable: 12750000,
		}, nil
	}
	// Revenue dari pembayaranpelayanan_t (tglpembayaran) + Kunjungan dari pendaftaran_t (tgl_pendaftaran)
	query := `
		SELECT 
			COALESCE(SUM(pp.totalbiayapelayanan), 0),
			(SELECT COUNT(*) FROM pendaftaran_t p WHERE p.tgl_pendaftaran >= $1 AND p.tgl_pendaftaran < $2),
			COALESCE(SUM(CASE WHEN pp.statusbayar = 'LUNAS' THEN pp.totalbayartindakan ELSE 0 END), 0),
			COALESCE(SUM(pp.totalsisatagihan), 0),
			COALESCE(SUM(pp.totalsubsidiasuransi + pp.totalsubsidipemerintah), 0)
		FROM pembayaranpelayanan_t pp
		WHERE pp.tglpembayaran >= $1 AND pp.tglpembayaran < $2`
	var s model.MonitoringStat
	err := r.simrsDB.QueryRow(ctx, query, per.From, per.To).Scan(&s.TotalRevenue, &s.TotalVisits, &s.TotalPaid, &s.TotalUnpaid, &s.TotalReceivable)
	return &s, err
}

func (r *MonitoringRepository) GetPatientStats(ctx context.Context, per model.Period) ([]model.PatientStats, error) {
	if r.simrsDB == nil {
		return []model.PatientStats{{PenjaminNama: "BPJS Kesehatan", KategoriBayar: "BPJS", Jumlah: 245, Revenue: 125000000}}, nil
	}
	query := `SELECT pm.penjamin_nama, cm.carabayar_nama, COUNT(p.pendaftaran_id), COALESCE(SUM(pp.totalbiayapelayanan), 0) FROM pendaftaran_t p JOIN penjaminpasien_m pm ON p.penjamin_id = pm.penjamin_id JOIN carabayar_m cm ON p.carabayar_id = cm.carabayar_id LEFT JOIN pembayaranpelayanan_t pp ON p.pendaftaran_id = pp.pendaftaran_id WHERE p.tgl_pendaftaran >= $1 AND p.tgl_pendaftaran < $2 GROUP BY 1, 2 ORDER BY 4 DESC`
	rows, err := r.simrsDB.Query(ctx, query, per.From, per.To)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []model.PatientStats{}
	for rows.Next() {
		var p model.PatientStats
		if err := rows.Scan(&p.PenjaminNama, &p.KategoriBayar, &p.Jumlah, &p.Revenue); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, nil
}

func (r *MonitoringRepository) GetRoomStats(ctx context.Context, per model.Period) ([]model.RoomStats, error) {
	if r.simrsDB == nil {
		return []model.RoomStats{{InstalasiNama: "Rawat Jalan", RuanganNama: "Poli Dalam", TotalTindakan: 150, TotalTarif: 15000000}}, nil
	}
	query := `SELECT im.instalasi_nama, rm.ruangan_nama, COUNT(t.tindakanpelayanan_id), COALESCE(SUM(t.tarif_tindakan), 0) FROM tindakanpelayanan_t t JOIN pendaftaran_t p ON p.pendaftaran_id = t.pendaftaran_id JOIN ruangan_m rm ON t.ruangan_id = rm.ruangan_id JOIN instalasi_m im ON rm.instalasi_id = im.instalasi_id WHERE p.tgl_pendaftaran >= $1 AND p.tgl_pendaftaran < $2 GROUP BY 1, 2 ORDER BY 4 DESC`
	rows, err := r.simrsDB.Query(ctx, query, per.From, per.To)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []model.RoomStats{}
	for rows.Next() {
		var s model.RoomStats
		if err := rows.Scan(&s.InstalasiNama, &s.RuanganNama, &s.TotalTindakan, &s.TotalTarif); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, nil
}

func (r *MonitoringRepository) GetComponentStats(ctx context.Context, per model.Period) ([]model.ComponentStats, error) {
	if r.simrsDB == nil {
		return []model.ComponentStats{{KomponenNama: "Jasa Medis", TotalKomponen: 75000000}}, nil
	}
	query := `SELECT km.komponentarif_nama, COALESCE(SUM(tk.tarif_tindakankomp), 0) FROM tindakankomponen_t tk JOIN tindakanpelayanan_t t ON t.tindakanpelayanan_id = tk.tindakanpelayanan_id JOIN pendaftaran_t p ON p.pendaftaran_id = t.pendaftaran_id JOIN komponentarif_m km ON tk.komponentarif_id = km.komponentarif_id WHERE p.tgl_pendaftaran >= $1 AND p.tgl_pendaftaran < $2 GROUP BY 1 ORDER BY 2 DESC`
	rows, err := r.simrsDB.Query(ctx, query, per.From, per.To)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []model.ComponentStats{}
	for rows.Next() {
		var s model.ComponentStats
		if err := rows.Scan(&s.KomponenNama, &s.TotalKomponen); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, nil
}

func (r *MonitoringRepository) GetTrend(ctx context.Context, per model.Period) ([]model.TrendPoint, error) {
	if r.simrsDB == nil {
		return []model.TrendPoint{{Bucket: per.From.Format("2006-01-02"), Revenue: 12500000, Visits: 34}}, nil
	}
	query := `SELECT to_char(date_trunc($3::text, p.tgl_pendaftaran), $4::text) AS bucket, COUNT(DISTINCT p.pendaftaran_id), COALESCE(SUM(pp.totalbiayapelayanan), 0) FROM pendaftaran_t p LEFT JOIN pembayaranpelayanan_t pp ON pp.pendaftaran_id = p.pendaftaran_id WHERE p.tgl_pendaftaran >= $1 AND p.tgl_pendaftaran < $2 GROUP BY 1 ORDER BY 1`
	rows, err := r.simrsDB.Query(ctx, query, per.From, per.To, per.Trunc, per.Fmt)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []model.TrendPoint{}
	for rows.Next() {
		var t model.TrendPoint
		if err := rows.Scan(&t.Bucket, &t.Visits, &t.Revenue); err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	return list, nil
}

func (r *MonitoringRepository) GetActiveSummary(ctx context.Context) (*model.ActiveSummary, error) {
	if r.simrsDB == nil {
		return &model.ActiveSummary{Total: 98, Antri: 12, SedangPeriksa: 9, SudahPulang: 30, RawatInap: 47}, nil
	}
	today := time.Now().Truncate(24 * time.Hour)
	tomorrow := today.Add(24 * time.Hour)
	sum := &model.ActiveSummary{Rooms: []model.ActiveRoom{}}
	query := `SELECT COALESCE(im.instalasi_nama, '(tanpa instalasi)'), COALESCE(rm.ruangan_nama, '(tanpa ruangan)'), COUNT(*) FILTER (WHERE p.pasienbatalperiksa_id IS NULL), COUNT(*) FILTER (WHERE p.pasienbatalperiksa_id IS NULL AND UPPER(TRIM(p.statusperiksa)) = 'ANTRIAN'), COUNT(*) FILTER (WHERE p.pasienbatalperiksa_id IS NULL AND UPPER(TRIM(p.statusperiksa)) = 'SEDANG PERIKSA'), COUNT(*) FILTER (WHERE p.pasienbatalperiksa_id IS NULL AND UPPER(TRIM(p.statusperiksa)) = 'SUDAH PULANG'), COUNT(*) FILTER (WHERE p.pasienbatalperiksa_id IS NULL AND UPPER(TRIM(p.statusperiksa)) = 'SEDANG DIRAWAT INAP'), COUNT(*) FILTER (WHERE p.pasienbatalperiksa_id IS NOT NULL) FROM pendaftaran_t p LEFT JOIN ruangan_m rm ON rm.ruangan_id = p.ruangan_id LEFT JOIN instalasi_m im ON im.instalasi_id = rm.instalasi_id WHERE p.tgl_pendaftaran >= $1 AND p.tgl_pendaftaran < $2 GROUP BY 1, 2 ORDER BY 3 DESC`
	rows, err := r.simrsDB.Query(ctx, query, today, tomorrow)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var inst, room string
		var total, antri, periksa, pulang, inap, batal int
		if err := rows.Scan(&inst, &room, &total, &antri, &periksa, &pulang, &inap, &batal); err != nil {
			return nil, err
		}
		sum.Total += total
		sum.Antri += antri
		sum.SedangPeriksa += periksa
		sum.SudahPulang += pulang
		sum.RawatInap += inap
		sum.Batal += batal
		sum.Rooms = append(sum.Rooms, model.ActiveRoom{InstalasiNama: inst, RuanganNama: room, Jumlah: total, Batal: batal})
	}
	return sum, nil
}

// FARMASI METHODS

func (r *MonitoringRepository) GetPharmacySummary(ctx context.Context, per model.Period) (*model.PharmacySummary, error) {
	if r.simrsDB == nil {
		return &model.PharmacySummary{TotalQty: 1250, TotalRevenue: 45000000, TotalHPP: 28000000, TotalKunjungan: 380, TotalRetur: 2500000, JumlahRetur: 12}, nil
	}
	var s model.PharmacySummary
	query := `SELECT COALESCE(SUM(o.qty_oa), 0), COALESCE(SUM(o.hargajual_oa * o.qty_oa), 0), COALESCE(SUM(o.harganetto_oa * o.qty_oa), 0), COUNT(DISTINCT o.pendaftaran_id) FROM obatalkespasien_t o WHERE o.tglpelayanan >= $1 AND o.tglpelayanan < $2 AND o.oasudahbayar_id IS NOT NULL`
	err := r.simrsDB.QueryRow(ctx, query, per.From, per.To).Scan(&s.TotalQty, &s.TotalRevenue, &s.TotalHPP, &s.TotalKunjungan)
	if err != nil {
		return nil, err
	}
	queryRetur := `SELECT COALESCE(SUM(totalretur), 0), COUNT(*) FROM returresep_t WHERE tglretur >= $1 AND tglretur < $2`
	err = r.simrsDB.QueryRow(ctx, queryRetur, per.From, per.To).Scan(&s.TotalRetur, &s.JumlahRetur)
	return &s, err
}

func (r *MonitoringRepository) GetPharmacySales(ctx context.Context, per model.Period, limit int) ([]model.PharmacySales, error) {
	if r.simrsDB == nil {
		return []model.PharmacySales{{ObatNama: "Paracetamol 500mg", Kategori: "Analgesik", QtyTerjual: 450, Revenue: 2250000}}, nil
	}
	query := `SELECT om.obatalkes_nama, jm.jenisobatalkes_nama, SUM(o.qty_oa), SUM(o.hargajual_oa * o.qty_oa) FROM obatalkespasien_t o JOIN obatalkes_m om ON om.obatalkes_id = o.obatalkes_id JOIN jenisobatalkes_m jm ON jm.jenisobatalkes_id = om.jenisobatalkes_id WHERE o.tglpelayanan >= $1 AND o.tglpelayanan < $2 AND o.oasudahbayar_id IS NOT NULL GROUP BY 1, 2 ORDER BY 3 DESC LIMIT $3`
	rows, err := r.simrsDB.Query(ctx, query, per.From, per.To, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []model.PharmacySales{}
	for rows.Next() {
		var p model.PharmacySales
		if err := rows.Scan(&p.ObatNama, &p.Kategori, &p.QtyTerjual, &p.Revenue); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, nil
}

func (r *MonitoringRepository) GetDrugStock(ctx context.Context) ([]model.DrugStock, error) {
	if r.simrsDB == nil {
		return []model.DrugStock{{ObatNama: "Paracetamol 500mg", Kategori: "Analgesik", StokTersedia: 500, StokKadaluarsa: 50, KadaluarsaTerdekat: "2026-10-15"}}, nil
	}
	query := `SELECT om.obatalkes_nama, om.obatalkes_kategori, COALESCE(SUM(s.jmlstokcurrent), 0), COALESCE(SUM(CASE WHEN s.tglkadaluarsa < CURRENT_DATE THEN s.jmlstokcurrent ELSE 0 END), 0), TO_CHAR(MIN(s.tglkadaluarsa), 'YYYY-MM-DD') FROM stokobatalkes_t s JOIN obatalkes_m om ON om.obatalkes_id = s.obatalkes_id WHERE s.stokoa_aktif = true GROUP BY 1, 2 HAVING COALESCE(SUM(s.jmlstokcurrent), 0) > 0 ORDER BY 3 DESC`
	rows, err := r.simrsDB.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []model.DrugStock{}
	for rows.Next() {
		var d model.DrugStock
		if err := rows.Scan(&d.ObatNama, &d.Kategori, &d.StokTersedia, &d.StokKadaluarsa, &d.KadaluarsaTerdekat); err != nil {
			return nil, err
		}
		list = append(list, d)
	}
	return list, nil
}

func (r *MonitoringRepository) GetPharmacyRoomStats(ctx context.Context, per model.Period) ([]model.PharmacyRoom, error) {
	if r.simrsDB == nil {
		return []model.PharmacyRoom{{InstalasiNama: "Rawat Jalan", RuanganNama: "Apotek", Kunjungan: 200, QtyObat: 650, Revenue: 18500000}}, nil
	}
	query := `SELECT im.instalasi_nama, rm.ruangan_nama, COUNT(DISTINCT o.pendaftaran_id), COALESCE(SUM(o.qty_oa), 0), COALESCE(SUM(o.hargajual_oa * o.qty_oa), 0) FROM obatalkespasien_t o JOIN ruangan_m rm ON rm.ruangan_id = o.ruangan_id JOIN instalasi_m im ON im.instalasi_id = rm.instalasi_id WHERE o.tglpelayanan >= $1 AND o.tglpelayanan < $2 AND o.oasudahbayar_id IS NOT NULL GROUP BY 1, 2 ORDER BY 5 DESC`
	rows, err := r.simrsDB.Query(ctx, query, per.From, per.To)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []model.PharmacyRoom{}
	for rows.Next() {
		var p model.PharmacyRoom
		if err := rows.Scan(&p.InstalasiNama, &p.RuanganNama, &p.Kunjungan, &p.QtyObat, &p.Revenue); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, nil
}
