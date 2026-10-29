package handler

import "ticketing-it/backend/internal/model"

// canAccessTicket menentukan apakah user boleh MELIHAT sebuah tiket.
// Aturannya sama dengan daftar tiket (TicketService.List): leader, admin, dan
// staff IT melihat semua tiket; user biasa hanya tiket yang ia buat atau yang
// dibuatkan untuknya. Dipakai di semua endpoint yang menerima id tiket supaya
// pelapor tidak bisa membuka tiket orang lain hanya dengan menebak id-nya.
func canAccessTicket(role model.UserRole, userID string, t *model.Ticket) bool {
	switch role {
	case model.RoleLeader, model.RoleAdmin, model.RoleStaffIT:
		return true
	}
	if t.CreatedBy == userID {
		return true
	}
	return t.CreatedFor != nil && *t.CreatedFor == userID
}
