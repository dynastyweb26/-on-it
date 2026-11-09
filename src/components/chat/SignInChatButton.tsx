'use client';

// The "Sign in" button under the signed-out assistant message. Existing gold
// button (.al-btn-g) and spinner; the state machine is lib/chat-signed-out.ts.
// A synchronous ref guards repeat taps; pending clears on error and on unmount.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SIGN_IN_HREF, SIGN_IN_PENDING_MS, signInLabel, signInStep, type SignInState } from '@/lib/chat-signed-out';
import '@/components/alive/alive.css';

export default function SignInChatButton() {
  const router = useRouter();
  const [state, setState] = useState<SignInState>('idle');
  const stateRef = useRef<SignInState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function apply(event: 'tap' | 'timeout') {
    const step = signInStep(stateRef.current, event);
    stateRef.current = step.state;
    setState(step.state);
    return step;
  }

  function onTap() {
    const step = apply('tap');
    if (!step.navigate) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply('timeout'), SIGN_IN_PENDING_MS);
    router.push(SIGN_IN_HREF);
  }

  return (
    <button
      type="button"
      className="al-btn-g"
      aria-busy={state === 'pending'}
      aria-disabled={state === 'pending'}
      onClick={onTap}
    >
      {state === 'pending' && <span className="al-spinner" />}
      {signInLabel(state)}
    </button>
  );
}
