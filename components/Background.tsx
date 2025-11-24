import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Background: React.FC = () => {
  // Hydration fix: only render stars on client
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="fixed inset-0 bg-[#0f172a] -z-50" />;

  const stars = Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 3 + 2,
    delay: Math.random() * 2,
  }));

  return (
    <div className="fixed inset-0 -z-50 overflow-hidden pointer-events-none bg-[#0f172a]">
      {/* Radial Gradients for "Glow" */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[120px] translate-x-1/2 translate-y-1/2" />

      {/* Twinkling Stars */}
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
          }}
          animate={{
            opacity: [0.2, 1, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: star.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: star.delay,
          }}
        />
      ))}
      
      {/* Floating Dust Particles */}
       {Array.from({ length: 20 }).map((_, i) => (
        <motion.div
          key={`dust-${i}`}
          className="absolute rounded-full bg-blue-300/30"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            width: Math.random() * 4 + 2,
            height: Math.random() * 4 + 2,
          }}
          animate={{
            y: [0, -100, 0],
            x: [0, 50, 0],
            opacity: [0, 0.5, 0],
          }}
          transition={{
            duration: Math.random() * 10 + 10,
            repeat: Infinity,
            ease: "linear",
          }}
        />
       ))}
    </div>
  );
};

export default Background;
