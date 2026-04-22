import { Geist, Geist_Mono, Space_Grotesk, Fira_Code } from 'next/font/google';
import './globals.css';
import DataProvider from './providers/DataProvider.jsx';
import { ThemeProvider } from './providers/ThemeProvider.jsx';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const spaceGrotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const firaCode = Fira_Code({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
});

export const metadata = {
  title: 'AI Supply Chain - Anti-Fragile Command Center',
  description: 'Real-time multi-agent AI supply chain disruption detection and resolution.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    title: 'AI Supply Chain Command Center',
    description: 'Detect, score, and resolve shipping disruptions in under 60 seconds.',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${firaCode.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <DataProvider>{children}</DataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
