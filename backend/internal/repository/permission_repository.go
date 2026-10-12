package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

type PermissionRepository struct {
	db *pgxpool.Pool
}

func NewPermissionRepository(db *pgxpool.Pool) *PermissionRepository {
	return &PermissionRepository{db: db}
}

// ListRoleDefaults mengambil seluruh matriks izin default (role x modul) —
// dipakai untuk menampilkan tabel besar di halaman Manajemen Akses.
func (r *PermissionRepository) ListRoleDefaults(ctx context.Context) ([]model.RoleModulePermission, error) {
	rows, err := r.db.Query(ctx, `
		SELECT rmp.id, rmp.role, rmp.module_id, m.code, m.name, rmp.access_level, rmp.updated_by, rmp.updated_at
		FROM role_module_permissions rmp
		JOIN modules m ON m.id = rmp.module_id
		ORDER BY m.name, rmp.role
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.RoleModulePermission
	for rows.Next() {
		var p model.RoleModulePermission
		if err := rows.Scan(
			&p.ID, &p.Role, &p.ModuleID, &p.ModuleCode, &p.ModuleName,
			&p.AccessLevel, &p.UpdatedBy, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

// UpsertRoleDefault mengubah izin default satu role untuk satu modul.
// ON CONFLICT dipakai karena kombinasi (role, module_id) sudah UNIQUE —
// jadi ini "update kalau sudah ada, insert kalau belum" dalam satu query.
func (r *PermissionRepository) UpsertRoleDefault(ctx context.Context, role model.UserRole, moduleID string, level model.AccessLevel, updatedBy string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO role_module_permissions (role, module_id, access_level, updated_by, updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (role, module_id)
		DO UPDATE SET access_level = $3, updated_by = $4, updated_at = now()
	`, role, moduleID, level, updatedBy)
	return err
}

// ListUserOverrides mengambil semua override per-user (opsional difilter per modul).
func (r *PermissionRepository) ListUserOverrides(ctx context.Context) ([]model.UserModulePermission, error) {
	rows, err := r.db.Query(ctx, `
		SELECT ump.id, ump.user_id, u.name, ump.module_id, m.code, m.name,
			ump.access_level, ump.granted_by, ump.granted_at, COALESCE(ump.note, '')
		FROM user_module_permissions ump
		JOIN users u ON u.id = ump.user_id
		JOIN modules m ON m.id = ump.module_id
		ORDER BY ump.granted_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.UserModulePermission
	for rows.Next() {
		var p model.UserModulePermission
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.UserName, &p.ModuleID, &p.ModuleCode, &p.ModuleName,
			&p.AccessLevel, &p.GrantedBy, &p.GrantedAt, &p.Note,
		); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

func (r *PermissionRepository) UpsertUserOverride(ctx context.Context, userID, moduleID string, level model.AccessLevel, grantedBy, note string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO user_module_permissions (user_id, module_id, access_level, granted_by, granted_at, note)
		VALUES ($1, $2, $3, $4, now(), $5)
		ON CONFLICT (user_id, module_id)
		DO UPDATE SET access_level = $3, granted_by = $4, granted_at = now(), note = $5
	`, userID, moduleID, level, grantedBy, note)
	return err
}

func (r *PermissionRepository) DeleteUserOverride(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM user_module_permissions WHERE id = $1`, id)
	return err
}

// GetEffectiveLevel menghitung izin AKTUAL satu user untuk satu modul:
// override pribadi (user_module_permissions) menang kalau ada, kalau tidak
// baru pakai default role (role_module_permissions). Ini "otak" dari
// seluruh sistem RBAC — dipakai baik oleh middleware backend maupun
// endpoint /me/permissions yang dibaca frontend.
func (r *PermissionRepository) GetEffectiveLevel(ctx context.Context, userID string, role model.UserRole, moduleCode string) (model.AccessLevel, error) {
	var level model.AccessLevel
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(ump.access_level, rmp.access_level, 'none')
		FROM modules m
		LEFT JOIN user_module_permissions ump ON ump.module_id = m.id AND ump.user_id = $1
		LEFT JOIN role_module_permissions rmp ON rmp.module_id = m.id AND rmp.role = $2
		WHERE m.code = $3
	`, userID, role, moduleCode).Scan(&level)
	if err != nil {
		return model.AccessNone, err
	}
	return level, nil
}

// GetEffectiveAll sama seperti GetEffectiveLevel tapi untuk SEMUA modul
// sekaligus — dipakai frontend (Sidebar) untuk tahu modul mana yang boleh
// dibuka user yang sedang login, tanpa perlu 1 request per modul.
func (r *PermissionRepository) GetEffectiveAll(ctx context.Context, userID string, role model.UserRole) ([]model.EffectivePermission, error) {
	rows, err := r.db.Query(ctx, `
		SELECT m.code, m.name, m.is_active, COALESCE(ump.access_level, rmp.access_level, 'none')
		FROM modules m
		LEFT JOIN user_module_permissions ump ON ump.module_id = m.id AND ump.user_id = $1
		LEFT JOIN role_module_permissions rmp ON rmp.module_id = m.id AND rmp.role = $2
		ORDER BY m.name
	`, userID, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.EffectivePermission
	for rows.Next() {
		var p model.EffectivePermission
		if err := rows.Scan(&p.ModuleCode, &p.ModuleName, &p.IsActive, &p.AccessLevel); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}
