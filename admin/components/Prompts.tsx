import React, { useEffect, useState, useCallback } from 'react';
import { getPrompts, type PromptEntry } from '../services/api';

const Prompts: React.FC = () => {
    const [prompts, setPrompts] = useState<PromptEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [offset, setOffset] = useState(0);
    const limit = 50;

    const fetchPrompts = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getPrompts(limit, offset, search);
            setPrompts(data.prompts);
        } catch (err) {
            console.error('Failed to load prompts:', err);
        } finally {
            setLoading(false);
        }
    }, [offset, search]);

    useEffect(() => {
        fetchPrompts();
    }, [fetchPrompts]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setOffset(0);
        fetchPrompts();
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    const getStatusBadge = (status: number) => {
        if (status >= 200 && status < 300) {
            return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">{status}</span>;
        } else if (status >= 400 && status < 500) {
            return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">{status}</span>;
        } else {
            return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">{status}</span>;
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Prompts</h2>
                <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search prompts..."
                        className="px-4 py-2 border rounded-lg w-64"
                    />
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Search
                    </button>
                </form>
            </div>

            {loading ? (
                <div className="text-center py-12">Loading...</div>
            ) : (
                <>
                    <div className="bg-white rounded-xl shadow overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prompt</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {prompts.map((prompt) => (
                                    <tr key={prompt.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                                            {formatDate(prompt.timestamp)}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm">{prompt.ip_address}</td>
                                        <td className="px-6 py-4 text-sm max-w-md truncate" title={prompt.prompt}>
                                            {prompt.prompt}
                                        </td>
                                        <td className="px-6 py-4">{getStatusBadge(prompt.status_code)}</td>
                                        <td className="px-6 py-4">
                                            {prompt.r2_key && (
                                                <a
                                                    href={`/api/images/view?key=${encodeURIComponent(prompt.r2_key)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:underline text-sm"
                                                >
                                                    View
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {prompts.length === 0 && (
                            <div className="text-center py-12 text-gray-500">No prompts found</div>
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
                            Showing {offset + 1} - {offset + prompts.length}
                        </span>
                        <button
                            onClick={() => setOffset(offset + limit)}
                            disabled={prompts.length < limit}
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

export default Prompts;
