import React, { useEffect, useState } from 'react';
import { getIpTrends, type IpTrend } from '../services/api';

const timeRanges = [
    { label: '24 Hours', value: Date.now() - 86400000 },
    { label: '7 Days', value: Date.now() - 604800000 },
    { label: '30 Days', value: Date.now() - 2592000000 },
    { label: 'All Time', value: 0 },
];

const IpTrends: React.FC = () => {
    const [trends, setTrends] = useState<IpTrend[]>([]);
    const [loading, setLoading] = useState(true);
    const [since, setSince] = useState(timeRanges[0].value);

    useEffect(() => {
        const fetchTrends = async () => {
            setLoading(true);
            try {
                const data = await getIpTrends(100, since);
                setTrends(data.ipTrends);
            } catch (err) {
                console.error('Failed to load IP trends:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchTrends();
    }, [since]);

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">IP Trends</h2>
                <div className="flex gap-2">
                    {timeRanges.map((range) => (
                        <button
                            key={range.label}
                            onClick={() => setSince(range.value)}
                            className={`px-4 py-2 rounded-lg text-sm ${
                                since === range.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 hover:bg-gray-300'
                            }`}
                        >
                            {range.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12">Loading...</div>
            ) : (
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requests</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate Limited</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">First Seen</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {trends.map((trend) => (
                                <tr key={trend.ip_address} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-mono text-sm">{trend.ip_address}</td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            {trend.request_count}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {trend.rate_limited_count > 0 ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                {trend.rate_limited_count}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">0</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(trend.first_seen)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(trend.last_seen)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {trends.length === 0 && (
                        <div className="text-center py-12 text-gray-500">No data available</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default IpTrends;
