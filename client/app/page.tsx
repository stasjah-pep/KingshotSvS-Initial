'use client';
import Layout from '../components/Layout';
import GridMap from '../components/GridMap';
import ChatPanel from '../components/ChatPanel';
import RallyTimers from '../components/RallyTimers';
import { useSoundEffects } from '../hooks/useSoundEffects';

export default function Home() {
  useSoundEffects();

  return (
    <Layout>
      <div className="flex flex-col h-full w-full relative">
        {/* Map Area */}
        <div className="flex-1 relative overflow-hidden bg-black/80">
           {/* Background Grid Texture could go here */}
           <div className="absolute inset-0 bg-[radial-gradient(rgba(44,18,33,0.4)_2px,transparent_2px)] [background-size:30px_30px] opacity-20 pointer-events-none" />

           <GridMap />

           {/* Overlays */}
           <RallyTimers />
        </div>

        {/* Bottom Panel (Chat) */}
        <div className="flex-none z-40 relative">
          <ChatPanel />
        </div>
      </div>
    </Layout>
  );
}
