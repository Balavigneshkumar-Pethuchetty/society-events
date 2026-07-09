// Points at nginx on port 8080 when Vite dev server is on 3000; same origin otherwise.
const BASE =
  window.location.port === '3000'
    ? `${window.location.protocol}//${window.location.hostname}:8080/api/users`
    : `${window.location.origin}/api/users`;

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export interface ApartmentBrief {
  id: string;
  block: string;
  unit_number: string;
  type: string;
}

export interface Apartment extends ApartmentBrief {
  society_id: string;
}

export interface DbUser {
  id: string;
  apartments: ApartmentBrief[];
  name: string;
  email: string;
  phone: string | null;
  role: string;
  keycloak_sub: string;
  identity_provider: string;
  is_active: boolean;
  created_at: string;
  structure_node_id?: string | null;
  unit_node_ids: string[];
}

export interface StructureNode {
  id: string;
  name: string;
  level_index: number;
  level_name: string;
  parent_id: string | null;
}

export interface UnitRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
  node_id: string;
  notes: string | null;
  type: 'add' | 'remove';
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface UserListResponse {
  total: number;
  items: DbUser[];
}

async function publicPost(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
}

export interface NotificationItem {
  id: string;
  event_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  unread_count: number;
  total: number;
  items: NotificationItem[];
}

export const userService = {
  /** Upsert local DB row from JWT on first login. */
  sync: (token: string) =>
    apiFetch<DbUser>('/users/sync', token, { method: 'POST' }),

  me: (token: string) =>
    apiFetch<DbUser>('/users/me', token),

  // phone: null explicitly clears the number on file (frees it up for another resident to
  // register with) — omitting the key entirely leaves it untouched.
  update: (token: string, data: { name?: string; phone?: string | null }) =>
    apiFetch<DbUser>('/users/me', token, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  addApartment: (token: string, apartment_id: string) =>
    apiFetch<DbUser>('/users/me/apartments', token, {
      method: 'POST',
      body: JSON.stringify({ apartment_id }),
    }),

  removeApartment: (token: string, apartment_id: string) =>
    apiFetch<DbUser>(`/users/me/apartments/${apartment_id}`, token, { method: 'DELETE' }),

  listApartments: (token: string) =>
    apiFetch<Apartment[]>('/users/apartments/list', token),

  listUsers: (token: string, params?: { active?: boolean; role?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.active !== undefined) qs.set('active', String(params.active));
    if (params?.role)   qs.set('role', params.role);
    if (params?.limit)  qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return apiFetch<UserListResponse>(`/users${query}`, token);
  },

  approveUser: (token: string, userId: string, role: string) =>
    apiFetch<DbUser>(`/users/${userId}/approve`, token, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  rejectUser: (token: string, userId: string) =>
    apiFetch<void>(`/users/${userId}/reject`, token, { method: 'DELETE' }),

  forgotPassword: (email: string) =>
    publicPost('/users/forgot-password', { email }),

  notifications: {
    list: (token: string, params?: { unread?: boolean; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.unread !== undefined) qs.set('unread', String(params.unread));
      if (params?.limit)  qs.set('limit',  String(params.limit));
      if (params?.offset) qs.set('offset', String(params.offset));
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch<NotificationListResponse>(`/notifications${query}`, token);
    },
    markRead: (token: string, id: string) =>
      apiFetch<void>(`/notifications/${id}/read`, token, { method: 'PATCH' }),
    markAllRead: (token: string) =>
      apiFetch<void>('/notifications/read-all', token, { method: 'PATCH' }),
  },

  buildingNodes: (token: string) =>
    apiFetch<StructureNode[]>('/building/nodes', token),

  /** Self-service: add or remove own flats directly (no approval needed) */
  units: {
    add: (token: string, node_id: string) =>
      apiFetch<DbUser>('/users/me/units', token, {
        method: 'POST',
        body: JSON.stringify({ node_id }),
      }),
    remove: (token: string, node_id: string) =>
      apiFetch<DbUser>(`/users/me/units/${node_id}`, token, { method: 'DELETE' }),
  },

  unitRequests: {
    list: (token: string, status?: string) => {
      const qs = status ? `?status=${status}` : '';
      return apiFetch<UnitRequest[]>(`/building/unit-requests${qs}`, token);
    },
    create: (token: string, node_id: string, notes?: string, type: 'add' | 'remove' = 'add') =>
      apiFetch<UnitRequest>('/building/unit-requests', token, {
        method: 'POST',
        body: JSON.stringify({ node_id, notes: notes ?? null, type }),
      }),
    review: (token: string, id: string, status: 'approved' | 'rejected') =>
      apiFetch<UnitRequest>(`/building/unit-requests/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
  },

  /** Admin/committee: manage any user's flat assignments */
  adminUnits: {
    add: (token: string, userId: string, node_id: string) =>
      apiFetch<{ ok: boolean }>(`/building/users/${userId}/units`, token, {
        method: 'POST',
        body: JSON.stringify({ node_id }),
      }),
    remove: (token: string, userId: string, node_id: string) =>
      apiFetch<void>(`/building/users/${userId}/units/${node_id}`, token, { method: 'DELETE' }),
  },
};
