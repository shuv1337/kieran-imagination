const API_BASE = '/admin/api';

export interface Stats {
    totalRequests: number;
    todayRequests: number;
    totalImages: number;
    uniqueIpsWeek: number;
    rateLimitedToday: number;
}

export interface IpTrend {
    ip_address: string;
    request_count: number;
    rate_limited_count: number;
    last_seen: number;
    first_seen: number;
}

export interface PromptEntry {
    id: string;
    timestamp: number;
    ip_address: string;
    prompt: string;
    status_code: number;
    generated_image_id: string | null;
    r2_key: string | null;
}

export interface ImageEntry {
    id: string;
    file_name: string;
    prompt: string;
    r2_key: string;
    created_at: number;
    source: string;
    metadata: string | null;
    publicUrl: string;
}

export interface LogEntry {
    id: string;
    timestamp: number;
    ip_address: string;
    endpoint: string;
    method: string;
    status_code: number;
    duration_ms: number | null;
    prompt: string | null;
    error_message: string | null;
    user_agent: string | null;
    rate_limited: number;
    generated_image_id: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

export async function getStats(): Promise<Stats> {
    return fetchJson<Stats>(`${API_BASE}/stats`);
}

export async function getIpTrends(limit = 50, since = 0): Promise<{ ipTrends: IpTrend[] }> {
    return fetchJson(`${API_BASE}/ip-trends?limit=${limit}&since=${since}`);
}

export async function getPrompts(limit = 50, offset = 0, search = ''): Promise<{ prompts: PromptEntry[] }> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set('search', search);
    return fetchJson(`${API_BASE}/prompts?${params}`);
}

export async function getImages(limit = 50, offset = 0, source?: string): Promise<{ images: ImageEntry[] }> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (source) params.set('source', source);
    return fetchJson(`${API_BASE}/images?${params}`);
}

export async function getLogs(
    limit = 100,
    offset = 0,
    filters?: { endpoint?: string; status?: string; ip?: string }
): Promise<{ logs: LogEntry[] }> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filters?.endpoint) params.set('endpoint', filters.endpoint);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.ip) params.set('ip', filters.ip);
    return fetchJson(`${API_BASE}/logs?${params}`);
}
