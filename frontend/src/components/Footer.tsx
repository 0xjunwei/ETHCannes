import React from 'react';
import { Github, Twitter } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-slate-900 py-8 px-6 border-t border-slate-800">
      <div className="max-w-screen-xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px]">
            <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center">
              <span className="text-white font-bold text-xl">FC</span>
            </div>
          </div>
          <span className="text-white font-bold text-xl">Full Circle</span>
        </div>
        
        <div className="text-slate-400 text-sm text-center md:text-left">
          © {new Date().getFullYear()} Full Circle. All rights reserved.
          <div className="mt-1">Pay for gas with USDC across multiple chains.</div>
        </div>
        
        <div className="flex items-center gap-4">
          <a href="#" className="text-slate-400 hover:text-white transition-colors">
            <Twitter size={20} />
          </a>
          <a href="#" className="text-slate-400 hover:text-white transition-colors">
            <Github size={20} />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
