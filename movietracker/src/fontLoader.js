// Import font files as modules to get the correct hashed URLs
import razedBoldUrl from './assets/razed_bold.ttf?url';
import razedLightUrl from './assets/razed_light.ttf?url';
import razedTrendUrl from './assets/razed_trend.ttf?url';

// Import SF Pro fonts - using Text variants for body text and Display for headings
import sfProTextLightUrl from './assets/SF-Pro-Text-Light.otf?url';
import sfProTextRegularUrl from './assets/SF-Pro-Text-Regular.otf?url';
import sfProTextMediumUrl from './assets/SF-Pro-Text-Medium.otf?url';
import sfProTextSemiboldUrl from './assets/SF-Pro-Text-Semibold.otf?url';
import sfProTextBoldUrl from './assets/SF-Pro-Text-Bold.otf?url';

import sfProDisplayLightUrl from './assets/SF-Pro-Display-Light.otf?url';
import sfProDisplayRegularUrl from './assets/SF-Pro-Display-Regular.otf?url';
import sfProDisplayMediumUrl from './assets/SF-Pro-Display-Medium.otf?url';
import sfProDisplaySemiboldUrl from './assets/SF-Pro-Display-Semibold.otf?url';
import sfProDisplayBoldUrl from './assets/SF-Pro-Display-Bold.otf?url';

// Function to create and inject font-face declarations
export function loadFonts() {
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'Razed';
      src: url('${razedBoldUrl}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }

    @font-face {
      font-family: 'Razed';
      src: url('${razedLightUrl}') format('truetype');
      font-weight: 300;
      font-style: normal;
    }

    @font-face {
      font-family: 'Razed';
      src: url('${razedTrendUrl}') format('truetype');
      font-weight: 500;
      font-style: normal;
    }

    @font-face {
      font-family: 'SF Pro Text';
      src: url('${sfProTextLightUrl}') format('opentype');
      font-weight: 300;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'SF Pro Text';
      src: url('${sfProTextRegularUrl}') format('opentype');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'SF Pro Text';
      src: url('${sfProTextMediumUrl}') format('opentype');
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'SF Pro Text';
      src: url('${sfProTextSemiboldUrl}') format('opentype');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'SF Pro Text';
      src: url('${sfProTextBoldUrl}') format('opentype');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'SF Pro Display';
      src: url('${sfProDisplayLightUrl}') format('opentype');
      font-weight: 300;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'SF Pro Display';
      src: url('${sfProDisplayRegularUrl}') format('opentype');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'SF Pro Display';
      src: url('${sfProDisplayMediumUrl}') format('opentype');
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'SF Pro Display';
      src: url('${sfProDisplaySemiboldUrl}') format('opentype');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'SF Pro Display';
      src: url('${sfProDisplayBoldUrl}') format('opentype');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
  `;
  
  document.head.appendChild(style);
}

// Auto-load fonts when module is imported
loadFonts(); 