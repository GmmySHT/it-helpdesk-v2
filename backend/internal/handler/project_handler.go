/*
 * IT Helpdesk & Asset Management System
 * Copyright (c) 2026 Firaz Faruq <firaz.faruq@gmail.com>
 *
 * Karya orisinal: ide, desain, arsitektur, dan implementasi
 * seluruhnya dikerjakan oleh Firaz Faruq.
 * Dilarang menyalin atau mendistribusikan tanpa izin tertulis.
 */

package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/service"
)

type ProjectHandler struct {
	projects *service.ProjectService
}

func NewProjectHandler(projects *service.ProjectService) *ProjectHandler {
	return &ProjectHandler{projects: projects}
}

func projectActor(r *http.Request) (string, model.UserRole) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)
	return userID, role
}

func projectErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrProjectNotFound):
		respondError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, service.ErrProjectNotAllowed),
		errors.Is(err, service.ErrOnlyPICCanManage),
		errors.Is(err, service.ErrOnlyAssigneeCanUpdate),
		errors.Is(err, service.ErrProposalRequired),
		errors.Is(err, service.ErrOnlyCreatorCanSubmitProposal):
		respondError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, service.ErrReasonRequired):
		respondError(w, http.StatusBadRequest, err.Error())
	default:
		respondError(w, http.StatusBadRequest, err.Error())
	}
}

type createProjectRequest struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	CategoryID  string  `json:"category_id"`
	Priority    string  `json:"priority,omitempty"`
	StartDate   *string `json:"start_date,omitempty"`
	TargetDate  *string `json:"target_date,omitempty"`
}

func parseProjectDate(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, err = time.Parse("2006-01-02", s)
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// POST /projects — buat tiket project baru.
func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	start, err := parseProjectDate(ptrStr(req.StartDate))
	if err != nil {
		respondError(w, http.StatusBadRequest, "format start_date tidak valid")
		return
	}
	target, err := parseProjectDate(ptrStr(req.TargetDate))
	if err != nil {
		respondError(w, http.StatusBadRequest, "format target_date tidak valid")
		return
	}
	ticket, err := h.projects.Create(r.Context(), service.CreateTicketInput{
		Title: req.Title, Description: req.Description, CategoryID: req.CategoryID,
		Priority: model.TicketPriority(req.Priority), CreatedBy: actorID,
	}, start, target)
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, ticket)
}

func ptrStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// GET /projects/{id}
func (h *ProjectHandler) Get(w http.ResponseWriter, r *http.Request) {
	actorID, _ := projectActor(r)
	data, err := h.projects.Get(r.Context(), chi.URLParam(r, "id"), actorID)
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, data)
}

type proposalRequest struct {
	FileURL      string `json:"file_url"`
	FileName     string `json:"file_name"`
	FileType     string `json:"file_type"`
	FileSize     int64  `json:"file_size"`
	SignedByName string `json:"signed_by_name"`
	Notes        string `json:"notes"`
}

// POST /projects/{id}/proposal
func (h *ProjectHandler) SubmitProposal(w http.ResponseWriter, r *http.Request) {
	var req proposalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	p, err := h.projects.SubmitProposal(r.Context(), chi.URLParam(r, "id"), actorID,
		req.FileURL, req.FileName, req.FileType, req.FileSize, req.SignedByName, req.Notes)
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, p)
}

type decisionRequest struct {
	Decision string `json:"decision"`
	Notes    string `json:"notes"`
}

// POST /projects/{id}/proposal/decision — leader/admin (RBAC di router).
func (h *ProjectHandler) DecideProposal(w http.ResponseWriter, r *http.Request) {
	var req decisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	if err := h.projects.ApproveProposal(r.Context(), chi.URLParam(r, "id"), actorID, req.Decision, req.Notes); err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type statusRequest struct {
	Status string `json:"status"`
}

func (h *ProjectHandler) SetStatus(w http.ResponseWriter, r *http.Request) {
	var req statusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	if err := h.projects.SetStatus(r.Context(), chi.URLParam(r, "id"), actorID, req.Status); err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

type memberRequest struct {
	UserID string `json:"user_id"`
	Role   string `json:"role,omitempty"`
}

func (h *ProjectHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	var req memberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	role := model.MemberRole(req.Role)
	if role == "" {
		role = model.MemberRoleMember
	}
	if err := h.projects.AddMember(r.Context(), chi.URLParam(r, "id"), actorID, req.UserID, role); err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]string{"status": "ok"})
}

func (h *ProjectHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	actorID, _ := projectActor(r)
	if err := h.projects.RemoveMember(r.Context(), chi.URLParam(r, "id"), actorID, chi.URLParam(r, "userId")); err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type taskRequest struct {
	Title       string  `json:"title"`
	Description string  `json:"description,omitempty"`
	MilestoneID *string `json:"milestone_id,omitempty"`
	AssigneeID  *string `json:"assignee_id,omitempty"`
	StartDate   *string `json:"start_date,omitempty"`
	DueDate     *string `json:"due_date,omitempty"`
	Weight      int     `json:"weight,omitempty"`
	SortOrder   int     `json:"sort_order,omitempty"`
}

func taskDates(req taskRequest) (*time.Time, *time.Time, error) {
	start, err := parseProjectDate(ptrStr(req.StartDate))
	if err != nil {
		return nil, nil, errors.New("format start_date tidak valid")
	}
	due, err := parseProjectDate(ptrStr(req.DueDate))
	if err != nil {
		return nil, nil, errors.New("format due_date tidak valid")
	}
	return start, due, nil
}

func (h *ProjectHandler) CreateTask(w http.ResponseWriter, r *http.Request) {
	var req taskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	start, due, err := taskDates(req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	task, err := h.projects.CreateTask(r.Context(), chi.URLParam(r, "id"), actorID,
		req.Title, req.Description, req.MilestoneID, req.AssigneeID, start, due, req.Weight, req.SortOrder)
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, task)
}

func (h *ProjectHandler) UpdateTask(w http.ResponseWriter, r *http.Request) {
	var req taskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	start, due, err := taskDates(req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	err = h.projects.UpdateTask(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "taskId"), actorID,
		req.Title, req.Description, req.MilestoneID, req.AssigneeID, start, due, req.Weight, req.SortOrder)
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ProjectHandler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	actorID, _ := projectActor(r)
	if err := h.projects.DeleteTask(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "taskId"), actorID); err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ProjectHandler) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	var req statusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	if err := h.projects.UpdateTaskStatus(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "taskId"), actorID, req.Status); err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

type milestoneRequest struct {
	Title       string  `json:"title"`
	Description string  `json:"description,omitempty"`
	StartDate   *string `json:"start_date,omitempty"`
	DueDate     *string `json:"due_date,omitempty"`
	Weight      int     `json:"weight,omitempty"`
	SortOrder   int     `json:"sort_order,omitempty"`
	OwnerID     *string `json:"owner_id,omitempty"`
}

func (h *ProjectHandler) ListMilestones(w http.ResponseWriter, r *http.Request) {
	actorID, _ := projectActor(r)
	data, err := h.projects.ListMilestones(r.Context(), chi.URLParam(r, "id"), actorID)
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, data)
}

func milestoneDates(req milestoneRequest) (*time.Time, *time.Time, error) {
	start, err := parseProjectDate(ptrStr(req.StartDate))
	if err != nil {
		return nil, nil, errors.New("format start_date tidak valid")
	}
	due, err := parseProjectDate(ptrStr(req.DueDate))
	if err != nil {
		return nil, nil, errors.New("format due_date tidak valid")
	}
	return start, due, nil
}

func (h *ProjectHandler) CreateMilestone(w http.ResponseWriter, r *http.Request) {
	var req milestoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	start, due, err := milestoneDates(req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	actorID, _ := projectActor(r)
	m, err := h.projects.CreateMilestone(r.Context(), chi.URLParam(r, "id"), actorID,
		req.Title, req.Description, start, due, req.Weight, req.SortOrder, req.OwnerID)
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, m)
}

func (h *ProjectHandler) UpdateMilestone(w http.ResponseWriter, r *http.Request) {
	var req milestoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	start, due, err := milestoneDates(req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	actorID, _ := projectActor(r)
	err = h.projects.UpdateMilestone(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "mid"), actorID,
		req.Title, req.Description, start, due, req.Weight, req.SortOrder, req.OwnerID)
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ProjectHandler) SetMilestoneStatus(w http.ResponseWriter, r *http.Request) {
	var req statusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	if err := h.projects.SetMilestoneStatus(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "mid"), actorID, req.Status); err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

func (h *ProjectHandler) DeleteMilestone(w http.ResponseWriter, r *http.Request) {
	actorID, _ := projectActor(r)
	if err := h.projects.DeleteMilestone(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "mid"), actorID); err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ProjectHandler) ReorderMilestones(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	if err := h.projects.ReorderMilestones(r.Context(), chi.URLParam(r, "id"), actorID, req.IDs); err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ProjectHandler) Progress(w http.ResponseWriter, r *http.Request) {
	data, err := h.projects.ProgressSummary(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, data)
}

// GET /projects — daftar project mandiri. Tidak memakai daftar tiket.
func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.projects.ListProjects(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, list)
}

// GET /projects/dashboard — statistik khusus project.
func (h *ProjectHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	d, err := h.projects.Dashboard(r.Context())
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, d)
}

// PATCH /projects/{id} — ubah field deskriptif project (PIC/leader/admin).
func (h *ProjectHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req createProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	actorID, _ := projectActor(r)
	start, err := parseProjectDate(ptrStr(req.StartDate))
	if err != nil {
		respondError(w, http.StatusBadRequest, "format start_date tidak valid")
		return
	}
	target, err := parseProjectDate(ptrStr(req.TargetDate))
	if err != nil {
		respondError(w, http.StatusBadRequest, "format target_date tidak valid")
		return
	}
	t, err := h.projects.UpdateProject(r.Context(), chi.URLParam(r, "id"), actorID,
		req.Title, req.Description, req.Priority, start, target)
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, t)
}

// DELETE /projects/{id} — soft delete project + turunan (leader/admin).
func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	actorID, _ := projectActor(r)
	if err := h.projects.DeleteProject(r.Context(), chi.URLParam(r, "id"), actorID); err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "project dihapus"})
}

// POST /projects/{id}/proposal/upload — unggah berkas proposal (multipart)
// lalu simpan metadata lewat SubmitProposal. Terpisah dari signoff tiket.
func (h *ProjectHandler) UploadProposal(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "body multipart tidak valid")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "file proposal wajib diunggah")
		return
	}
	defer file.Close()

	actorID, _ := projectActor(r)
	url, fileType, err := saveValidatedDoc(file)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	proposal, err := h.projects.SubmitProposal(r.Context(), chi.URLParam(r, "id"), actorID,
		url, header.Filename, fileType, header.Size, r.FormValue("signed_by_name"), r.FormValue("notes"))
	if err != nil {
		projectErr(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, proposal)
}
