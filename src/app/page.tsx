import { redirect } from 'next/navigation';
// Deferred auth, ChatGPT-style: no marketing wall, no login wall.
// The product IS the landing page.
export default function Home() {
  redirect('/chat');
}
