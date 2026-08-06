import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

// Test component to verify mobile-first responsive foundation
const TestMobileComponent = () => {
  return (
    <div className="mobile-container">
      <h1 className="text-mobile-2xl mobile-my-lg">Mobile Test</h1>
      <button className="touch-target-min mobile-p-md mobile-rounded-lg mobile-focus-ring touch-manipulation">
        Touch Button
      </button>
      <div className="mobile-px-lg mobile-py-md">
        <p className="text-mobile-base">Mobile optimized text</p>
      </div>
    </div>
  );
};

describe('Mobile Foundation', () => {
  it('renders mobile-optimized component without errors', () => {
    const { container } = render(<TestMobileComponent />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies mobile container class correctly', () => {
    const { container } = render(<TestMobileComponent />);
    const mobileContainer = container.querySelector('.mobile-container');
    expect(mobileContainer).toBeInTheDocument();
  });

  it('applies touch-friendly button classes', () => {
    const { container } = render(<TestMobileComponent />);
    const button = container.querySelector('button');
    expect(button).toHaveClass('touch-target-min');
    expect(button).toHaveClass('touch-manipulation');
    expect(button).toHaveClass('mobile-focus-ring');
  });

  it('applies mobile typography classes', () => {
    const { container } = render(<TestMobileComponent />);
    const heading = container.querySelector('h1');
    const paragraph = container.querySelector('p');
    
    expect(heading).toHaveClass('text-mobile-2xl');
    expect(paragraph).toHaveClass('text-mobile-base');
  });

  it('applies mobile spacing classes', () => {
    const { container } = render(<TestMobileComponent />);
    const heading = container.querySelector('h1');
    const button = container.querySelector('button');
    const innerDiv = container.querySelector('.mobile-container > div');
    
    expect(heading).toHaveClass('mobile-my-lg');
    expect(button).toHaveClass('mobile-p-md');
    expect(innerDiv).toHaveClass('mobile-px-lg');
    expect(innerDiv).toHaveClass('mobile-py-md');
  });
});