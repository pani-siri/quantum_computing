import React from 'react';

const AbstractBackground: React.FC = () => {
  return (
    <>
      {/* Decorative background elements */}
      <div className="figma-shape figma-shape-1 animate-float"></div>
      <div className="figma-shape figma-shape-2 animate-float" style={{ animationDelay: '1s'}}></div>
      <div className="figma-shape figma-shape-3 animate-float" style={{ animationDelay: '2s'}}></div>
      <div className="figma-shape figma-shape-4 animate-float" style={{ animationDelay: '3s'}}></div>
    </>
  );
};

export default AbstractBackground;
