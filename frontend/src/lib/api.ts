const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

export type User = {
  id: string;
  name: string;
  email: string;
  username?: string;
  role: "user" | "staff_it" | "leader" | "admin";
  department?: string;
  is_active: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  description?: string;
};

export type TicketStatus =
  | "pending_approval"
  | "unassigned"
  | "assigned"
  | "claimed"
  | "resolved"
  | "closed";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type Ticket = {
  id: string;
  ticket_code?: string;
  title: string;
  description: string;
  category_id: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_by: string;
  created_by_name?: string;
  created_for?: string;
  created_for_name?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_by?: string;
  assigned_at?: string;
  claimed_by?: string;
  claimed_by_name?: string;
  claimed_at?: string;
  claim_type?: "assigned" | "self_claimed";
  sla_deadline?: string;
  last_resolved_at?: string;
  reopen_count: number;
  closed_by?: string;
  closed_by_name?: string;
  closed_at?: string;
  created_at: string;
  // true kalau tiket sudah punya scan BAST bertanda tangan
  has_signoff?: boolean;
};

type LoginResponse = {
  token: string;
  user: User;
};

type ApiError = {
  error: string;
};

// handleUnauthorized dipanggil setiap kali API mengembalikan 401 (token
// tidak valid/kedaluwarsa) — DI MANA PUN itu terjadi, di halaman manapun.
// Sesi dibersihkan dan browser diarahkan paksa ke /login lewat navigasi
// PENUH (bukan router.push), supaya seluruh state aplikasi (termasuk
// koneksi WebSocket yang mungkin masih mencoba sambung ulang dengan token
// basi) ikut ter-reset bersih, bukan cuma pindah halaman React.
function handleUnauthorized() {
  if (typeof window === "undefined") return; // jaga-jaga kalau sempat jalan di server
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

// request() adalah pembungkus fetch() bawaan browser untuk body JSON biasa.
// Untuk upload file (resolve), dipakai fungsi terpisah requestFormData()
// karena Content-Type-nya beda (multipart, bukan application/json).
async function request<T>(
  path: string,
  options?: RequestInit,
  token?: string
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    handleUnauthorized();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
    throw new Error(body.error || `Request gagal dengan status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

async function requestFormData<T>(
  path: string,
  formData: FormData,
  token: string
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      // Content-Type SENGAJA tidak diset manual di sini — browser akan
      // otomatis mengisinya dengan "multipart/form-data; boundary=..."
      // yang benar. Kalau kita set manual, boundary-nya hilang dan
      // backend gagal parsing form.
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (res.status === 401) {
    handleUnauthorized();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
    throw new Error(body.error || `Request gagal dengan status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// --- Auth ---

export function login(identifier: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export function register(
  name: string,
  email: string,
  password: string,
  username?: string
) {
  return request<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, username }),
  });
}

// --- Categories & Staff (untuk dropdown) ---

export function listCategories(token: string) {
  return request<Category[]>("/categories", {}, token);
}

export function listStaff(token: string) {
  return request<User[]>("/users/staff", {}, token);
}

export function listReporters(token: string) {
  return request<User[]>("/users/reporters", {}, token);
}

export function listAllUsers(token: string) {
  return request<User[]>("/admin/users", {}, token);
}

export function createUserByAdmin(
  token: string,
  input: {
    name: string;
    email: string;
    username?: string;
    password: string;
    role: "user" | "staff_it" | "leader" | "admin";
    department?: string;
  }
) {
  return request<User>(
    "/admin/users",
    { method: "POST", body: JSON.stringify(input) },
    token
  );
}

// updateUserByAdmin dipakai leader/admin mengedit profil + role user yang
// sudah ada. Password TIDAK ada di sini — tidak ada endpoint reset password
// lewat form ini.
export function updateUserByAdmin(
  token: string,
  id: string,
  input: {
    name: string;
    email: string;
    username?: string;
    role: "user" | "staff_it" | "leader" | "admin";
    department?: string;
  }
) {
  return request<User>(
    `/admin/users/${id}`,
    { method: "PUT", body: JSON.stringify(input) },
    token
  );
}

// setUserActive mengaktifkan/menonaktifkan user tanpa menghapus datanya —
// user nonaktif tidak bisa login lagi sampai diaktifkan kembali.
export function setUserActive(token: string, id: string, isActive: boolean) {
  return request<{ ok: boolean }>(
    `/admin/users/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ is_active: isActive }) },
    token
  );
}

// deleteUserByAdmin melakukan soft-delete — user hilang dari daftar dan
// tidak bisa login lagi, tapi riwayat tiket yang pernah dia buat/tangani
// tetap tersimpan utuh di backend.
export function deleteUserByAdmin(token: string, id: string) {
  return request<{ ok: boolean }>(
    `/admin/users/${id}`,
    { method: "DELETE" },
    token
  );
}

// --- Tickets ---

export type TicketSignoff = {
  id: string;
  ticket_id: string;
  file_url: string;
  file_name: string;
  file_type: "image" | "pdf";
  file_size: number;
  signed_by_name: string;
  signed_at?: string;
  note?: string;
  uploaded_by: string;
  uploaded_by_name?: string;
  created_at: string;
};

export function listTickets(
  token: string,
  filters?: { status?: string; reporterId?: string; assigneeId?: string }
) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.reporterId) params.set("reporter_id", filters.reporterId);
  if (filters?.assigneeId) params.set("assignee_id", filters.assigneeId);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<Ticket[]>(`/tickets${query}`, {}, token);
}

export function listSignoffs(token: string, ticketId: string) {
  return request<TicketSignoff[]>(`/tickets/${ticketId}/signoffs`, {}, token);
}

// fileUrl mengubah path relatif dari API ("/uploads/xxx.png") menjadi URL
// absolut yang bisa dipakai <img src> / <a href>. API base berakhiran
// "/api/v1", jadi bagian itu dibuang dulu.
export function fileUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1")
    .replace(/\/api\/v1\/?$/, "");
  return `${base}${path}`;
}

export function uploadSignoff(
  token: string,
  ticketId: string,
  input: {
    file: File;
    signedByName: string;
    signedAt?: string;
    note?: string;
  }
) {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("signed_by_name", input.signedByName);
  if (input.signedAt) formData.append("signed_at", input.signedAt);
  if (input.note) formData.append("note", input.note);
  return requestFormData<TicketSignoff>(
    `/tickets/${ticketId}/signoffs`,
    formData,
    token
  );
}

export async function deleteSignoff(
  token: string,
  ticketId: string,
  signoffId: string
) {
  const res = await fetch(
    `${API_BASE_URL}/tickets/${ticketId}/signoffs/${signoffId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
    throw new Error(body.error || `Gagal menghapus dokumen (${res.status})`);
  }
}

export function getTicket(token: string, id: string) {
  return request<Ticket>(`/tickets/${id}`, {}, token);
}

export function createTicket(
  token: string,
  input: {
    title: string;
    description: string;
    category_id: string;
    priority?: TicketPriority;
    assigned_to?: string;
    created_for?: string; // leader/admin membuat tiket atas nama user lain
    deadline?: string; // ISO datetime, opsional — hanya efektif kalau requester leader/admin
  }
) {
  return request<Ticket>(
    "/tickets",
    { method: "POST", body: JSON.stringify(input) },
    token
  );
}

export type Module = {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
};

export type AccessLevel = "none" | "view" | "editor";

export type RoleModulePermission = {
  id: string;
  role: string;
  module_id: string;
  module_code: string;
  module_name: string;
  access_level: AccessLevel;
  updated_at: string;
};

export type UserModulePermission = {
  id: string;
  user_id: string;
  user_name: string;
  module_id: string;
  module_code: string;
  module_name: string;
  access_level: AccessLevel;
  granted_at: string;
  note?: string;
};

export type EffectivePermission = {
  module_code: string;
  module_name: string;
  is_active: boolean;
  access_level: AccessLevel;
};

export function getMyPermissions(token: string) {
  return request<EffectivePermission[]>("/me/permissions", {}, token);
}

export function listModules(token: string) {
  return request<Module[]>("/admin/modules", {}, token);
}

export function setModuleActive(token: string, id: string, isActive: boolean) {
  return request<{ ok: boolean }>(
    `/admin/modules/${id}`,
    { method: "PATCH", body: JSON.stringify({ is_active: isActive }) },
    token
  );
}

export function listRolePermissions(token: string) {
  return request<RoleModulePermission[]>("/admin/permissions/roles", {}, token);
}

export function upsertRolePermission(
  token: string,
  role: string,
  moduleId: string,
  accessLevel: AccessLevel
) {
  return request<{ ok: boolean }>(
    "/admin/permissions/roles",
    {
      method: "PUT",
      body: JSON.stringify({ role, module_id: moduleId, access_level: accessLevel }),
    },
    token
  );
}

export function listUserOverrides(token: string) {
  return request<UserModulePermission[]>("/admin/permissions/users", {}, token);
}

export function upsertUserOverride(
  token: string,
  userId: string,
  moduleId: string,
  accessLevel: AccessLevel,
  note?: string
) {
  return request<{ ok: boolean }>(
    "/admin/permissions/users",
    {
      method: "PUT",
      body: JSON.stringify({
        user_id: userId,
        module_id: moduleId,
        access_level: accessLevel,
        note,
      }),
    },
    token
  );
}

export function deleteUserOverride(token: string, id: string) {
  return request<{ ok: boolean }>(
    `/admin/permissions/users/${id}`,
    { method: "DELETE" },
    token
  );
}

export function approveTicket(
  token: string,
  id: string,
  assignedTo?: string,
  deadline?: string
) {
  return request<Ticket>(
    `/tickets/${id}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ assigned_to: assignedTo, deadline }),
    },
    token
  );
}

export function updateTicketDetails(
  token: string,
  id: string,
  input: {
    title: string;
    description: string;
    category_id: string;
    priority: TicketPriority;
  }
) {
  return request<Ticket>(
    `/tickets/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    token
  );
}

export function updateTicketDeadline(token: string, id: string, deadline: string) {
  return request<Ticket>(
    `/tickets/${id}/deadline`,
    { method: "PATCH", body: JSON.stringify({ deadline }) },
    token
  );
}

export function rejectTicket(token: string, id: string, reason: string) {
  return request<Ticket>(
    `/tickets/${id}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) },
    token
  );
}

export function claimTicket(token: string, id: string) {
  return request<Ticket>(`/tickets/${id}/claim`, { method: "POST" }, token);
}

export function resolveTicket(
  token: string,
  id: string,
  message: string,
  files: File[]
) {
  const formData = new FormData();
  formData.append("message", message);
  files.forEach((file) => formData.append("files", file));
  return requestFormData<Ticket>(`/tickets/${id}/resolve`, formData, token);
}

export function closeTicket(token: string, id: string) {
  return request<Ticket>(`/tickets/${id}/close`, { method: "POST" }, token);
}

export function reopenTicket(token: string, id: string, reason: string) {
  return request<Ticket>(
    `/tickets/${id}/reopen`,
    { method: "POST", body: JSON.stringify({ reason }) },
    token
  );
}

export type StatsSummary = {
  total_tickets: number;
  by_status: Record<string, number>;
  total_resolved_or_closed: number;
  within_sla_count: number;
  avg_resolution_minutes: number;
  total_reopens: number;
  avg_rating_score: number;
  total_ratings: number;
};

export type Rating = {
  id: string;
  ticket_id: string;
  score: number;
  comment?: string;
  created_at: string;
};

export type Notification = {
  id: string;
  ticket_id?: string;
  recipient_id: string;
  type: string;
  title: string;
  message: string;
  channel: string;
  is_read: boolean;
  sent_at: string;
  read_at?: string;
};

export function listNotifications(token: string) {
  return request<Notification[]>("/notifications", {}, token);
}

export function markNotificationRead(token: string, id: string) {
  return request<{ ok: boolean }>(
    `/notifications/${id}/read`,
    { method: "POST" },
    token
  );
}

export type MyPerformance = {
  tickets_resolved: number;
  avg_resolution_minutes: number;
  sla_compliance_rate: number;
  current_workload: number;
};

export type StaffPerformance = {
  staff_id: string;
  staff_name: string;
  tickets_resolved: number;
  avg_resolution_minutes: number;
  sla_compliance_rate: number;
};

export function getMyPerformance(token: string) {
  return request<MyPerformance>("/stats/my-performance", {}, token);
}

export function getStaffPerformance(token: string) {
  return request<StaffPerformance[]>("/stats/staff-performance", {}, token);
}

export type TrendPoint = {
  date: string;
  created: number;
  resolved: number;
};

export function getTrend(token: string, days = 7) {
  return request<TrendPoint[]>(`/stats/trend?days=${days}`, {}, token);
}

export function getMyStatusBreakdown(token: string) {
  return request<Record<string, number>>("/stats/my-status-breakdown", {}, token);
}

export function getMyTrend(token: string, days = 7) {
  return request<TrendPoint[]>(`/stats/my-trend?days=${days}`, {}, token);
}

export function getMyPriorityBreakdown(token: string) {
  return request<Record<string, number>>("/stats/my-priority-breakdown", {}, token);
}

export function getMyCreatorStats(token: string) {
  return request<Record<string, number>>("/stats/my-creator-stats", {}, token);
}

export type CommentAttachment = {
  id: string;
  file_url: string;
  file_type?: string;
  uploaded_at: string;
};

export type TicketComment = {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  comment_type: "resolve_note" | "reopen_note" | "general_comment";
  message: string;
  created_at: string;
  attachments?: CommentAttachment[];
};

export function listComments(token: string, ticketId: string) {
  return request<TicketComment[]>(`/tickets/${ticketId}/comments`, {}, token);
}

export async function createComment(
  token: string,
  ticketId: string,
  message: string
): Promise<TicketComment> {
  return request<TicketComment>(
    `/tickets/${ticketId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
    token
  );
}

export async function uploadInlineImage(
  token: string,
  file: File
): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/uploads/inline-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  if (!res.ok) {
    throw new Error("Gagal upload gambar");
  }
  const data = await res.json();

  // Backend mengembalikan path RELATIF (misal "/uploads/xxx.jpg"), yang
  // kalau langsung dipakai di <img> akan dicari di alamat FRONTEND
  // (localhost:3000), padahal file-nya ada di backend (localhost:8080).
  // Digabung jadi URL absolut di sini, supaya gambarnya benar di mana pun
  // konten ini nanti ditampilkan (editor maupun hasil tersimpan).
  const origin = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return { url: origin + data.url };
}

export type AtRiskTicket = {
  id: string;
  title: string;
  status: string;
  sla_deadline?: string;
  is_overdue: boolean;
};

export type KPIReport = {
  total_tickets: number;
  open: number;
  in_progress: number;
  resolved: number;
  overdue: number;
  critical: number;
  avg_response_minutes: number;
  avg_resolution_minutes: number;
};

export function getKPIReport(token: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<KPIReport>(`/reports/kpi${query}`, {}, token);
}

export function getReportTrend(token: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<TrendPoint[]>(`/reports/trend${query}`, {}, token);
}

export function getPriorityBreakdown(token: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<Record<string, number>>(`/reports/priority-breakdown${query}`, {}, token);
}

export type CategoryCount = {
  category_name: string;
  count: number;
};

export function getCategoryBreakdown(token: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<CategoryCount[]>(`/reports/category-breakdown${query}`, {}, token);
}

export function getReportStaffPerformance(token: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<StaffPerformance[]>(`/reports/staff-performance${query}`, {}, token);
}

export interface AssetBorrowingStats {
  total_borrowings: number;
  active_borrowings: number;
  overdue_borrowings: number;
  returned_borrowings: number;
  handled_by_staff: number;
  avg_return_days: number;
}

export function getAssetBorrowingStats(token: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<AssetBorrowingStats>(`/reports/asset-borrowing-stats${query}`, {}, token);
}

export function getAtRiskTickets(token: string) {
  return request<AtRiskTicket[]>("/tickets/at-risk", {}, token);
}

export function getStatsSummary(token: string) {
  return request<StatsSummary>("/stats/summary", {}, token);
}

export function rateTicket(
  token: string,
  ticketId: string,
  score: number,
  comment: string
) {
  return request<Rating>(
    `/tickets/${ticketId}/rating`,
    { method: "POST", body: JSON.stringify({ score, comment }) },
    token
  );
}

// Mengembalikan null (bukan melempar error) kalau tiket belum dinilai —
// supaya pemanggil tidak perlu try/catch untuk kondisi yang sebetulnya normal.
export async function getRating(
  token: string,
  ticketId: string
): Promise<Rating | null> {
  try {
    return await request<Rating>(`/tickets/${ticketId}/rating`, {}, token);
  } catch {
    return null;
  }
}

export function reassignTicket(
  token: string,
  id: string,
  newStaffId: string,
  reason: string
) {
  return request<Ticket>(
    `/tickets/${id}/reassign`,
    {
      method: "POST",
      body: JSON.stringify({ new_staff_id: newStaffId, reason }),
    },
    token
  );
}

// --- Asset Management ---

export type AssetConditionEnum =
  | "available"
  | "borrowed"
  | "needs_repair"
  | "broken"
  | "awaiting_disposal"
  | "disposed";

export type BorrowingStatusEnum =
  | "pending_approval"
  | "approved"
  | "borrowed"
  | "returned"
  | "overdue"
  | "rejected";

export type ReturnConditionEnum = "good" | "damaged" | "lost";

export type DisposalMethodEnum = "recycle" | "donate" | "destroy" | "sell";

export type AssetCategory = {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
};

export type Asset = {
  id: string;
  category_id: string;
  category_name?: string;
  code: string;
  name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  condition: AssetConditionEnum;
  stock: number;
  location?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type AssetBorrowing = {
  id: string;
  asset_id: string;
  asset_name?: string;
  asset_code?: string;
  borrower_id: string;
  borrower_name?: string;
  quantity: number;
  borrow_date: string;
  return_deadline: string;
  actual_return_date?: string;
  return_condition?: ReturnConditionEnum;
  return_notes?: string;
  purpose: string;
  status: BorrowingStatusEnum;
  approved_by?: string;
  approver_name?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
};

export type AssetDisposal = {
  id: string;
  asset_id: string;
  asset_name?: string;
  asset_code?: string;
  reason: string;
  disposal_method: DisposalMethodEnum;
  disposed_by: string;
  disposer_name?: string;
  disposed_at: string;
  certificate_number?: string;
  notes?: string;
  created_at: string;
};

// Asset CRUD
export function listAssets(
  token: string,
  categoryId?: string,
  condition?: string,
  limit = 20,
  offset = 0
) {
  const params = new URLSearchParams();
  if (categoryId) params.set("category_id", categoryId);
  if (condition) params.set("condition", condition);
  params.set("limit", limit.toString());
  params.set("offset", offset.toString());
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<{ data: Asset[]; total: number }>(`/assets${query}`, {}, token);
}

export function getAsset(token: string, id: string) {
  return request<Asset>(`/assets/${id}`, {}, token);
}

export function createAsset(
  token: string,
  input: {
    category_id: string;
    code: string;
    name: string;
    brand?: string;
    model?: string;
    serial_number?: string;
    condition: AssetConditionEnum;
    stock: number;
    location?: string;
    notes?: string;
  }
) {
  return request<Asset>(
    "/assets",
    { method: "POST", body: JSON.stringify(input) },
    token
  );
}

export function updateAsset(
  token: string,
  id: string,
  input: {
    category_id?: string;
    code?: string;
    name?: string;
    brand?: string;
    model?: string;
    serial_number?: string;
    condition?: AssetConditionEnum;
    stock?: number;
    location?: string;
    notes?: string;
  }
) {
  return request<Asset>(
    `/assets/${id}`,
    { method: "PUT", body: JSON.stringify(input) },
    token
  );
}

export function deleteAsset(token: string, id: string) {
  return request<{ ok: boolean }>(`/assets/${id}`, { method: "DELETE" }, token);
}

// Asset Categories
export function listAssetCategories(token: string) {
  return request<AssetCategory[]>("/asset-categories", {}, token);
}

export type AvailableAsset = {
  id: string;
  code: string;
  name: string;
  category_name?: string;
  condition: AssetConditionEnum;
  stock: number;
  available_stock?: number; // stok yang benar-benar tersedia (total - sedang dipinjam)
  location?: string;
  brand?: string;
  model?: string;
};

// Asset Borrowings
export function listAvailableAssets(token: string) {
  return request<{ data: (Asset & { available_stock?: number })[] }>(
    `/assets?limit=200&offset=0`,
    {},
    token
  ).then((res) => {
    // Filter hanya aset yang tersedia untuk dipinjam dan available_stock > 0
    const assets = res.data || [];
    return assets
      .filter((a) => a.condition === "available" && (a.available_stock ?? a.stock) > 0)
      .map((a) => ({
        ...a,
        stock: a.available_stock ?? a.stock, // Override stock dengan available_stock
      })) as AvailableAsset[];
  });
}

export function borrowAsset(
  token: string,
  assetId: string,
  input: {
    quantity: number;
    borrow_date: string;
    return_deadline: string;
    purpose: string;
    notes?: string;
    borrower_name?: string;
    borrower_email?: string;
  }
) {
  return request<AssetBorrowing>(
    `/assets/${assetId}/borrow`,
    { method: "POST", body: JSON.stringify(input) },
    token
  );
}

export function listMyBorrowings(token: string, userId: string, limit = 100) {
  const params = new URLSearchParams();
  params.set("borrower_id", userId);
  params.set("limit", limit.toString());
  params.set("offset", "0");
  return request<{ data: AssetBorrowing[]; total: number }>(
    `/asset-borrowings?${params.toString()}`,
    {},
    token
  );
}

export function listBorrowings(
  token: string,
  status?: string,
  borrowerId?: string,
  limit = 20,
  offset = 0
) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (borrowerId) params.set("borrower_id", borrowerId);
  params.set("limit", limit.toString());
  params.set("offset", offset.toString());
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<{ data: AssetBorrowing[]; total: number }>(
    `/asset-borrowings${query}`,
    {},
    token
  );
}

export function approveBorrowing(token: string, id: string) {
  return request<{ status: string }>(
    `/asset-borrowings/${id}/approve`,
    { method: "POST" },
    token
  );
}

export function rejectBorrowing(token: string, id: string) {
  return request<{ status: string }>(
    `/asset-borrowings/${id}/reject`,
    { method: "POST" },
    token
  );
}

export function handoverBorrowing(token: string, id: string) {
  return request<{ status: string }>(
    `/asset-borrowings/${id}/handover`,
    { method: "POST" },
    token
  );
}

export function returnBorrowing(
  token: string,
  id: string,
  condition: ReturnConditionEnum,
  notes?: string
) {
  return request<{ status: string }>(
    `/asset-borrowings/${id}/return`,
    {
      method: "POST",
      body: JSON.stringify({
        return_condition: condition,
        return_notes: notes || "",
      }),
    },
    token
  );
}

export function getBorrowedCount(token: string) {
  return request<{ count: number }>(
    `/asset-borrowings/borrowed-count`,
    { method: "GET" },
    token
  );
}

export function listOverdueBorrowings(token: string) {
  return request<AssetBorrowing[]>("/asset-borrowings/overdue", {}, token);
}

// Asset Disposals
export function disposeAsset(
  token: string,
  assetId: string,
  input: {
    reason: string;
    disposal_method: DisposalMethodEnum;
    certificate_number?: string;
    notes?: string;
  }
) {
  return request<AssetDisposal>(
    `/assets/${assetId}/dispose`,
    { method: "POST", body: JSON.stringify(input) },
    token
  );
}

export function listDisposals(
  token: string,
  limit = 20,
  offset = 0
) {
  const params = new URLSearchParams();
  params.set("limit", limit.toString());
  params.set("offset", offset.toString());
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<{ data: AssetDisposal[]; total: number }>(
    `/asset-disposals${query}`,
    {},
    token
  );
}

export type PeriodSel = {
  period: "day" | "month" | "year";
  year: number;
  month?: number;
  day?: number;
};

export type DashboardConfig = {
  id: number;
  dashboard_name: string;
  is_public: boolean;
  show_revenue_to_public: boolean;
  allowed_roles: string[] | null;
  refresh_interval_seconds: number;
};
export type MonitoringStat = {
  total_revenue: number; total_visits: number; total_paid: number;
  total_unpaid: number; total_receivable: number;
};
export type PharmacyStats = {
  total_qty: number;
  total_revenue: number;
  total_hpp: number;
  total_retur: number;
  total_kunjungan?: number;
  jumlah_retur?: number;
};
export type PatientStats = {
  penjamin_nama: string;
  kategori_bayar?: string;
  jumlah: number;
  revenue: number;
};
export type RoomMonitoring = {
  instalasi_nama: string;
  ruangan_nama: string;
  total_tindakan: number;
  total_tarif: number;
};
export type ComponentMonitoring = {
  komponen_nama: string;
  total_komponen: number;
};
export type MonitoringTrendPoint = {
  bucket: string;
  revenue: number;
  visits: number;
};
export type DashboardPayload = {
  config?: DashboardConfig;
  stats?: MonitoringStat;
  patients?: PatientStats[] | null;
  rooms?: RoomMonitoring[] | null;
  components?: ComponentMonitoring[] | null;
  trend?: MonitoringTrendPoint[] | null;
  // FARMASI
  pharmacy_summary?: PharmacyStats | null;
  pharmacy_sales?: { obat_nama: string; kategori: string; qty_terjual: number; revenue: number }[] | null;
  drug_stock?: { obat_nama: string; kategori: string; stok_tersedia: number; stok_kadaluarsa: number; kadaluarsa_terdekat: string }[] | null;
  pharmacy_rooms?: { instalasi_nama: string; ruangan_nama: string; kunjungan: number; qty_obat: number; revenue: number }[] | null;
};

export function getMonitoring(
  token: string,
  opts?: { period?: "day" | "month" | "year"; year?: number; month?: number; day?: number }
) {
  const params = new URLSearchParams();
  if (opts?.period) params.set("period", opts.period);
  if (opts?.year) params.set("year", String(opts.year));
  if (opts?.month) params.set("month", String(opts.month));
  if (opts?.day) params.set("day", String(opts.day));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<DashboardPayload>(`/monitoring${query}`, {}, token);
}

export function getDashboardConfig(token: string) {
  return request<{ monthly_revenue_target: number }>(`/dashboard/configs/monthly-revenue-target`, {}, token);
}

export function updateDashboardConfig(token: string, monthlyRevenueTarget: number) {
  return request<{ message: string; monthly_revenue_target: number }>(
    `/dashboard/configs/monthly-revenue-target`,
    {
      method: "PUT",
      body: JSON.stringify({ monthly_revenue_target: monthlyRevenueTarget }),
    },
    token
  );
}

// Ticket soft delete — hanya admin
export function softDeleteTicket(token: string, ticketId: string, reason: string) {
  return request<{ ok: boolean }>(`/admin/tickets/${ticketId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  }, token);
}

export function listDeletedTickets(token: string) {
  return request<Ticket[]>("/admin/tickets/deleted", {}, token);
}

// ── Daily Task ──────────────────────────────────────────────────────────────
// Pekerjaan harian kecil dari WhatsApp yang tidak pernah jadi tiket resmi.
// duration_minutes & response_minutes dihitung DATABASE (generated column),
// jadi frontend hanya menampilkannya — tidak menghitung ulang.
export type DailyTask = {
  id: string;
  task_date: string;
  reporter_name: string;
  unit_id?: string | null;
  unit_name?: string;
  issue: string;
  detail?: string;
  solution?: string;
  complain_at: string;
  start_at?: string | null;
  end_at?: string | null;
  duration_minutes?: number | null;
  response_minutes?: number | null;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
};

export type DailyTaskInput = {
  task_date: string;
  reporter_name: string;
  unit_id?: string | null;
  issue: string;
  detail?: string;
  solution?: string;
  complain_at: string;
  start_at?: string | null;
  end_at?: string | null;
};

export type Unit = { id: string; name: string };

export function listUnits(token: string) {
  return request<Unit[]>(`/units`, {}, token);
}

export function listDailyTasks(
  token: string,
  filters: { from?: string; to?: string; unit_id?: string; staff_id?: string; q?: string } = {}
) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.unit_id) params.set("unit_id", filters.unit_id);
  if (filters.staff_id) params.set("staff_id", filters.staff_id);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<DailyTask[]>(`/daily-tasks${query}`, {}, token);
}

export function getDailyTask(token: string, id: string) {
  return request<DailyTask>(`/daily-tasks/${id}`, {}, token);
}

export function createDailyTask(token: string, input: DailyTaskInput) {
  return request<DailyTask>(`/daily-tasks`, {
    method: "POST",
    body: JSON.stringify(input),
  }, token);
}

export function updateDailyTask(token: string, id: string, input: DailyTaskInput) {
  return request<DailyTask>(`/daily-tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  }, token);
}

export function deleteDailyTask(token: string, id: string) {
  return request<{ message: string }>(`/daily-tasks/${id}`, { method: "DELETE" }, token);
}

// ── KPI gabungan (tiket + daily task) ───────────────────────────────────────
export type StaffKPI = {
  staff_id: string;
  staff_name: string;
  role: string;
  department?: string;
  tickets_resolved: number;
  avg_resolution_minutes: number;
  sla_compliant_count: number;
  sla_compliance_rate: number;
  reopen_count: number;
  daily_tasks: number;
  avg_daily_duration_minutes: number;
  avg_daily_response_minutes: number;
  total_work_items: number;
};

export type KPIOverview = {
  from?: string;
  to?: string;
  total_tickets: number;
  tickets_resolved: number;
  total_daily_tasks: number;
  total_work_items: number;
  avg_ticket_resolution_minutes: number;
  avg_daily_duration_minutes: number;
  avg_daily_response_minutes: number;
  per_unit: { unit_name: string; count: number }[];
};

/**
 * Balasan KPI membawa cakupan yang ditentukan SERVER, bukan UI.
 * can_view_all=false berarti server memaksa laporan ke staf yang login
 * (staff_it), scope_staff_id berisi id orang itu — frontend memakai nilai ini
 * untuk menyembunyikan dropdown staf, supaya penyaringan tidak ditawarkan
 * padahal server akan mengabaikannya.
 */
export type StaffKPIPayload = {
  overview: KPIOverview;
  staff: StaffKPI[];
  can_view_all?: boolean;
  scope_staff_id?: string;
};

/**
 * Rincian pekerjaan satu staf untuk laporan cetak. Angka ringkas tetap dari
 * StaffKPI supaya jumlah baris rincian selalu cocok dengan kolom "Tiket
 * Selesai" / "Daily Task" pada tabel ringkasan.
 */
export type KPITicketRow = {
  ticket_code: string;
  title: string;
  category_name: string;
  priority: string;
  status: string;
  claimed_at?: string;
  resolved_at?: string;
  minutes: number;
  sla_compliant: boolean;
};

export type KPIDailyRow = {
  task_date: string;
  reporter_name: string;
  unit_name: string;
  issue: string;
  detail: string;
  solution: string;
  complain_at: string;
  start_at?: string;
  end_at?: string;
  response_minutes?: number;
  duration_minutes?: number;
};

export type StaffKPIDetail = {
  staff: StaffKPI;
  tickets: KPITicketRow[];
  daily_tasks: KPIDailyRow[];
};

export type StaffKPIDetailPayload = {
  overview: KPIOverview;
  details: StaffKPIDetail[];
  can_view_all?: boolean;
  scope_staff_id?: string;
};

export function getStaffKPIDetail(token: string, from?: string, to?: string, staffId?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (staffId) params.set("staff_id", staffId);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<StaffKPIDetailPayload>(`/reports/kpi/detail${query}`, {}, token);
}

export function getStaffKPI(token: string, from?: string, to?: string, staffId?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (staffId) params.set("staff_id", staffId);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<StaffKPIPayload>(`/reports/kpi/staff${query}`, {}, token);
}

/**
 * Unduh CSV lewat fetch (bukan <a href>) karena endpoint butuh header
 * Authorization. Token disimpan di memori → file blob dibuat → link
 * diklik program → blob dilepas. Token TIDAK pernah masuk URL/log server.
 */
export async function downloadKPIExport(
  token: string,
  from?: string,
  to?: string,
  staffId?: string
) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (staffId) params.set("staff_id", staffId);
  const query = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`${API_BASE_URL}/reports/kpi/export${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = "Gagal mengunduh laporan";
    try {
      const data = await res.json();
      // Backend memakai field "error" (lihat helper request() di atas).
      if (data?.error) msg = data.error;
      else if (data?.message) msg = data.message;
    } catch {
      /* respons bukan JSON — pakai pesan default */
    }
    throw new Error(msg);
  }

  // Nama file diambil dari header Content-Disposition supaya periode dan
  // nama staf di file sama dengan yang dipilih di halaman.
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : "laporan-kpi.csv";

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
