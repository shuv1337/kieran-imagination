import React from 'react';
import { motion } from 'framer-motion';
import { Palette, CreditCard, Flame } from 'lucide-react';

interface NavigationProps {
  currentPath?: string;
}

const NAV_ITEMS = [
  {
    path: '/',
    label: 'Coloring Pages',
    icon: Palette,
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    path: '/cards',
    label: 'Trading Cards',
    icon: CreditCard,
    gradient: 'from-yellow-500 to-orange-500',
  },
  {
    path: '/hot',
    label: 'Hot or Not',
    icon: Flame,
    gradient: 'from-red-500 to-orange-500',
  },
];

export const Navigation: React.FC<NavigationProps> = ({ currentPath }) => {
  const activePath = currentPath || window.location.pathname;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50 px-4 py-2 md:relative md:border-t-0 md:bg-transparent md:py-0">
      <div className="flex items-center justify-center gap-2 md:gap-4 max-w-md mx-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = activePath === item.path || 
            (item.path === '/' && activePath === '') ||
            (item.path === '/cards' && activePath.startsWith('/cards'));
          const Icon = item.icon;

          return (
            <motion.a
              key={item.path}
              href={item.path}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`
                flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all
                ${isActive 
                  ? `bg-gradient-to-r ${item.gradient} text-white shadow-lg` 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium hidden sm:block">{item.label}</span>
            </motion.a>
          );
        })}
      </div>
    </nav>
  );
};

export default Navigation;
