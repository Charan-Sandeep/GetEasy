import "./globals.css";

export const metadata = {
  title: "Subject Guide",
  description: "AI-powered study assistant",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}