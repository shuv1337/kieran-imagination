import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({ 
  isOpen, 
  onClose, 
  title = "Oops!", 
  message 
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          
          {/* Modal */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: "spring", bounce: 0.4 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-slate-900/95 border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl ring-1 ring-white/20 max-w-md w-full"
          >
            {/* Decorative glow */}
            <div className="absolute -top-10 -left-10 w-32 h-32 bg-red-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-orange-500/20 rounded-full blur-3xl pointer-events-none" />
            
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            
            {/* Content */}
            <div className="relative z-10 flex flex-col items-center text-center gap-4">
              {/* Icon */}
              <motion.div
                initial={{ rotate: -10 }}
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="p-4 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-2xl border border-red-500/30"
              >
                <AlertTriangle size={40} className="text-orange-400" />
              </motion.div>
              
              {/* Title */}
              <h2 className="text-2xl md:text-3xl font-comic font-bold text-white">
                {title}
              </h2>
              
              {/* Message */}
              <p className="text-slate-300 text-lg leading-relaxed">
                {message}
              </p>
              
              {/* Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="mt-4 px-8 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-full text-white font-bold text-lg shadow-lg hover:shadow-indigo-500/50 transition-shadow"
              >
                Got it!
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
