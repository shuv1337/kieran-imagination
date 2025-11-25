import React, { useEffect, useState } from 'react';
import { getStats, type Stats } from '../services/api';

const StatCard: React.FC<{ label: string; value: number | string; color: string }> = ({ label, value, color }) => (
    <div className={`${color} rounded-xl p-6 text-white`}>
        <p className="text-sm opacity-80">{label}</p>
        <p className="text-3xl font-bold mt-2">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
);

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await getStats();
                setStats(data);
            } catch (err) {
                setError('Failed to load stats');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return <div className="text-center py-12">Loading...</div>;
    }

    if (error) {
        return <div className="text-center py-12 text-red-600">{error}</div>;
    }

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <StatCard
                    label="Total Requests"
                    value={stats?.totalRequests ?? 0}
                    color="bg-blue-600"
                />
                <StatCard
                    label="Requests Today"
                    value={stats?.todayRequests ?? 0}
                    color="bg-green-600"
                />
                <StatCard
                    label="Total Images"
                    value={stats?.totalImages ?? 0}
                    color="bg-purple-600"
                />
                <StatCard
                    label="Unique IPs (Week)"
                    value={stats?.uniqueIpsWeek ?? 0}
                    color="bg-orange-600"
                />
                <StatCard
                    label="Rate Limited Today"
                    value={stats?.rateLimitedToday ?? 0}
                    color="bg-red-600"
                />
            </div>
        </div>
    );
};

export default Dashboard;
