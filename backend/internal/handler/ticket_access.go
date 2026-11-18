package handler

import "ticketing-it/backend/internal/model"

// canAccessTicket menentukan apakah user boleh MELIHAT sebuah tiket.
// Aturannya sama dengan daftar tiket (TicketService.List): semua staf teknis
// (it_support/analyst/programmer/devops) + leader/admin melihat semua tiket;
// role lain hanya tiket yang ia buat atau yang dibuatkan untuknya. Dipakai di
// semua endpoint yang menerima id tiket supaya pelapor tidak bisa membuka
// tiket orang lain hanya dengan menebak id-nya.
func canAccessTicket(role model.UserRole, userID string, t *model.Ticket) bool {
	if model.IsTechnicalStaff(role) || model.IsSupervisor(role) {
		return true
	}
	if t.CreatedBy == userID {
		return true
	}
	return t.CreatedFor != nil && *t.CreatedFor == userID
}
