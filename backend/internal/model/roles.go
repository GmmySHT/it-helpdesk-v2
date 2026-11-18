package model

// UserRole adalah peran pengguna. Sejak migrasi 000036 kolom role di DB
// bertipe TEXT (bukan enum), sehingga role baru bisa ditambahkan admin lewat
// halaman Manajemen Akses tanpa mengubah kode/skema.
type UserRole string

const (
	RoleReporter   UserRole = "pelapor"
	RoleITSupport  UserRole = "it_support"
	RoleAnalyst    UserRole = "analyst"
	RoleProgrammer UserRole = "programmer"
	RoleDevOps     UserRole = "devops"
	RoleLeader     UserRole = "leader"
	RoleAdmin      UserRole = "admin"

	// Alias lama — dipakai sebagian kode sampai semua call site dimigrasi.
	RoleUser    = RoleReporter
	RoleStaffIT = RoleITSupport
)

// DefaultRoles adalah daftar role yang disediakan sistem. Role lain boleh
// dibuat lewat RBAC (role_module_permissions), jangan pakai daftar ini untuk
// memblokir aksi — pakai helper di bawah atau izin modul.
var DefaultRoles = []UserRole{
	RoleReporter, RoleITSupport, RoleAnalyst, RoleProgrammer,
	RoleDevOps, RoleLeader, RoleAdmin,
}

// IsSupervisor = role yang bisa menyetujui, menolak, menutup, membuka
// kembali, dan meng-assign ulang tiket.
func IsSupervisor(role UserRole) bool {
	return role == RoleLeader || role == RoleAdmin
}

// IsTechnicalStaff = role yang mengerjakan tiket (klaim, resolve, daily task,
// KPI staf). IT support, analyst, programmer, dan devops semuanya staf teknis.
func IsTechnicalStaff(role UserRole) bool {
	switch role {
	case RoleITSupport, RoleAnalyst, RoleProgrammer, RoleDevOps:
		return true
	default:
		return false
	}
}

// IsReporter = role pelapor. Pelapor tidak bisa mengklaim/edit tiket, dan
// tidak boleh melihat BAST/cetak dokumen (hanya membaca hasil unggahan).
func IsReporter(role UserRole) bool { return role == RoleReporter }

// CanClaimTicket: staf teknis saja. Leader/admin mengelola, bukan mengerjakan.
func CanClaimTicket(role UserRole) bool { return IsTechnicalStaff(role) }

// CanEditTicketDetails: semua staf teknis + supervisor. Role dinamis lain
// diizinkan juga SELAMA middleware RBAC modul "ticketing" level editor lolos
// (lihat router). Fungsi ini hanya memblokir role yang jelas bukan pengedit.
func CanEditTicketDetails(role UserRole) bool {
	return IsTechnicalStaff(role) || IsSupervisor(role) || !IsReporter(role)
}

// RoleLabel dipakai backend saat mengirim pesan/error ke user.
func RoleLabel(role UserRole) string {
	switch role {
	case RoleReporter:
		return "pelapor"
	case RoleITSupport:
		return "IT support"
	case RoleAnalyst:
		return "analyst"
	case RoleProgrammer:
		return "programmer"
	case RoleDevOps:
		return "DevOps"
	case RoleLeader:
		return "leader"
	case RoleAdmin:
		return "admin"
	default:
		return string(role)
	}
}
