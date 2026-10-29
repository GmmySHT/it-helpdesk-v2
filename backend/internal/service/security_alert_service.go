package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

// SecurityAlertService memberi tahu pihak yang perlu tahu bila ada kejadian
// keamanan — saat ini: akun terkunci karena terlalu banyak salah password.
type SecurityAlertService struct {
	userRepo     *repository.UserRepository
	notifService *NotificationService
}

func NewSecurityAlertService(userRepo *repository.UserRepository, notifService *NotificationService) *SecurityAlertService {
	return &SecurityAlertService{userRepo: userRepo, notifService: notifService}
}

// NotifyAccountLocked dicatat di log server dan dikirim sebagai notifikasi
// ke (1) semua admin & leader, dan (2) pemilik akun — yang akan melihatnya
// saat berhasil login nanti. Dibuat tanpa ctx dari request supaya tidak ikut
// batal ketika response login sudah terkirim; aman dipanggil dengan `go`.
//
// Notifikasi HANYA dikirim kalau identifier cocok dengan akun yang ada. Tanpa
// itu, orang yang mengetik identifier asal-asalan bisa membanjiri admin
// dengan notifikasi, dan admin tidak bisa membedakan akun nyata dari karangan.
func (s *SecurityAlertService) NotifyAccountLocked(identifier, ip string, attempts int, lockout time.Duration) {
	log.Printf("SECURITY: akun %q dikunci %s setelah %d kali salah password, IP terakhir %s",
		identifier, lockout, attempts, ip)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	target, err := s.userRepo.FindByIdentifier(ctx, identifier)
	if err != nil || target == nil {
		return // identifier tidak dikenal: cukup tercatat di log
	}

	minutes := int(lockout.Minutes())

	// Pemilik akun
	s.notifService.Notify(ctx, target.ID, nil, "security_alert",
		"Percobaan Login Gagal",
		fmt.Sprintf("Ada %d kali percobaan login gagal ke akun Anda (IP: %s), sehingga akun dikunci %d menit. "+
			"Jika itu bukan Anda, segera ganti password dan hubungi admin.", attempts, ip, minutes))

	// Admin & leader (selain pemilik akun, yang sudah diberi tahu di atas)
	managers, err := s.userRepo.ListByRoles(ctx, model.RoleAdmin, model.RoleLeader)
	if err != nil {
		log.Printf("security alert: gagal membaca daftar admin/leader: %v", err)
		return
	}
	for _, m := range managers {
		if m.ID == target.ID {
			continue
		}
		s.notifService.Notify(ctx, m.ID, nil, "security_alert",
			"Akun Terkunci",
			fmt.Sprintf("Akun %s dikunci %d menit setelah %d kali salah password (IP: %s). "+
				"Periksa bila bukan pemilik akun yang mencoba.", target.Name, minutes, attempts, ip))
	}
}
