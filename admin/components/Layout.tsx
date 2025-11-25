import React from 'react';
import type { View } from '../App';

interface LayoutProps {
    children: React.ReactNode;
    currentView: View;
    onNavigate: (view: View) => void;
}

const navItems: { view: View; label: string; icon: string }[] = [
    { view: 'dashboard', label: 'Dashboard', icon: '📊' },
    { view: 'ip-trends', label: 'IP Trends', icon: '🌐' },
    { view: 'prompts', label: 'Prompts', icon: '💬' },
    { view: 'images', label: 'Images', icon: '🖼️' },
    { view: 'logs', label: 'Logs', icon: '📋' },
];

const Layout: React.FC<LayoutProps> = ({ children, currentView, onNavigate }) => {
    return (
        <div className="min-h-screen flex">
            <aside className="w-64 bg-gray-900 text-white">
                <div className="p-4 border-b border-gray-700">
                    <h1 className="text-xl font-bold">Admin Panel</h1>
                    <p className="text-sm text-gray-400">Kieran's Imagination</p>
                </div>
                <nav className="p-4">
                    <ul className="space-y-2">
                        {navItems.map(({ view, label, icon }) => (
                            <li key={view}>
                                <button
                                    onClick={() => onNavigate(view)}
                                    className={`w-full text-left px-4 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                                        currentView === view
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-300 hover:bg-gray-800'
                                    }`}
                                >
                                    <span>{icon}</span>
                                    {label}
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>
            <main className="flex-1 p-8 overflow-auto">
                {children}
            </main>
        </div>
    );
};

export default Layout;
