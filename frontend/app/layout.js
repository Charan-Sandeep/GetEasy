import "./globals.css";

export const metadata = {
  title: 'Subject Guide Assistant',
  description: 'Grounded subject study and question-bank assistant',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
