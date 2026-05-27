import './globals.css';

export const metadata = {
  title: 'SCL Custom Janus Dialer',
  description: 'Browser-based softphone using Janus Gateway',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
