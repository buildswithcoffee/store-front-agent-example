export const metadata = { title: 'jev' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', maxWidth: 600, margin: '40px auto' }}>
        {children}
      </body>
    </html>
  );
}
