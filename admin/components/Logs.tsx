import React, { useEffect, useState, useCallback } from 'react';
import { getLogs, type LogEntry } from '../services/api';

const endpoints = [
    { label: 'All', value: '' },
    { label: '/api/generate', value: '/api/generate' },
    { label: '/api/edit', value: '/api/edit' },
    { label: '/api/upscale', value: '/api/upscale' },
    { label: '/api/suggestions', value: '/api/suggestions' },
    { label: '/api/images', value: '/api/images' },
    { label: '/api/images/view', value: '/api/images/view' },
];

const Logs: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ endpoint: '', status: '', ip: '' });
    const [offset, setOffset] = useState(0);
    const limit = 100;

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getLogs(limit, offset, {
                endpoint: filters.endpoint || undefined,
                status: filters.status || undefined,
                ip: filters.ip || undefined,
            });
            setLogs(data.logs);
        } catch (err) {
            console.error('Failed to load logs:', err);
        } finally {
            setLoading(false);
        }
    }, [offset, filters]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    const getStatusBadge = (status: number) => {
        if (status >= 200 && status < 300) {
            return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">{status}</span>;
        } else if (status === 429) {
            return <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">{status}</span>;
        } else if (status >= 400 && status < 500) {
            return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">{status}</span>;
        } else {
            return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">{status}</span>;
        }
    };

    const getMethodBadge = (method: string) => {
        const colors: Record<string, string> = {
            GET: 'bg-blue-100 text-blue-800',
            POST: 'bg-green-100 text-green-800',
            PUT: 'bg-yellow-100 text-yellow-800',
            DELETE: 'bg-red-100 text-red-800',
        };
        return (
            <span className={`px-2 py-1 text-xs rounded-full ${colors[method] || 'bg-gray-100 text-gray-800'}`}>
                {method}
            </span>
        );
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Request Logs</h2>

            <div className="bg-white rounded-xl shadow p-4 mb-4">
                <div className="flex flex-wrap gap-4">
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">Endpoint</label>
                        <select
                            value={filters.endpoint}
                            onChange={(e) => {
                                setFilters({ ...filters, endpoint: e.target.value });
                                setOffset(0);
                            }}
                            className="px-3 py-2 border rounded-lg"
                        >
                            {endpoints.map((ep) => (
                                <option key={ep.value} value={ep.value}>
                                    {ep.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">Status</label>
                        <select
                            value={filters.status}
                            onChange={(e) => {
                                setFilters({ ...filters, status: e.target.value });
                                setOffset(0);
                            }}
                            className="px-3 py-2 border rounded-lg"
                        >
                            <option value="">All</option>
                            <option value="200">200 OK</option>
                            <option value="400">400 Bad Request</option>
                            <option value="429">429 Rate Limited</option>
                            <option value="500">500 Server Error</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 mb-1">IP Address</label>
                        <input
                            type="text"
                            value={filters.ip}
                            onChange={(e) => setFilters({ ...filters, ip: e.target.value })}
                            onBlur={() => setOffset(0)}
                            placeholder="Filter by IP"
                            className="px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={() => {
                                setFilters({ endpoint: '', status: '', ip: '' });
                                setOffset(0);
                            }}
                            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                        >
                            Clear Filters
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12">Loading...</div>
            ) : (
                <>
                    <div className="bg-white rounded-xl shadow overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Endpoint</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                                                {formatDate(log.timestamp)}
                                            </td>
                                            <td className="px-4 py-3">{getMethodBadge(log.method)}</td>
                                            <td className="px-4 py-3 text-sm font-mono">{log.endpoint}</td>
                                            <td className="px-4 py-3">{getStatusBadge(log.status_code)}</td>
                                            <td className="px-4 py-3 font-mono text-sm">{log.ip_address}</td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {log.duration_ms != null ? `${log.duration_ms}ms` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {log.error_message && (
                                                    <span className="text-red-600" title={log.error_message}>
                                                        Error
                                                    </span>
                                                )}
                                                {log.rate_limited === 1 && (
                                                    <span className="text-orange-600">Rate Limited</span>
                                                )}
                                                {log.prompt && (
                                                    <span className="text-gray-500 truncate max-w-[150px] inline-block" title={log.prompt}>
                                                        {log.prompt.substring(0, 30)}...
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {logs.length === 0 && (
                            <div className="text-center py-12 text-gray-500">No logs found</div>
                        )}
                    </div>

                    <div className="flex justify-between items-center mt-4">
                        <button
                            onClick={() => setOffset(Math.max(0, offset - limit))}
                            disabled={offset === 0}
                            className="px-4 py-2 bg-gray-200 rounded-lg disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="text-sm text-gray-500">
                            Showing {offset + 1} - {offset + logs.length}
                        </span>
                        <button
                            onClick={() => setOffset(offset + limit)}
                            disabled={logs.length < limit}
                            className="px-4 py-2 bg-gray-200 rounded-lg disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default Logs;
