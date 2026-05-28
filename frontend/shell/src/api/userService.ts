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
  return res.json() as Promise<T>;
}

export interface Apartment {
  id: string;
  society_id: string;
  block: string;
  unit_number: string;
  type: string;
}

export interface DbUser {
  id: string;
  apartment_id: string | null;
  apartment: Pick<Apartment, 'id' | 'block' | 'unit_number' | 'type'> | null;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  keycloak_sub: string;
  identity_provider: string;
  is_active: boolean;
  created_at: string;
}

export interface UserListResponse {
  total: number;
  items: DbUser[];
}

export const userService = {
  /** Upsert local DB row from JWT on first login. */
  sync: (token: string) =>
    apiFetch<DbUser>('/users/sync', token, { method: 'POST' }),

  me: (token: string) =>
    apiFetch<DbUser>('/users/me', token),

  update: (token: string, data: { name?: string; phone?: string }) =>
    apiFetch<DbUser>('/users/me', token, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  assignApartment: (token: string, apartment_id: string) =>
    apiFetch<DbUser>('/users/me/apartment', token, {
      method: 'PUT',
      body: JSON.stringify({ apartment_id }),
    }),

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
};
