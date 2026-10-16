import React from 'react';
import dbiIcon from '../assets/dbi-icon.png';

interface DbiLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const DbiLogo: React.FC<DbiLogoProps> = ({ className = '', size = 'md' }) => {
  const iconSizes = {
    sm: 'h-7 w-7 sm:h-8 sm:w-8',
    md: 'h-9 w-9 sm:h-10 sm:w-10',
    lg: 'h-11 w-11 sm:h-14 sm:w-14'
  };

  const textStyles = {
    sm: {
      digitalBook: 'text-[9.5px] sm:text-[11px] tracking-tight',
      ofIndia: 'text-[11.5px] sm:text-[13px] tracking-tight',
      bar: 'h-[1.5px] sm:h-[2px] w-8 sm:w-10 my-0.5',
      tagline: 'text-[5.5px] sm:text-[6.5px] tracking-[0.14em]'
    },
    md: {
      digitalBook: 'text-[10.5px] sm:text-[12.5px] tracking-tight',
      ofIndia: 'text-[12.5px] sm:text-[15px] tracking-tight',
      bar: 'h-[2px] sm:h-[2.5px] w-9 sm:w-11 my-0.5',
      tagline: 'text-[6px] sm:text-[7.5px] tracking-[0.16em]'
    },
    lg: {
      digitalBook: 'text-[12px] sm:text-[15px] tracking-tight',
      ofIndia: 'text-[14.5px] sm:text-[18px] tracking-tight',
      bar: 'h-[2px] sm:h-[2.5px] w-10 sm:w-14 my-0.5 sm:my-1',
      tagline: 'text-[6.5px] sm:text-[8.5px] tracking-[0.14em] sm:tracking-[0.2em]'
    }
  };

  const s = textStyles[size];

  return (
    <div className={`inline-flex items-center gap-2 sm:gap-2.5 select-none shrink-0 ${className}`}>
      <img
        src={dbiIcon}
        alt="Digital Book of India"
        className={`${iconSizes[size]} object-contain shrink-0`}
      />
      <div className="flex flex-col justify-center leading-none">
        <span className={`font-black text-[#0B1528] uppercase leading-none font-sans whitespace-nowrap ${s.digitalBook}`}>
          DIGITAL BOOK
        </span>
        <span className={`font-black text-[#0062FF] uppercase leading-tight font-sans mt-0.5 whitespace-nowrap ${s.ofIndia}`}>
          OF INDIA
        </span>
        <div className={`bg-gradient-to-r from-[#FF6B00] via-[#FF7A00] to-[#FFA000] rounded-full ${s.bar}`} />
        <div className={`font-extrabold text-[#526077] uppercase flex items-center gap-1 leading-none whitespace-nowrap ${s.tagline}`}>
          <span>FIND</span>
          <span className="text-[#FF6B00] font-black text-[0.8em]">•</span>
          <span>CONNECT</span>
          <span className="text-[#FF6B00] font-black text-[0.8em]">•</span>
          <span>GROW</span>
        </div>
      </div>
    </div>
  );
};
