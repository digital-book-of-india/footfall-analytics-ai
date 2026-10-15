const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export async function adminFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.reload();
    throw new Error('Access forbidden or session expired');
  }

  const json = await res.json();
  if (!json.success && json.success !== undefined) {
    throw new Error(json.error?.message || 'API request failed');
  }

  const payload = json.data !== undefined ? json.data : json;

  // Auto-normalize array responses into standard paginated structure if expected
  if (Array.isArray(payload)) {
    return {
      items: payload,
      total: payload.length,
      page: 1,
      limit: payload.length
    } as unknown as T;
  }

  // Ensure items array always exists if backend uses a different key name
  if (payload && typeof payload === 'object') {
    if (!payload.items) {
      payload.items = payload.shops || payload.owners || payload.cameras || payload.logs || [];
    }
    if (payload.total === undefined && Array.isArray(payload.items)) {
      payload.total = payload.items.length;
    }
  }

  return payload as T;
}
