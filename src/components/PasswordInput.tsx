'use client';
import { forwardRef, useState } from 'react';
import Icon from '@/components/Icon';

/* Password field with a show/hide toggle (Design Standard §8 input + §4 icons).
   Defaults to hidden. The toggle lives INSIDE the field on the right, is a full
   56px touch target (spacing.touch, ≥44px), and carries an aria-label that
   tracks state ("Show password" / "Hide password"). Each instance owns its own
   visibility state, so a screen with both password and confirm-password fields
   gets two independent toggles for free.

   Forwards the ref to the underlying <input> so callers that focus the field
   programmatically (login flips to sign-in and focuses the password) keep working. */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className = 'input', ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false); // hidden by default
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        // Room on the right so typed text never runs under the toggle.
        className={`${className} pr-touch`}
        {...rest}
      />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-touch place-items-center text-on-surface-variant"
      >
        <Icon name={visible ? 'visibility_off' : 'visibility'} size={22} />
      </button>
    </div>
  );
});

export default PasswordInput;
