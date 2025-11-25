import React, { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import IpTrends from './components/IpTrends';
import Prompts from './components/Prompts';
import Images from './components/Images';
import Logs from './components/Logs';

export type View = 'dashboard' | 'ip-trends' | 'prompts' | 'images' | 'logs';

const App: React.FC = () => {
    const [view, setView] = useState<View>('dashboard');

    const renderView = () => {
        switch (view) {
            case 'dashboard':
                return <Dashboard />;
            case 'ip-trends':
                return <IpTrends />;
            case 'prompts':
                return <Prompts />;
            case 'images':
                return <Images />;
            case 'logs':
                return <Logs />;
        }
    };

    return (
        <Layout currentView={view} onNavigate={setView}>
            {renderView()}
        </Layout>
    );
};

export default App;
