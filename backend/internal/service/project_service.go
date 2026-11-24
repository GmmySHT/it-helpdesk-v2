/*
 * IT Helpdesk & Asset Management System
 * Copyright (c) 2026 Firaz Faruq <firaz.faruq@gmail.com>
 *
 * Karya orisinal: ide, desain, arsitektur, dan implementasi
 * seluruhnya dikerjakan oleh Firaz Faruq.
 * Dilarang menyalin atau mendistribusikan tanpa izin tertulis.
 */

package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

var (
	ErrProjectNotFound              = errors.New("project tidak ditemukan")
	ErrProjectNotAllowed            = errors.New(" Anda tidak memiliki akses pada project ini")
	ErrProposalRequired             = errors.New("proposal belum disetujui; project belum bisa dijalankan")
	ErrProjectOnlyFlow              = errors.New("tiket project hanya bisa dikelola lewat halaman Project")
	ErrOnlyPICCanManage             = errors.New("hanya PIC yang dapat mengelola anggota, tugas, dan status project")
	ErrOnlyCreatorCanSubmitProposal = errors.New("hanya pembuat project yang dapat mengajukan proposal")
	ErrOnlyAssigneeCanUpdate        = errors.New("hanya penanggung jawab tugas yang dapat mengubah statusnya")
	ErrProjectFileNotFound          = errors.New("file proposal tidak ditemukan")
	ErrReasonRequired               = errors.New("alasan penolakan wajib diisi")
)

// ProjectService memisahkan entirely alur project dari alur tiket regular.
// Tidak memakai Claim/Resolve/Close/Reopen/Reassign/Deadline — semua guard
// ditolak di TicketService.
// projectNotifier hanya butuh Notify — sama seperti TicketService. Dipakai
// untuk memberi tahu leader saat proposal masuk dan anggota saat dipilih.
type projectNotifier interface {
	Notify(ctx context.Context, recipientID string, ticketID *string, notifType, title, message string)
}

type ProjectService struct {
	projects *repository.ProjectRepository
	tickets  *repository.TicketRepository
	users    *repository.UserRepository
	notifier projectNotifier
}

func NewProjectService(projects *repository.ProjectRepository, tickets *repository.TicketRepository, users *repository.UserRepository, notifier projectNotifier) *ProjectService {
	return &ProjectService{projects: projects, tickets: tickets, users: users, notifier: notifier}
}

// Create membuat tiket bertipe project. Status tiket tetap unassigned/draft —
// projekt tidak pernah masuk status tiket regular resolved/closed.
func (s *ProjectService) Create(ctx context.Context, input CreateTicketInput, start, target *time.Time) (*model.Ticket, error) {
	if input.Title == "" || input.CategoryID == "" {
		return nil, errors.New("judul dan kategori wajib diisi")
	}
	ticket := &model.Ticket{
		Title:         input.Title,
		Description:   input.Description,
		CategoryID:    input.CategoryID,
		Priority:      input.Priority,
		CreatedBy:     input.CreatedBy,
		Status:        model.StatusUnassigned,
		TicketType:    model.TicketTypeProject,
		ProjectStatus: ptrString(string(model.ProjectDraft)),
		StartDate:     start,
		TargetDate:    target,
	}
	if ticket.Priority == "" {
		ticket.Priority = model.PriorityMedium
	}
	if err := s.tickets.Create(ctx, ticket); err != nil {
		return nil, err
	}
	// Beri tahu leader/admin bahwa ada project baru dibuat. Notifikasi
	// tidak boleh menggagalkan create kalau pengirimannya gagal.
	if s.notifier != nil {
		reviewers, err := s.users.ListByRoles(ctx, model.RoleLeader, model.RoleAdmin)
		if err == nil {
			for _, reviewer := range reviewers {
				s.notifier.Notify(ctx, reviewer.ID, &ticket.ID,
					"project_created",
					"Project baru dibuat",
					"Project \""+ticket.Title+"\" dibuat oleh "+s.actorName(ctx, ticket.CreatedBy)+" dan menunggu proposal.",
				)
			}
		}
	}
	return ticket, nil
}

func (s *ProjectService) actorName(ctx context.Context, userID string) string {
	if u, err := s.users.FindByID(ctx, userID); err == nil && u != nil {
		return u.Name
	}
	return "seorang pengguna"
}

// userRole mengembalikan peran user; string kosong bila user tidak ditemukan.
func (s *ProjectService) userRole(ctx context.Context, userID string) (string, error) {
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return "", err
	}
	return string(u.Role), nil
}

// ListProjects mengembalikan daftar project mandiri (bukan daftar tiket).
func (s *ProjectService) ListProjects(ctx context.Context, status string) ([]repository.ProjectSummary, error) {
	return s.projects.ListProjectSummaries(ctx, status)
}

// DashboardProject mengembalikan statistik khusus project.
func (s *ProjectService) Dashboard(ctx context.Context) (repository.DashboardProject, error) {
	return s.projects.Dashboard(ctx)
}

// UpdateProject mengubah field deskriptif. PIC / leader / admin saja.
func (s *ProjectService) UpdateProject(ctx context.Context, ticketID, actorID, title, description, priority string, start, target *time.Time) (*model.Ticket, error) {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return nil, ErrProjectNotFound
	}
	role, _ := s.userRole(ctx, actorID)
	if role != "leader" && role != "admin" {
		if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
			return nil, err
		}
	}
	if title == "" {
		return nil, errors.New("judul project wajib diisi")
	}
	pr := model.TicketPriority(priority)
	if pr == "" {
		pr = model.PriorityMedium
	}
	if err := s.projects.UpdateProject(ctx, ticketID, title, description, string(pr), start, target); err != nil {
		return nil, err
	}
	return s.projects.GetProject(ctx, ticketID)
}

// DeleteProject — hanya leader/admin. Soft delete project + turunannya.
func (s *ProjectService) DeleteProject(ctx context.Context, ticketID, actorID string) error {
	role, _ := s.userRole(ctx, actorID)
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	// Pembuat boleh membatalkan project draft-nya sendiri (soft: status
	// dibatalkan, data tetap tersimpan). Penghapusan fisik tetap leader/admin.
	if role != "leader" && role != "admin" {
		if t.CreatedBy != actorID || statusOf(t) != string(model.ProjectDraft) {
			return errors.New("hanya pembuat yang dapat membatalkan draft; hanya leader/admin yang dapat menghapus project")
		}
		return s.projects.SetProjectStatus(ctx, ticketID, string(model.ProjectCancelled))
	}
	tx, err := s.projects.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := s.projects.DeleteProject(ctx, tx, ticketID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Get mengembalikan project + detail tim/tugas/proposal.
func (s *ProjectService) Get(ctx context.Context, ticketID string, actorID string) (map[string]interface{}, error) {
	ticket, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return nil, ErrProjectNotFound
	}
	members, err := s.projects.ListMembers(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	tasks, err := s.projects.ListTasks(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	done, total, percent, err := s.projects.Progress(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	proposal, _ := s.projects.GetProposal(ctx, ticketID)
	versions, _ := s.projects.ListProposals(ctx, ticketID)
	milestones, _ := s.projects.ListMilestones(ctx, ticketID)
	if proposal != nil {
		proposal.FileURL = "/api/v1/projects/files/" + proposal.ID
	}
	for i := range versions {
		versions[i].FileURL = "/api/v1/projects/files/" + versions[i].ID
	}
	role, _ := s.userRole(ctx, actorID)
	canView := s.canViewProposal(ctx, ticket, actorID, role)
	canUpload := role == "leader" || role == "admin" || (ticket.CreatedBy == actorID)
	if !canView {
		proposal, versions = nil, nil
	}
	return map[string]interface{}{
		"ticket":              ticket,
		"members":             members,
		"milestones":          milestones,
		"tasks":               tasks,
		"proposal":            proposal,
		"proposal_versions":   versions,
		"can_view_proposal":   canView,
		"can_upload_proposal": canUpload,
		"progress":            map[string]int{"done": done, "total": total, "percent": percent},
	}, nil
}

// SubmitProposal menyimpan metadata proposal yang sudah di-upload lewat
// endpoint signoffs (doc_type='proposal'). Belum mengubah status project.
func (s *ProjectService) SubmitProposal(ctx context.Context, ticketID, actorID, fileURL, fileName, fileType string, fileSize int64, signedByName, notes string) (*model.ProjectProposal, error) {
	ticket, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return nil, ErrProjectNotFound
	}
	if ticket.CreatedBy != actorID {
		return nil, ErrOnlyCreatorCanSubmitProposal
	}
	if statusOf(ticket) != string(model.ProjectDraft) {
		return nil, errors.New("proposal hanya bisa diajukan saat project masih draft")
	}
	version := 1
	if prev, _ := s.projects.GetProposal(ctx, ticketID); prev != nil {
		version = prev.Version + 1
	}
	if strings.TrimSpace(signedByName) == "" {
		signedByName = s.actorName(ctx, actorID)
	}
	p := &model.ProjectProposal{
		TicketID: ticketID, FileURL: fileURL, FileName: fileName,
		FileType: fileType, FileSize: fileSize, SignedByName: signedByName,
		Status: "diajukan", Version: version, Notes: notes, CreatedBy: actorID,
	}
	if version > 1 {
		if err := s.projects.CreateProposalVersion(ctx, p); err != nil {
			return nil, err
		}
	} else if err := s.projects.CreateProposal(ctx, p); err != nil {
		return nil, err
	}
	// Endpoint file menerima PROJECT ID, bukan proposal ID.
	p.FileURL = "/api/v1/projects/files/" + ticketID
	if err := s.projects.SetProjectStatus(ctx, ticketID, string(model.ProjectWaitingApproval)); err != nil {
		return nil, err
	}
	// Leader/admin wajib tahu proposal baru masuk supaya bisa segera
	// memutuskan — jangan cuma menunggu mereka membuka halaman project.
	if s.notifier != nil {
		reviewers, err := s.users.ListByRoles(ctx, model.RoleLeader, model.RoleAdmin)
		if err == nil {
			for _, reviewer := range reviewers {
				s.notifier.Notify(ctx, reviewer.ID, &ticket.ID,
					"project_proposal_submitted",
					"Proposal project menunggu persetujuan",
					"Proposal project \""+ticket.Title+"\" diajukan oleh "+s.actorName(ctx, actorID)+".",
				)
			}
		}
	}
	return p, nil
}

// ApproveProposal memeriksa tanda tangan persetujuan dan mengubah status
// menjadi disetujui. Hanya leader/admin yang memanggil (dijaga RBAC router).
func (s *ProjectService) ApproveProposal(ctx context.Context, ticketID, approverID, decision, notes string) error {
	if decision != "disetujui" && decision != "ditolak" {
		return errors.New("keputusan harus 'disetujui' atau 'ditolak'")
	}
	if decision == "ditolak" && strings.TrimSpace(notes) == "" {
		return ErrReasonRequired
	}
	proposal, err := s.projects.GetProposal(ctx, ticketID)
	if err != nil || proposal == nil {
		return errors.New("proposal tidak ditemukan")
	}
	if proposal.Status != "diajukan" {
		return errors.New("proposal sudah diputuskan")
	}
	if err := s.projects.DecideProposal(ctx, proposal.ID, decision, approverID); err != nil {
		return err
	}
	if decision == "ditolak" {
		if err := s.projects.SaveProposalDecision(ctx, proposal.ID, strings.TrimSpace(notes)); err != nil {
			return err
		}
	}
	next := string(model.ProjectDraft)
	if decision == "disetujui" {
		next = string(model.ProjectRunning)
	}
	if err := s.projects.SetProjectStatus(ctx, ticketID, next); err != nil {
		return err
	}
	t, _ := s.projects.GetProject(ctx, ticketID)
	if s.notifier != nil && t != nil {
		title := "Proposal project disetujui"
		msg := "Proposal project \"" + t.Title + "\" disetujui. Project kini berjalan."
		if decision == "ditolak" {
			title = "Proposal project ditolak"
			msg = "Proposal project \"" + t.Title + "\" ditolak. Perbaiki lalu ajukan kembali."
		}
		recipients := map[string]bool{}
		if t.CreatedBy != "" && t.CreatedBy != approverID {
			recipients[t.CreatedBy] = true
		}
		if pic, err := s.projects.GetPIC(ctx, ticketID); err == nil && pic != nil && pic.UserID != approverID {
			recipients[pic.UserID] = true
		}
		for rid := range recipients {
			s.notifier.Notify(ctx, rid, &t.ID, "project_proposal_decided", title, msg)
		}
		if decision == "disetujui" && s.notifier != nil {
			if members, merr := s.projects.ListMembers(ctx, ticketID); merr == nil {
				for _, m := range members {
					s.notifier.Notify(ctx, m.UserID, &t.ID,
						"project_member_added", "Anda bergabung dengan project",
						"Proposal project \""+t.Title+"\" disetujui. Anda kini menjadi anggota tim project ini.")
				}
			}
		}
	}
	return nil
}

// Start menjalankan project. Gate: HARUS ada proposal berstatus disetujui.
func (s *ProjectService) Start(ctx context.Context, ticketID, actorID string) error {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return err
	}
	approved, err := s.projects.GetApprovedProposal(ctx, ticketID)
	if err != nil || approved == nil {
		return ErrProposalRequired
	}
	if statusOf(t) != string(model.ProjectDraft) && statusOf(t) != string(model.ProjectWaitingApproval) {
		return errors.New("project tidak dalam kondisi bisa dijalankan")
	}
	return s.projects.SetProjectStatus(ctx, ticketID, string(model.ProjectRunning))
}

// SetStatus mengubah status project. PIC-only, kecuali ditutup oleh leader/admin.
func (s *ProjectService) SetStatus(ctx context.Context, ticketID, actorID, status string) error {
	if !model.IsValidProjectStatus(status) {
		return errors.New("status project tidak valid")
	}
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return err
	}
	if status == string(model.ProjectRunning) {
		approved, err := s.projects.GetApprovedProposal(ctx, ticketID)
		if err != nil || approved == nil {
			return ErrProposalRequired
		}
	}
	if status == string(model.ProjectDone) {
		n, err := s.projects.CountUnfinishedMilestones(ctx, ticketID)
		if err != nil {
			return err
		}
		if n > 0 {
			return fmt.Errorf("project tidak boleh selesai: masih ada %d milestone belum selesai", n)
		}
	}
	return s.projects.SetProjectStatus(ctx, ticketID, status)
}

// validateTaskDates menerapkan aturan tenggat project:
// due >= start; tenggat task tidak boleh lewat target_date project;
// tenggat melewati due_date milestone hanya peringatan (bukan error).
func (s *ProjectService) validateTaskDates(ctx context.Context, t *model.Ticket, milestoneID *string, start, due *time.Time) error {
	if start != nil && due != nil && due.Before(*start) {
		return errors.New("tenggat tidak boleh sebelum tanggal mulai")
	}
	if due != nil && t.TargetDate != nil && due.After(*t.TargetDate) {
		return errors.New("tenggat task tidak boleh melewati target_date project")
	}
	return nil
}

// validateMilestoneDates: tenggat milestone harus berada di dalam
// rentang start_date..target_date project (bila keduanya ada).
func (s *ProjectService) validateMilestoneDates(t *model.Ticket, start, due *time.Time) error {
	if start != nil && due != nil && due.Before(*start) {
		return errors.New("tenggat milestone tidak boleh sebelum tanggal mulai")
	}
	if start != nil && t.StartDate != nil && start.Before(*t.StartDate) {
		return errors.New("mulai milestone tidak boleh sebelum mulai project")
	}
	if due != nil && t.TargetDate != nil && due.After(*t.TargetDate) {
		return errors.New("tenggat milestone tidak boleh melewati target project")
	}
	return nil
}

// validateAssignee memastikan penanggung jawab adalah anggota aktif.
func (s *ProjectService) validateAssignee(ctx context.Context, ticketID string, assigneeID *string) error {
	if assigneeID == nil || *assigneeID == "" {
		return nil
	}
	active, err := s.projects.IsActiveMember(ctx, ticketID, *assigneeID)
	if err != nil {
		return err
	}
	if !active {
		return errors.New("penanggung jawab harus anggota aktif project")
	}
	return nil
}

// validateMilestone memastikan milestone milik project yang sama.
func (s *ProjectService) validateMilestone(ctx context.Context, ticketID string, milestoneID *string) error {
	if milestoneID == nil || *milestoneID == "" {
		return nil
	}
	m, err := s.projects.GetMilestone(ctx, *milestoneID)
	if err != nil {
		return err
	}
	if m == nil || m.TicketID != ticketID {
		return errors.New("milestone tidak ditemukan pada project ini")
	}
	return nil
}

// requireRunning menolak perubahan milestone/task bila project tidak
// berjalan. 'ditahan' hanya boleh lihat; draft/menunggu_persetujuan juga.
func (s *ProjectService) requireRunning(t *model.Ticket) error {
	if t == nil || statusOf(t) != string(model.ProjectRunning) {
		return errors.New("milestone dan tugas hanya dapat diubah saat project berjalan")
	}
	return nil
}

// requirePIC membatasi pengelolaan project kepada PEMBUAT project atau PIC
// aktif. Leader/admin tidak otomatis boleh mengelola: peran mereka hanya
// menyetujui proposal. Ini sesuai revisi alur yang diminta.
func (s *ProjectService) requirePIC(ctx context.Context, ticketID, actorID string, t *model.Ticket) error {
	if t != nil && t.CreatedBy == actorID {
		return nil
	}
	pic, err := s.projects.GetPIC(ctx, ticketID)
	if err == nil && pic != nil && pic.UserID == actorID {
		return nil
	}
	return ErrOnlyPICCanManage
}

// AddMember/RemoveMember/SetPIC — PIC-only.
func (s *ProjectService) AddMember(ctx context.Context, ticketID, actorID, userID string, role model.MemberRole) error {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return err
	}
	if role != model.MemberRolePIC && role != model.MemberRoleMember {
		return errors.New("role anggota tidak valid")
	}
	if err := s.projects.AddMember(ctx, ticketID, userID, role, actorID); err != nil {
		return err
	}
	// Anggota/PIC yang baru dipilih harus langsung tahu, termasuk leader
	// yang kini boleh menjadi tim project.
	return nil
}

func (s *ProjectService) RemoveMember(ctx context.Context, ticketID, actorID, userID string) error {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return err
	}
	member, err := s.projects.GetMember(ctx, ticketID, userID)
	if err != nil || member == nil {
		return errors.New("anggota tidak ditemukan")
	}
	if member.Role == model.MemberRolePIC {
		return errors.New("PIC tidak boleh dikeluarkan tanpa pengganti")
	}
	n, err := s.projects.CountUnfinishedTasks(ctx, ticketID, userID)
	if err != nil {
		return err
	}
	if n > 0 {
		return fmt.Errorf("anggota masih punya %d tugas belum selesai; pindahkan dulu", n)
	}
	return s.projects.RemoveMember(ctx, ticketID, userID)
}

// CreateTask — PIC-only.
func (s *ProjectService) CreateTask(ctx context.Context, ticketID, actorID, title, description string, milestoneID, assigneeID *string, startDate, dueDate *time.Time, weight, sortOrder int) (*model.ProjectTask, error) {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return nil, ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return nil, err
	}
	if err := s.requireRunning(t); err != nil {
		return nil, err
	}
	if err := s.validateAssignee(ctx, ticketID, assigneeID); err != nil {
		return nil, err
	}
	if err := s.validateMilestone(ctx, ticketID, milestoneID); err != nil {
		return nil, err
	}
	if err := s.validateTaskDates(ctx, t, milestoneID, startDate, dueDate); err != nil {
		return nil, err
	}
	if title == "" {
		return nil, errors.New("judul tugas wajib diisi")
	}
	if weight <= 0 {
		weight = 1
	}
	task := &model.ProjectTask{
		TicketID: ticketID, MilestoneID: milestoneID, Title: title, Description: description,
		AssigneeID: assigneeID, StartDate: startDate, DueDate: dueDate, Status: "todo",
		Weight: weight, SortOrder: sortOrder, CreatedBy: actorID,
	}
	if err := s.projects.CreateTask(ctx, task); err != nil {
		return nil, err
	}
	s.notifyTaskAssignment(ctx, t, task.ID, title, assigneeID, actorID)
	return task, nil
}

// UpdateTaskStatus — anggota hanya boleh ubah tugas miliknya sendiri; PIC boleh semua.
func (s *ProjectService) UpdateTaskStatus(ctx context.Context, ticketID, taskID, actorID, status string) error {
	task, err := s.projects.GetTask(ctx, taskID)
	if err != nil {
		return errors.New("tugas tidak ditemukan")
	}
	if task.TicketID != ticketID {
		return errors.New("tugas tidak termasuk project ini")
	}
	pic, _ := s.projects.GetPIC(ctx, ticketID)
	isPIC := pic != nil && pic.UserID == actorID
	if !isPIC {
		if task.AssigneeID == nil || *task.AssigneeID != actorID {
			return ErrOnlyAssigneeCanUpdate
		}
	}
	if status != "todo" && status != "doing" && status != "done" {
		return errors.New("status tugas tidak valid")
	}
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requireRunning(t); err != nil {
		return err
	}
	if err := s.projects.UpdateTaskStatus(ctx, taskID, status); err != nil {
		return err
	}
	return s.projects.SyncMilestoneStatuses(ctx, ticketID)
}

func (s *ProjectService) UpdateTask(ctx context.Context, ticketID, taskID, actorID, title, description string, milestoneID, assigneeID *string, startDate, dueDate *time.Time, weight, sortOrder int) error {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return err
	}
	if err := s.requireRunning(t); err != nil {
		return err
	}
	task, err := s.projects.GetTask(ctx, taskID)
	if err != nil || task.TicketID != ticketID {
		return errors.New("tugas tidak ditemukan")
	}
	if err := s.validateAssignee(ctx, ticketID, assigneeID); err != nil {
		return err
	}
	if err := s.validateMilestone(ctx, ticketID, milestoneID); err != nil {
		return err
	}
	if err := s.validateTaskDates(ctx, t, milestoneID, startDate, dueDate); err != nil {
		return err
	}
	oldAssignee := task.AssigneeID
	oldDue := formatDatePtr(task.DueDate)
	newDue := formatDatePtr(dueDate)
	task.MilestoneID = milestoneID
	task.Title = title
	task.Description = description
	task.AssigneeID = assigneeID
	task.StartDate = startDate
	task.DueDate = dueDate
	task.Weight = weight
	task.SortOrder = sortOrder
	if err := s.projects.UpdateTask(ctx, task); err != nil {
		return err
	}
	if oldDue != newDue {
		_ = s.projects.RecordProjectHistory(ctx, ticketID, actorID, "tenggat tugas: "+title, oldDue, newDue)
	}
	if !samePtr(oldAssignee, assigneeID) {
		s.notifyTaskAssignment(ctx, t, taskID, title, assigneeID, actorID)
	}
	return nil
}

func (s *ProjectService) DeleteTask(ctx context.Context, ticketID, taskID, actorID string) error {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return err
	}
	if err := s.requireRunning(t); err != nil {
		return err
	}
	task, err := s.projects.GetTask(ctx, taskID)
	if err != nil || task.TicketID != ticketID {
		return errors.New("tugas tidak ditemukan")
	}
	return s.projects.DeleteTask(ctx, taskID)
}

// --- Milestone ---

func (s *ProjectService) ListMilestones(ctx context.Context, ticketID, actorID string) ([]model.ProjectMilestone, error) {
	return s.projects.ListMilestones(ctx, ticketID)
}

func (s *ProjectService) CreateMilestone(ctx context.Context, ticketID, actorID, title, description string, start, due *time.Time, weight, sortOrder int, ownerID *string) (*model.ProjectMilestone, error) {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return nil, ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return nil, err
	}
	if err := s.requireRunning(t); err != nil {
		return nil, err
	}
	if err := s.validateAssignee(ctx, ticketID, ownerID); err != nil {
		return nil, err
	}
	if err := s.validateMilestoneDates(t, start, due); err != nil {
		return nil, err
	}
	if title == "" {
		return nil, errors.New("judul milestone wajib diisi")
	}
	if weight <= 0 {
		weight = 1
	}
	m := &model.ProjectMilestone{
		TicketID: ticketID, Title: title, Description: description,
		StartDate: start, DueDate: due, Weight: weight, SortOrder: sortOrder, CreatedBy: actorID, OwnerID: ownerID,
	}
	if err := s.projects.CreateMilestone(ctx, m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *ProjectService) UpdateMilestone(ctx context.Context, ticketID, milestoneID, actorID, title, description string, start, due *time.Time, weight, sortOrder int, ownerID *string) error {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return err
	}
	if err := s.requireRunning(t); err != nil {
		return err
	}
	m, err := s.projects.GetMilestone(ctx, milestoneID)
	if err != nil || m == nil || m.TicketID != ticketID {
		return errors.New("milestone tidak ditemukan")
	}
	if err := s.validateAssignee(ctx, ticketID, ownerID); err != nil {
		return err
	}
	if err := s.validateMilestoneDates(t, start, due); err != nil {
		return err
	}
	oldStart, oldDue := formatDatePtr(m.StartDate), formatDatePtr(m.DueDate)
	newStart, newDue := formatDatePtr(start), formatDatePtr(due)
	m.Title, m.Description, m.StartDate, m.DueDate = title, description, start, due
	m.Weight, m.SortOrder, m.OwnerID = weight, sortOrder, ownerID
	if err := s.projects.UpdateMilestone(ctx, m); err != nil {
		return err
	}
	if oldStart != newStart || oldDue != newDue {
		_ = s.projects.RecordProjectHistory(ctx, ticketID, actorID, "tanggal milestone: "+title,
			oldStart+" s.d. "+oldDue, newStart+" s.d. "+newDue)
	}
	return nil
}

// SetMilestoneStatus — manual hanya untuk milestone tanpa task.
func (s *ProjectService) SetMilestoneStatus(ctx context.Context, ticketID, milestoneID, actorID, status string) error {
	if status != "belum_mulai" && status != "berjalan" && status != "selesai" {
		return errors.New("status milestone tidak valid")
	}
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return err
	}
	if err := s.requireRunning(t); err != nil {
		return err
	}
	m, err := s.projects.GetMilestone(ctx, milestoneID)
	if err != nil || m == nil || m.TicketID != ticketID {
		return errors.New("milestone tidak ditemukan")
	}
	taskCount, err := s.projects.CountTasksInMilestone(ctx, milestoneID)
	if err != nil {
		return err
	}
	if taskCount > 0 {
		return errors.New("status milestone dengan tugas dihitung otomatis dari tugas; hanya milestone tanpa tugas yang bisa diubah manual")
	}
	return s.projects.SetMilestoneStatus(ctx, milestoneID, status)
}

func (s *ProjectService) DeleteMilestone(ctx context.Context, ticketID, milestoneID, actorID string) error {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return err
	}
	if err := s.requireRunning(t); err != nil {
		return err
	}
	m, err := s.projects.GetMilestone(ctx, milestoneID)
	if err != nil || m == nil || m.TicketID != ticketID {
		return errors.New("milestone tidak ditemukan")
	}
	return s.projects.DeleteMilestone(ctx, milestoneID)
}

func (s *ProjectService) ReorderMilestones(ctx context.Context, ticketID, actorID string, ids []string) error {
	t, err := s.projects.GetProject(ctx, ticketID)
	if err != nil {
		return ErrProjectNotFound
	}
	if err := s.requirePIC(ctx, ticketID, actorID, t); err != nil {
		return err
	}
	return s.projects.ReorderMilestones(ctx, ticketID, ids)
}

// ProgressService mengembalikan ringkasan progres project + per milestone.
func (s *ProjectService) ProgressSummary(ctx context.Context, ticketID string) (map[string]interface{}, error) {
	done, total, percent, err := s.projects.Progress(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	milestones, err := s.projects.ListMilestones(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"done": done, "total": total, "percent": percent, "milestones": milestones,
	}, nil
}

func ptrString(s string) *string { return &s }

// statusOf membaca project_status nullable (regular = kosong).
func statusOf(t *model.Ticket) string {
	if t.ProjectStatus == nil {
		return ""
	}
	return *t.ProjectStatus
}

var _ = fmt.Sprintf

// canViewProposal: pembuat, PIC, anggota aktif, leader, admin.
func (s *ProjectService) canViewProposal(ctx context.Context, t *model.Ticket, actorID, role string) bool {
	if role == "leader" || role == "admin" || t.CreatedBy == actorID {
		return true
	}
	m, _ := s.projects.GetMember(ctx, t.ID, actorID)
	return m != nil
}

// CanViewProjectFile dipakai handler endpoint file terotorisasi.
func (s *ProjectService) CanViewProjectFile(ctx context.Context, ticketID, actorID string, role model.UserRole) (bool, error) {
	t, err := s.tickets.FindByID(ctx, ticketID)
	if err != nil {
		return false, err
	}
	if t == nil {
		return false, ErrProjectNotFound
	}
	return s.canViewProposal(ctx, t, actorID, string(role)), nil
}

// GetProposalFile mengambil metadata satu versi proposal untuk endpoint file.
func (s *ProjectService) GetProposalFile(ctx context.Context, proposalID string) (*model.ProjectProposal, error) {
	p, err := s.projects.GetProposalByID(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, ErrProjectFileNotFound
	}
	return p, nil
}

func formatDatePtr(t *time.Time) string {
	if t == nil {
		return "-"
	}
	return t.Format("2006-01-02")
}

func samePtr(a, b *string) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

// notifyTaskAssignment mengirim notifikasi saat tugas ditugaskan/diganti.
func (s *ProjectService) notifyTaskAssignment(ctx context.Context, t *model.Ticket, taskID, title string, assigneeID *string, actorID string) {
	if s.notifier == nil || assigneeID == nil || *assigneeID == "" || *assigneeID == actorID {
		return
	}
	name := s.actorName(ctx, *assigneeID)
	if name == "" {
		name = "Anggota"
	}
	s.notifier.Notify(ctx, *assigneeID, &t.ID, "project_task_assigned",
		"Tugas project baru", "Tugas \""+title+"\" pada project \""+t.Title+"\" ditugaskan kepada "+name+".")
}

// CheckProjectTaskDue memeriksa tenggat tugas project (H-1 / terlambat).
// Berjalan terpisah dari CheckSLAReminders dan TIDAK menyentuh tiket regular.
func (s *ProjectService) CheckProjectTaskDue(ctx context.Context, now time.Time) error {
	if s.notifier == nil {
		return nil
	}
	tasks, err := s.projects.ListDueProjectTasks(ctx, now)
	if err != nil {
		return err
	}
	for _, task := range tasks {
		if task.Assignee == "" {
			continue
		}
		kind := "project_task_due_soon"
		title := "Tugas project akan jatuh tempo"
		body := "Tugas \"" + task.Title + "\" jatuh tempo besok."
		if task.Overdue {
			kind = "project_task_overdue"
			title = "Tugas project terlambat"
			body = "Tugas \"" + task.Title + "\" sudah melewati tenggat."
		}
		tid := task.TicketID
		s.notifier.Notify(ctx, task.Assignee, &tid, kind, title, body)
		_ = s.projects.MarkTaskReminderSent(ctx, task.TaskID)
	}
	return nil
}

// GetLatestProposalFileByProject mengambil proposal versi terbaru dari project.
// Dipakai endpoint file terotorisasi bila client hanya punya project ID.
func (s *ProjectService) GetLatestProposalFileByProject(ctx context.Context, ticketID string) (*model.ProjectProposal, error) {
	p, err := s.projects.GetProposal(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, ErrProjectFileNotFound
	}
	return p, nil
}
